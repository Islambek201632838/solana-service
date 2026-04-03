"""Data Collector — async fetching of market data and on-chain state.

Uses aiohttp for all HTTP requests. All fetch functions are independent
and run in parallel via asyncio.gather.
"""

import asyncio
import struct
import base64
import json
from typing import Any

import aiohttp

from config import Settings


class DataCollector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=15)
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    # ==========================================
    # CoinGecko: SOL price + history
    # ==========================================

    async def fetch_sol_price(self) -> dict[str, Any]:
        """Fetch current SOL/USD price from CoinGecko."""
        session = await self._get_session()
        url = f"{self.settings.coingecko_url}/simple/price"
        params = {
            "ids": "solana",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true",
        }
        try:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                sol = data.get("solana", {})
                return {
                    "sol_price": sol.get("usd", 0),
                    "price_change_24h": sol.get("usd_24h_change", 0),
                    "volume_24h": sol.get("usd_24h_vol", 0),
                }
        except Exception as e:
            print(f"[ERROR] fetch_sol_price: {e}")
            return {"sol_price": 0, "price_change_24h": 0, "volume_24h": 0}

    async def fetch_price_history(self, days: int = 1) -> dict[str, Any]:
        """Fetch SOL price history from CoinGecko (hourly for 1d)."""
        session = await self._get_session()
        url = f"{self.settings.coingecko_url}/coins/solana/market_chart"
        params = {"vs_currency": "usd", "days": str(days)}
        try:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                prices = [p[1] for p in data.get("prices", [])]
                volumes = [v[1] for v in data.get("total_volumes", [])]
                return {
                    "prices": prices,
                    "volumes": volumes,
                    "data_points": len(prices),
                }
        except Exception as e:
            print(f"[ERROR] fetch_price_history: {e}")
            return {"prices": [], "volumes": [], "data_points": 0}

    # ==========================================
    # Jupiter: market data
    # ==========================================

    async def fetch_market_cap(self) -> dict[str, Any]:
        """Fetch SOL market cap and rank from CoinGecko."""
        session = await self._get_session()
        url = f"{self.settings.coingecko_url}/coins/solana"
        params = {
            "localization": "false",
            "tickers": "false",
            "community_data": "false",
            "developer_data": "false",
        }
        try:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                market = data.get("market_data", {})
                return {
                    "market_cap_usd": market.get("market_cap", {}).get("usd", 0),
                    "market_cap_rank": data.get("market_cap_rank", 0),
                    "total_supply": market.get("total_supply", 0),
                    "circulating_supply": market.get("circulating_supply", 0),
                    "ath_usd": market.get("ath", {}).get("usd", 0),
                    "price_change_7d": market.get("price_change_percentage_7d", 0),
                    "price_change_30d": market.get("price_change_percentage_30d", 0),
                }
        except Exception as e:
            print(f"[ERROR] fetch_market_cap: {e}")
            return {"market_cap_usd": 0, "market_cap_rank": 0}

    # ==========================================
    # Solana RPC: pool state
    # ==========================================

    async def fetch_pool_state(self, pool_pubkey: str) -> dict[str, Any]:
        """Fetch and deserialize LendingPool account from Solana RPC."""
        session = await self._get_session()
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [pool_pubkey, {"encoding": "base64"}],
        }
        try:
            async with session.post(
                self.settings.solana_rpc_url, json=payload
            ) as resp:
                result = await resp.json()
                account = result.get("result", {}).get("value")
                if not account:
                    return {"error": "Pool account not found"}

                data_b64 = account["data"][0]
                raw = base64.b64decode(data_b64)
                return self._deserialize_pool(raw)
        except Exception as e:
            print(f"[ERROR] fetch_pool_state: {e}")
            return {"error": str(e)}

    def _deserialize_pool(self, raw: bytes) -> dict[str, Any]:
        """Deserialize LendingPool account data (skip 8-byte discriminator)."""
        offset = 8  # Anchor discriminator

        def read_pubkey():
            nonlocal offset
            val = raw[offset : offset + 32]
            offset += 32
            from solders.pubkey import Pubkey
            return str(Pubkey.from_bytes(val))

        def read_u64():
            nonlocal offset
            val = struct.unpack_from("<Q", raw, offset)[0]
            offset += 8
            return val

        def read_u16():
            nonlocal offset
            val = struct.unpack_from("<H", raw, offset)[0]
            offset += 2
            return val

        def read_i64():
            nonlocal offset
            val = struct.unpack_from("<q", raw, offset)[0]
            offset += 8
            return val

        def read_u8():
            nonlocal offset
            val = raw[offset]
            offset += 1
            return val

        def read_bool():
            nonlocal offset
            val = raw[offset] != 0
            offset += 1
            return val

        try:
            pool = {
                "authority": read_pubkey(),
                "ai_agent": read_pubkey(),
                "token_mint": read_pubkey(),
                "total_deposits": read_u64(),
                "total_borrows": read_u64(),
                "available_liquidity": read_u64(),
                "total_collateral_sol": read_u64(),
                "interest_rate_bps": read_u16(),
                "collateral_ratio_bps": read_u16(),
                "max_borrow_limit": read_u64(),
                "liquidation_threshold_bps": read_u16(),
                "max_interest_rate_bps": read_u16(),
                "min_interest_rate_bps": read_u16(),
                "min_collateral_ratio_bps": read_u16(),
                "max_collateral_ratio_bps": read_u16(),
                "sol_price_usd": read_u64(),
                "total_deposits_count": read_u64(),
                "total_borrows_count": read_u64(),
                "total_ai_updates": read_u64(),
                "total_ai_skips": read_u64(),
                "total_liquidations": read_u64(),
                "current_mood": read_u8(),
                "is_frozen": read_bool(),
                "protocol_created_at": read_i64(),
                "last_update": read_i64(),
                "update_cooldown": read_i64(),
                "bump": read_u8(),
                "vault_bump": read_u8(),
            }

            # Compute utilization
            total = pool["total_deposits"]
            if total > 0:
                pool["utilization"] = pool["total_borrows"] / total
            else:
                pool["utilization"] = 0.0

            mood_map = {0: "Thriving", 1: "Calm", 2: "Cautious", 3: "Defensive", 4: "Emergency"}
            pool["mood_str"] = mood_map.get(pool["current_mood"], "Unknown")

            return pool
        except Exception as e:
            return {"error": f"Deserialization failed: {e}"}

    # ==========================================
    # Build full context
    # ==========================================

    async def build_context(self, pool_pubkey: str) -> dict[str, Any]:
        """Fetch all data in parallel and return unified context dict."""
        sol_price, price_history, market_cap, pool_state = await asyncio.gather(
            self.fetch_sol_price(),
            self.fetch_price_history(days=1),
            self.fetch_market_cap(),
            self.fetch_pool_state(pool_pubkey),
        )

        return {
            "market": {
                **sol_price,
                **market_cap,
            },
            "price_history": price_history,
            "pool": pool_state,
        }


# ==========================================
# CLI entrypoint for testing
# ==========================================

async def main():
    settings = Settings()
    collector = DataCollector(settings)

    try:
        print("[DATA COLLECTOR] Fetching data...")

        sol_price = await collector.fetch_sol_price()
        print(f"\n  SOL Price: ${sol_price['sol_price']:.2f}")
        print(f"  24h Change: {sol_price['price_change_24h']:.2f}%")

        history = await collector.fetch_price_history()
        print(f"\n  Price History: {history['data_points']} data points")
        if history["prices"]:
            print(f"  Range: ${min(history['prices']):.2f} - ${max(history['prices']):.2f}")

        market_cap = await collector.fetch_market_cap()
        print(f"\n  Market Cap: ${market_cap['market_cap_usd']:,.0f}")
        print(f"  Rank: #{market_cap['market_cap_rank']}")

        print("\n[OK] Data collection complete")
    finally:
        await collector.close()


if __name__ == "__main__":
    asyncio.run(main())
