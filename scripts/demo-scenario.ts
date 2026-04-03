/**
 * Demo scenario: simulate borrowing to trigger AI rate changes.
 *
 * Flow:
 * 1. Deposit collateral (SOL)
 * 2. Borrow aiUSDC (creates utilization)
 * 3. Wait for AI cycle → AI sees utilization → changes rate
 * 4. Repay + withdraw
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/demo-scenario.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from "fs";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const deployer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const idl = JSON.parse(fs.readFileSync("./target/idl/solana_ai_lend.json", "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  const balance = await connection.getBalance(deployer.publicKey);
  console.log("Deployer:", deployer.publicKey.toString());
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  // Find pool PDA
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), deployer.publicKey.toBuffer()], programId
  );

  // Read pool state
  const pool = await program.account.lendingPool.fetch(poolPDA);
  const tokenMint = pool.tokenMint;
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()], programId
  );
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );

  console.log("Pool PDA:", poolPDA.toString());
  console.log("Token Mint:", tokenMint.toString());
  console.log("Current deposits:", pool.totalDeposits.toNumber() / 1e6, "aiUSDC");
  console.log("Current borrows:", pool.totalBorrows.toNumber() / 1e6, "aiUSDC");
  console.log("Current rate:", pool.interestRateBps / 100, "%");
  console.log("Utilization:", pool.totalDeposits.toNumber() > 0
    ? (pool.totalBorrows.toNumber() / pool.totalDeposits.toNumber() * 100).toFixed(1) + "%"
    : "0%");
  console.log();

  const action = process.argv[2] || "status";

  if (action === "deposit-collateral") {
    // Deposit 2 SOL as collateral
    const amount = 2 * LAMPORTS_PER_SOL;
    console.log("[ACTION] Depositing 1 SOL as collateral...");
    try {
      const tx = await program.methods
        .depositCollateral(new anchor.BN(amount))
        .accounts({
          pool: poolPDA,
          userPosition: positionPDA,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("  TX:", tx);
      console.log("  Done! 1 SOL deposited as collateral.");
    } catch (e: any) {
      console.log("  Error:", e.message?.slice(0, 200));
    }
  }

  else if (action === "borrow") {
    // Borrow aiUSDC — amount based on collateral value
    // 1 SOL ≈ $80, collateral ratio 120% → max borrow ≈ $66 ≈ 50 aiUSDC
    // With 3 SOL collateral ($240), ratio 120% → max ~$200 = 100 aiUSDC
    const borrowAmount = 100_000_000; // 100 aiUSDC
    console.log(`[ACTION] Borrowing ${borrowAmount / 1e6} aiUSDC...`);

    const userAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);

    try {
      const tx = await program.methods
        .borrow(new anchor.BN(borrowAmount))
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          userPosition: positionPDA,
          userTokenAccount: userAta,
          owner: deployer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("  TX:", tx);
      console.log(`  Done! Borrowed ${borrowAmount / 1e6} aiUSDC.`);
      console.log("  Utilization is now ~50% → AI should raise rate next cycle!");
    } catch (e: any) {
      console.log("  Error:", e.message?.slice(0, 200));
    }
  }

  else if (action === "repay") {
    // Repay all
    const position = await program.account.userPosition.fetch(positionPDA);
    const repayAmount = position.borrowed.toNumber();
    if (repayAmount === 0) {
      console.log("[ACTION] Nothing to repay.");
      return;
    }
    console.log(`[ACTION] Repaying ${repayAmount / 1e6} aiUSDC...`);

    const userAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);

    try {
      const tx = await program.methods
        .repay(new anchor.BN(repayAmount))
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          userPosition: positionPDA,
          userTokenAccount: userAta,
          owner: deployer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log("  TX:", tx);
      console.log("  Done! Loan repaid.");
    } catch (e: any) {
      console.log("  Error:", e.message?.slice(0, 200));
    }
  }

  else {
    console.log("Usage:");
    console.log("  npx tsx scripts/demo-scenario.ts status");
    console.log("  npx tsx scripts/demo-scenario.ts deposit-collateral");
    console.log("  npx tsx scripts/demo-scenario.ts borrow");
    console.log("  npx tsx scripts/demo-scenario.ts repay");
  }

  // Final state
  console.log("\n--- Pool state after action ---");
  const poolAfter = await program.account.lendingPool.fetch(poolPDA);
  console.log("Deposits:", poolAfter.totalDeposits.toNumber() / 1e6, "aiUSDC");
  console.log("Borrows:", poolAfter.totalBorrows.toNumber() / 1e6, "aiUSDC");
  console.log("Liquidity:", poolAfter.availableLiquidity.toNumber() / 1e6, "aiUSDC");
  console.log("Rate:", poolAfter.interestRateBps / 100, "%");
  console.log("Utilization:", poolAfter.totalDeposits.toNumber() > 0
    ? (poolAfter.totalBorrows.toNumber() / poolAfter.totalDeposits.toNumber() * 100).toFixed(1) + "%"
    : "0%");
  console.log("Mood:", JSON.stringify(poolAfter.currentMood));
  console.log("AI updates:", poolAfter.totalAiUpdates.toNumber());
}

main().catch(console.error);
