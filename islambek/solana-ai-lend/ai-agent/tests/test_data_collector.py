"""Tests for DataCollector — verifies async fetching returns correct structure."""

import asyncio
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent.data_collector import DataCollector
from config import Settings


@pytest.fixture
def settings():
    return Settings(
        gemini_api_key="test-key",
        program_id="HfTwgCwDTHpfrCKkgrruiuHaMKj79AVjyQSTwyoH9NVy",
    )


@pytest.fixture
def collector(settings):
    return DataCollector(settings)


@pytest.mark.asyncio
async def test_fetch_sol_price(collector):
    data = await collector.fetch_sol_price()
    await collector.close()

    assert "sol_price" in data
    assert "price_change_24h" in data
    assert "volume_24h" in data
    assert isinstance(data["sol_price"], (int, float))
    print(f"  SOL price: ${data['sol_price']}")


@pytest.mark.asyncio
async def test_fetch_price_history(collector):
    data = await collector.fetch_price_history(days=1)
    await collector.close()

    assert "prices" in data
    assert "volumes" in data
    assert "data_points" in data
    assert isinstance(data["prices"], list)
    print(f"  Got {data['data_points']} price data points")


@pytest.mark.asyncio
async def test_fetch_market_cap(collector):
    data = await collector.fetch_market_cap()
    await collector.close()

    assert "market_cap_usd" in data
    assert "market_cap_rank" in data
    assert isinstance(data["market_cap_usd"], (int, float))
    print(f"  Market cap: {data['market_cap_usd']}, rank: {data['market_cap_rank']}")


@pytest.mark.asyncio
async def test_build_context(collector):
    ctx = await collector.build_context("11111111111111111111111111111111")
    await collector.close()

    assert "market" in ctx
    assert "price_history" in ctx
    assert "pool" in ctx
    assert "sol_price" in ctx["market"]
    assert "prices" in ctx["price_history"]
    print(f"  Context keys: {list(ctx.keys())}")


@pytest.mark.asyncio
async def test_pool_deserialize():
    """Test _deserialize_pool with synthetic data."""
    settings = Settings(
        gemini_api_key="test-key",
        program_id="test",
    )
    collector = DataCollector(settings)

    # Build minimal fake pool account data: 8 byte discriminator + fields
    import struct
    data = bytearray()
    data += b'\x00' * 8  # discriminator
    data += b'\x00' * 32  # authority
    data += b'\x00' * 32  # ai_agent
    data += b'\x00' * 32  # token_mint
    data += struct.pack('<Q', 1000)  # total_deposits
    data += struct.pack('<Q', 500)   # total_borrows
    data += struct.pack('<Q', 500)   # available_liquidity
    data += struct.pack('<Q', 2000000000)  # total_collateral_sol
    data += struct.pack('<H', 500)   # interest_rate_bps
    data += struct.pack('<H', 15000) # collateral_ratio_bps
    data += struct.pack('<Q', 10000) # max_borrow_limit
    data += struct.pack('<H', 12000) # liquidation_threshold_bps
    data += struct.pack('<H', 2000)  # max_interest_rate_bps
    data += struct.pack('<H', 100)   # min_interest_rate_bps
    data += struct.pack('<H', 12000) # min_collateral_ratio_bps
    data += struct.pack('<H', 20000) # max_collateral_ratio_bps
    data += struct.pack('<Q', 185000000)  # sol_price_usd
    data += struct.pack('<Q', 10)    # total_deposits_count
    data += struct.pack('<Q', 5)     # total_borrows_count
    data += struct.pack('<Q', 3)     # total_ai_updates
    data += struct.pack('<Q', 1)     # total_ai_skips
    data += struct.pack('<Q', 0)     # total_liquidations
    data += struct.pack('<B', 1)     # current_mood (Calm)
    data += struct.pack('<?', False) # is_frozen
    data += struct.pack('<q', 1700000000)  # protocol_created_at
    data += struct.pack('<q', 1700000600)  # last_update
    data += struct.pack('<q', 600)   # update_cooldown
    data += struct.pack('<B', 255)   # bump
    data += struct.pack('<B', 254)   # vault_bump

    result = collector._deserialize_pool(bytes(data))
    await collector.close()

    assert result["total_deposits"] == 1000
    assert result["total_borrows"] == 500
    assert result["interest_rate_bps"] == 500
    assert result["utilization"] == 0.5
    assert result["mood_str"] == "Calm"
    assert result["is_frozen"] == False
    print(f"  Deserialized: deposits={result['total_deposits']}, "
          f"borrows={result['total_borrows']}, util={result['utilization']}")
