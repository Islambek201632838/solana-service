"""Solana Reader — async pool state fetching with TTL cache."""

import time
import struct
import base64

import aiohttp

from app.config import Settings


class SolanaReader:
    def __init__(self, settings: Settings):
        self.rpc_url = settings.solana_rpc_url
        self.pool_address = settings.pool_address or settings.pool_authority
        self._cache: dict | None = None
        self._cache_time: float = 0
        self._cache_ttl: float = 30.0
        self._session: aiohttp.ClientSession | None = None

    async def get_pool_state(self) -> dict:
        """Get pool state with 30s TTL cache."""
        now = time.time()
        if self._cache and (now - self._cache_time) < self._cache_ttl:
            return self._cache

        state = await self._fetch_pool()
        if "error" not in state:
            self._cache = state
            self._cache_time = now
        return state

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _fetch_pool(self) -> dict:
        if not self.pool_address:
            return {"error": "No pool_authority configured"}

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [self.pool_address, {"encoding": "base64"}],
        }
        try:
            session = await self._get_session()
            async with session.post(self.rpc_url, json=payload) as resp:
                result = await resp.json()
                account = result.get("result", {}).get("value")
                if not account:
                    return {"error": "Pool account not found"}
                raw = base64.b64decode(account["data"][0])
                return self._deserialize(raw)
        except Exception as e:
            return {"error": str(e)}

    def _deserialize(self, raw: bytes) -> dict:
        offset = 8  # Anchor discriminator

        def read_pubkey():
            nonlocal offset
            val = base64.b64encode(raw[offset:offset + 32]).decode()
            offset += 32
            return val

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
                "keeper_reward_bps": read_u16(),
                "last_update": read_i64(),
                "update_cooldown": read_i64(),
                "bump": read_u8(),
                "vault_bump": read_u8(),
            }

            total = pool["total_deposits"]
            pool["utilization"] = pool["total_borrows"] / total if total > 0 else 0.0

            mood_map = {0: "Thriving", 1: "Calm", 2: "Cautious", 3: "Defensive", 4: "Emergency"}
            pool["mood_str"] = mood_map.get(pool["current_mood"], "Unknown")

            return pool
        except Exception as e:
            return {"error": f"Deserialization failed: {e}"}
