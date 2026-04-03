"""TX Builder — constructs and sends update_parameters transaction to Solana.

Signs with the AI agent keypair and submits to devnet/localnet.
"""

import json
import hashlib
import struct
from pathlib import Path

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solders.hash import Hash
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed, Finalized, Processed


RISK_LEVEL_MAP = {"low": 0, "medium": 1, "high": 2, "critical": 3}


class TxBuilder:
    def __init__(self, rpc_url: str, keypair_path: str, program_id: str):
        self.rpc_url = rpc_url
        self.program_id = Pubkey.from_string(program_id)
        self.keypair = self._load_keypair(keypair_path)
        self.client: AsyncClient | None = None

    def _load_keypair(self, path: str) -> Keypair:
        data = json.loads(Path(path).read_text())
        return Keypair.from_bytes(bytes(data))

    async def _get_client(self) -> AsyncClient:
        if self.client is None:
            self.client = AsyncClient(self.rpc_url)
        return self.client

    async def close(self):
        if self.client:
            await self.client.close()

    def derive_pool_pda(self, authority: Pubkey) -> tuple[Pubkey, int]:
        return Pubkey.find_program_address(
            [b"lending_pool", bytes(authority)], self.program_id
        )

    def derive_decision_log_pda(self, pool: Pubkey, update_number: int) -> tuple[Pubkey, int]:
        return Pubkey.find_program_address(
            [b"decision_log", bytes(pool), struct.pack("<Q", update_number)],
            self.program_id,
        )

    async def send_update_parameters(
        self,
        pool_authority: Pubkey,
        decision: dict,
        update_number: int,
    ) -> str | None:
        """Build and send update_parameters instruction.

        Returns TX signature string or None on failure.
        """
        client = await self._get_client()

        pool_pda, _ = self.derive_pool_pda(pool_authority)
        log_pda, _ = self.derive_decision_log_pda(pool_pda, update_number)

        # Build instruction data
        ix_data = self._encode_update_params(decision)

        # Accounts: pool (mut), decision_log (init/mut), ai_agent (signer/mut), system_program
        accounts = [
            AccountMeta(pool_pda, is_signer=False, is_writable=True),
            AccountMeta(log_pda, is_signer=False, is_writable=True),
            AccountMeta(self.keypair.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
        ]

        ix = Instruction(self.program_id, ix_data, accounts)

        for attempt in range(3):
            try:
                # Fresh blockhash each attempt
                blockhash_resp = await client.get_latest_blockhash(Finalized)
                blockhash = blockhash_resp.value.blockhash

                msg = Message.new_with_blockhash([ix], self.keypair.pubkey(), blockhash)
                tx = Transaction.new_unsigned(msg)
                tx.sign([self.keypair], blockhash)

                result = await client.send_transaction(tx)
                sig = str(result.value)
                print(f"[TX] Sent: {sig}")

                await client.confirm_transaction(result.value, Confirmed)
                print(f"[TX] Confirmed: {sig}")
                return sig

            except Exception as e:
                err = str(e)
                if "Blockhash not found" in err and attempt < 2:
                    print(f"[TX] Blockhash stale, retry {attempt + 1}/3...")
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                print(f"[ERROR] TX failed: {e}")
                return None

    def _encode_update_params(self, decision: dict) -> bytes:
        """Encode UpdateParams struct for Anchor instruction.

        Anchor discriminator (8 bytes) + serialized UpdateParams.
        """
        # Anchor discriminator for "update_parameters"
        discriminator = hashlib.sha256(b"global:update_parameters").digest()[:8]

        rate = decision["interest_rate_bps"]
        collateral = decision["collateral_ratio_bps"]
        max_borrow = decision["max_borrow_limit"]
        reasoning = decision["reasoning_short"].encode("utf-8")[:256]
        reasoning_hash = hashlib.sha256(reasoning).digest()
        confidence = decision["confidence"]
        risk_idx = RISK_LEVEL_MAP.get(decision["risk_level"], 1)

        data = bytearray()
        data += discriminator
        data += struct.pack("<H", rate)
        data += struct.pack("<H", collateral)
        data += struct.pack("<Q", max_borrow)
        data += reasoning_hash  # 32 bytes
        data += struct.pack("<I", len(reasoning))  # Borsh string: 4-byte length prefix
        data += reasoning
        data += struct.pack("<B", confidence)
        data += struct.pack("<B", risk_idx)

        return bytes(data)

    # ==========================================
    # AI Active Action: Set SOL Price
    # ==========================================

    async def send_set_sol_price(
        self, pool_authority: Pubkey, price_usd: int
    ) -> str | None:
        """AI agent updates SOL/USD price on-chain."""
        client = await self._get_client()
        pool_pda, _ = self.derive_pool_pda(pool_authority)

        discriminator = hashlib.sha256(b"global:set_sol_price").digest()[:8]
        ix_data = discriminator + struct.pack("<Q", price_usd)

        accounts = [
            AccountMeta(pool_pda, is_signer=False, is_writable=True),
            AccountMeta(self.keypair.pubkey(), is_signer=True, is_writable=False),
        ]

        ix = Instruction(self.program_id, bytes(ix_data), accounts)

        for attempt in range(3):
            try:
                blockhash_resp = await client.get_latest_blockhash(Finalized)
                blockhash = blockhash_resp.value.blockhash
                msg = Message.new_with_blockhash([ix], self.keypair.pubkey(), blockhash)
                tx = Transaction.new_unsigned(msg)
                tx.sign([self.keypair], blockhash)
                result = await client.send_transaction(tx)
                sig = str(result.value)
                await client.confirm_transaction(result.value, Confirmed)
                print(f"[TX] SOL price updated to ${price_usd / 1_000_000:.2f}: {sig}")
                return sig
            except Exception as e:
                if "Blockhash not found" in str(e) and attempt < 2:
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                print(f"[ERROR] set_sol_price TX failed: {e}")
                return None

    # ==========================================
    # AI Active Action: Liquidate
    # ==========================================

    async def send_liquidate(
        self,
        pool_authority: Pubkey,
        borrower: Pubkey,
        pool_vault_pda: Pubkey,
        borrower_token_account: Pubkey,
        token_program: Pubkey,
    ) -> str | None:
        """AI agent triggers liquidation of undercollateralized position."""
        client = await self._get_client()
        pool_pda, _ = self.derive_pool_pda(pool_authority)

        borrower_position_pda, _ = Pubkey.find_program_address(
            [b"user_position", bytes(pool_pda), bytes(borrower)],
            self.program_id,
        )

        discriminator = hashlib.sha256(b"global:liquidate").digest()[:8]

        accounts = [
            AccountMeta(pool_pda, is_signer=False, is_writable=True),
            AccountMeta(borrower_position_pda, is_signer=False, is_writable=True),
            AccountMeta(borrower, is_signer=False, is_writable=True),
            AccountMeta(self.keypair.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(pool_vault_pda, is_signer=False, is_writable=True),
            AccountMeta(borrower_token_account, is_signer=False, is_writable=True),
            AccountMeta(token_program, is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
        ]

        ix = Instruction(self.program_id, discriminator, accounts)

        for attempt in range(3):
            try:
                blockhash_resp = await client.get_latest_blockhash(Finalized)
                blockhash = blockhash_resp.value.blockhash
                msg = Message.new_with_blockhash([ix], self.keypair.pubkey(), blockhash)
                tx = Transaction.new_unsigned(msg)
                tx.sign([self.keypair], blockhash)
                result = await client.send_transaction(tx)
                sig = str(result.value)
                await client.confirm_transaction(result.value, Confirmed)
                print(f"[TX] Liquidation confirmed: {sig}")
                return sig
            except Exception as e:
                if "Blockhash not found" in str(e) and attempt < 2:
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                print(f"[ERROR] Liquidate TX failed: {e}")
                return None

    # ==========================================
    # AI Active Action: Emergency Freeze
    # ==========================================

    async def send_ai_emergency_freeze(self, pool_authority: Pubkey) -> str | None:
        """AI agent freezes protocol during anomaly."""
        client = await self._get_client()
        pool_pda, _ = self.derive_pool_pda(pool_authority)

        discriminator = hashlib.sha256(b"global:ai_emergency_freeze").digest()[:8]

        accounts = [
            AccountMeta(pool_pda, is_signer=False, is_writable=True),
            AccountMeta(self.keypair.pubkey(), is_signer=True, is_writable=False),
        ]

        ix = Instruction(self.program_id, discriminator, accounts)

        for attempt in range(3):
            try:
                blockhash_resp = await client.get_latest_blockhash(Finalized)
                blockhash = blockhash_resp.value.blockhash
                msg = Message.new_with_blockhash([ix], self.keypair.pubkey(), blockhash)
                tx = Transaction.new_unsigned(msg)
                tx.sign([self.keypair], blockhash)
                result = await client.send_transaction(tx)
                sig = str(result.value)
                await client.confirm_transaction(result.value, Confirmed)
                print(f"[TX] AI EMERGENCY FREEZE: {sig}")
                return sig
            except Exception as e:
                if "Blockhash not found" in str(e) and attempt < 2:
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                print(f"[ERROR] AI freeze TX failed: {e}")
                return None
