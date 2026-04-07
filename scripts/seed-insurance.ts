/**
 * One-shot script: seed insurance fund by creating large borrows,
 * accruing interest over time, and repaying.
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/seed-insurance.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from "fs";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
  const pool = await (program.account as any).lendingPool.fetch(poolPDA);
  const tokenMint = pool.tokenMint;
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()], programId
  );
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );
  const deployerAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);

  console.log("=== SEED INSURANCE FUND ===\n");

  // 1. Check current state
  const pos = await (program.account as any).userPosition.fetch(positionPDA);
  const currentCollateral = pos.collateralSol.toNumber() / LAMPORTS_PER_SOL;
  const currentBorrowed = pos.borrowed.toNumber() / 1e6;
  const solPrice = pool.solPriceUsd.toNumber() / 1e6;
  const colRatio = pool.collateralRatioBps / 10000;
  const liquidity = pool.availableLiquidity.toNumber() / 1e6;
  const insuranceBefore = pool.insuranceBalance.toNumber() / 1e6;

  console.log(`SOL price: $${solPrice}`);
  console.log(`Current collateral: ${currentCollateral} SOL`);
  console.log(`Current borrowed: $${currentBorrowed}`);
  console.log(`Liquidity: $${liquidity}`);
  console.log(`Insurance before: $${insuranceBefore}`);
  console.log(`Collateral ratio: ${colRatio * 100}%`);

  // 2. Airdrop SOL for collateral
  const airdropAmount = 5;
  console.log(`\n[1/6] Airdropping ${airdropAmount} SOL...`);
  try {
    const sig = await connection.requestAirdrop(deployer.publicKey, airdropAmount * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("  Airdrop OK");
  } catch (e: any) {
    console.log(`  Airdrop failed (may already have SOL): ${e.message?.slice(0, 60)}`);
  }
  await sleep(2000);

  // 3. Deposit collateral
  const collateralLamports = Math.floor(3 * LAMPORTS_PER_SOL); // deposit 3 SOL
  console.log(`\n[2/6] Depositing 3 SOL as collateral...`);
  try {
    const tx = await (program.methods as any).depositCollateral(new anchor.BN(collateralLamports))
      .accounts({
        pool: poolPDA,
        userPosition: positionPDA,
        owner: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  TX: ${tx.slice(0, 20)}...`);
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 100)}`);
  }
  await sleep(2000);

  // 4. Borrow a large amount
  const posAfterCol = await (program.account as any).userPosition.fetch(positionPDA);
  const newCollateral = posAfterCol.collateralSol.toNumber() / LAMPORTS_PER_SOL;
  const newBorrowed = posAfterCol.borrowed.toNumber() / 1e6;
  const maxBorrow = Math.max(0, (newCollateral * solPrice / colRatio) - newBorrowed);
  const borrowAmount = Math.min(Math.floor(maxBorrow * 0.8), Math.floor(liquidity * 0.5));

  console.log(`\n[3/6] Borrowing $${borrowAmount} (maxBorrow=$${maxBorrow.toFixed(0)})...`);
  if (borrowAmount < 10) {
    console.log("  Not enough to borrow, skipping...");
  } else {
    try {
      const tx = await (program.methods as any).borrow(new anchor.BN(borrowAmount * 1_000_000))
        .accounts({
          pool: poolPDA, poolVault: vaultPDA, tokenMint,
          userPosition: positionPDA, userTokenAccount: deployerAta,
          owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  TX: ${tx.slice(0, 20)}...`);
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 100)}`);
    }
  }

  // 5. Wait for interest to accrue (longer = more interest)
  console.log(`\n[4/6] Waiting 60 seconds for interest to accrue...`);
  await sleep(60_000);

  // 6. Accrue interest
  console.log(`\n[5/6] Accruing interest...`);
  try {
    const tx = await (program.methods as any).accrueInterest()
      .accounts({ pool: poolPDA, userPosition: positionPDA })
      .rpc();
    console.log(`  TX: ${tx.slice(0, 20)}...`);
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 100)}`);
  }
  await sleep(2000);

  // Check accrued interest
  const posAfterAccrue = await (program.account as any).userPosition.fetch(positionPDA);
  const accruedInterest = posAfterAccrue.accruedInterest.toNumber() / 1e6;
  const totalBorrowed = posAfterAccrue.borrowed.toNumber() / 1e6;
  console.log(`  Accrued interest: $${accruedInterest.toFixed(6)}`);
  console.log(`  Total borrowed: $${totalBorrowed}`);

  // 7. Repay everything (principal + interest) -> insurance fund gets 10% of interest
  const totalOwed = totalBorrowed + accruedInterest;
  const repayAmount = Math.ceil(totalOwed * 1_000_000); // round up
  console.log(`\n[6/6] Repaying $${totalOwed.toFixed(6)} (interest $${accruedInterest.toFixed(6)})...`);
  console.log(`  Expected insurance cut: $${(accruedInterest * 0.1).toFixed(6)}`);

  try {
    const tx = await (program.methods as any).repay(new anchor.BN(repayAmount))
      .accounts({
        pool: poolPDA, poolVault: vaultPDA, tokenMint,
        userPosition: positionPDA, userTokenAccount: deployerAta,
        owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`  TX: ${tx.slice(0, 20)}...`);
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 100)}`);
  }
  await sleep(2000);

  // 8. Check results
  const poolAfter = await (program.account as any).lendingPool.fetch(poolPDA);
  const insuranceAfter = poolAfter.insuranceBalance.toNumber() / 1e6;
  const badDebt = poolAfter.totalBadDebtCovered.toNumber() / 1e6;
  console.log(`\n=== RESULTS ===`);
  console.log(`Insurance before: $${insuranceBefore.toFixed(6)}`);
  console.log(`Insurance after:  $${insuranceAfter.toFixed(6)}`);
  console.log(`Insurance delta:  $${(insuranceAfter - insuranceBefore).toFixed(6)}`);
  console.log(`Bad debt covered: $${badDebt.toFixed(6)}`);

  if (insuranceAfter > insuranceBefore) {
    console.log(`\n✓ Insurance fund is now active!`);
  } else {
    console.log(`\n✗ Insurance still $0 — interest may be too small. Try running again after more time.`);
  }
}

main().catch(console.error);
