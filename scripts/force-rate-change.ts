/**
 * Force AI to change rate by manipulating pool state.
 *
 * Strategy: deposit a lot, borrow most of it → high utilization → AI raises rate
 * Then repay → low utilization → AI lowers rate
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/force-rate-change.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccount, mintTo, createMint
} from "@solana/spl-token";
import * as fs from "fs";
import { execSync } from "child_process";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runAiCycle(): Promise<string> {
  try {
    const result = execSync(
      `docker exec docker-ai-agent-1 python -c "
from agent.orchestrator import Orchestrator
from config import Settings
import asyncio
async def run():
    s = Settings()
    o = Orchestrator(s)
    await o.logger.init_db()
    await o.run_cycle()
asyncio.run(run())
"`, { encoding: "utf-8", timeout: 90000 }
    );
    return result;
  } catch (e: any) {
    return e.stdout || e.message || "error";
  }
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const deployer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const idl = JSON.parse(fs.readFileSync("./target/idl/solana_ai_lend.json", "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), deployer.publicKey.toBuffer()], programId
  );

  const pool = await program.account.lendingPool.fetch(poolPDA);
  const tokenMint = pool.tokenMint;
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()], programId
  );

  console.log("=== FORCE RATE CHANGE DEMO ===\n");

  // Create a second user (borrower) with fresh keypair
  const borrower = Keypair.generate();
  console.log("[SETUP] Creating borrower:", borrower.publicKey.toString());

  // Transfer SOL from deployer to borrower
  const transferTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: deployer.publicKey,
      toPubkey: borrower.publicKey,
      lamports: 0.5 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(transferTx);
  console.log("[SETUP] Sent 2 SOL to borrower from deployer");

  // Create borrower token account
  const borrowerAta = await createAssociatedTokenAccount(
    connection, (deployer as any).payer, tokenMint, borrower.publicKey
  );
  console.log("[SETUP] Borrower ATA:", borrowerAta.toString());

  // Borrower position PDA
  const [borrowerPositionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), borrower.publicKey.toBuffer()], programId
  );

  // === PHASE 1: HIGH UTILIZATION ===
  console.log("\n=== PHASE 1: Creating HIGH utilization ===\n");

  // Borrower deposits 0.3 SOL collateral
  console.log("[1] Borrower deposits 0.3 SOL collateral...");
  try {
    await program.methods.depositCollateral(new anchor.BN(0.3 * LAMPORTS_PER_SOL))
      .accounts({
        pool: poolPDA, userPosition: borrowerPositionPDA,
        owner: borrower.publicKey, systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();
    console.log("  Done!");
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 150)); }

  // Borrower borrows 15 aiUSDC (collateral 0.3 SOL=$24, ratio 120% → max $20)
  console.log("[2] Borrower borrows 15 aiUSDC...");
  try {
    await program.methods.borrow(new anchor.BN(15_000_000))
      .accounts({
        pool: poolPDA, poolVault: vaultPDA, tokenMint,
        userPosition: borrowerPositionPDA, userTokenAccount: borrowerAta,
        owner: borrower.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();
    console.log("  Done!");
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 150)); }

  // Check state
  let poolState = await program.account.lendingPool.fetch(poolPDA);
  const util1 = poolState.totalBorrows.toNumber() / poolState.totalDeposits.toNumber();
  console.log(`\nPool: borrows=${poolState.totalBorrows.toNumber()/1e6} aiUSDC, util=${(util1*100).toFixed(1)}%, rate=${poolState.interestRateBps/100}%`);

  // Run AI cycle
  console.log("\n[3] Running AI cycle (should see utilization and react)...");
  const output1 = await runAiCycle();
  const lines1 = output1.split("\n").filter((l: string) => l.includes("CYCLE") || l.includes("TX"));
  lines1.forEach((l: string) => console.log("  " + l.trim()));

  // Check rate after
  poolState = await program.account.lendingPool.fetch(poolPDA);
  console.log(`\n>>> Rate AFTER AI: ${poolState.interestRateBps/100}% (was 1.20%)`);
  console.log(`>>> Mood: ${JSON.stringify(poolState.currentMood)}`);

  // === PHASE 2: LOWER UTILIZATION ===
  console.log("\n\n=== PHASE 2: Repaying → LOW utilization ===\n");

  // Borrower repays all
  const borrowerPos = await program.account.userPosition.fetch(borrowerPositionPDA);
  const repayAmount = borrowerPos.borrowed.toNumber();
  if (repayAmount > 0) {
    console.log(`[4] Borrower repays ${repayAmount/1e6} aiUSDC...`);
    try {
      await program.methods.repay(new anchor.BN(repayAmount))
        .accounts({
          pool: poolPDA, poolVault: vaultPDA, tokenMint,
          userPosition: borrowerPositionPDA, userTokenAccount: borrowerAta,
          owner: borrower.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower])
        .rpc();
      console.log("  Repaid!");
    } catch (e: any) { console.log("  Error:", e.message?.slice(0, 150)); }
  }

  // Wait cooldown
  console.log("[5] Waiting 15s for cooldown...");
  await sleep(15000);

  // Run AI again
  console.log("[6] Running AI cycle (should see low utilization)...");
  const output2 = await runAiCycle();
  const lines2 = output2.split("\n").filter((l: string) => l.includes("CYCLE") || l.includes("TX"));
  lines2.forEach((l: string) => console.log("  " + l.trim()));

  poolState = await program.account.lendingPool.fetch(poolPDA);
  console.log(`\n>>> Rate AFTER AI: ${poolState.interestRateBps/100}%`);
  console.log(`>>> Utilization: ${(poolState.totalBorrows.toNumber() / poolState.totalDeposits.toNumber() * 100).toFixed(1)}%`);
  console.log(`>>> Mood: ${JSON.stringify(poolState.currentMood)}`);

  console.log("\n=== DONE ===");
  console.log("Check the frontend — AI Decisions should show rate changes!");
}

main().catch(console.error);
