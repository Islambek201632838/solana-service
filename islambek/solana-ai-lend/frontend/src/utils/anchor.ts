import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";

const programId = import.meta.env.VITE_PROGRAM_ID;
const PROGRAM_ID = new PublicKey(programId || SystemProgram.programId);

export function getProvider(wallet: any, connection: Connection): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function derivePoolPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    PROGRAM_ID
  );
}

export function derivePositionPDA(pool: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), pool.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  );
}

export { PROGRAM_ID, BN };
