/**
 * Auto-demo: simulate heavy lending activity + log to backend.
 * Uses 10 SOL to create real utilization.
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/auto-demo.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from "fs";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function logActivity(action: string, user: string, amount: number, token: string, txSig: string, util: number, rate: number) {
  try {
    await fetch("http://localhost:8000/api/activity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, user, amount, token, tx_signature: txSig, pool_util_after: util, rate_at_time: rate }),
    });
  } catch { /* backend may not be running locally */ }
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
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );
  const userAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);

  const balance = await connection.getBalance(deployer.publicKey);
  console.log("=== AUTO DEMO (with 10 SOL) ===");
  console.log("Deployer:", deployer.publicKey.toString());
  console.log("Balance:", (balance / LAMPORTS_PER_SOL).toFixed(2), "SOL\n");

  let position: any;
  try { position = await program.account.userPosition.fetch(positionPDA); }
  catch { position = { borrowed: new anchor.BN(0), collateralSol: new anchor.BN(0) }; }

  const currentBorrow = position.borrowed.toNumber();
  console.log("Current borrow:", currentBorrow / 1e6, "aiUSDC");
  console.log("Current collateral:", position.collateralSol.toNumber() / LAMPORTS_PER_SOL, "SOL\n");

  const user = deployer.publicKey.toString().slice(0, 8) + "...";

  // Step 1: Repay if outstanding
  if (currentBorrow > 0) {
    console.log(`[1] Repaying ${currentBorrow / 1e6} aiUSDC...`);
    try {
      const tx = await program.methods.repay(new anchor.BN(currentBorrow))
        .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint, userPosition: positionPDA, userTokenAccount: userAta, owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      console.log("  TX:", tx);
      await logActivity("repay", user, currentBorrow / 1e6, "aiUSDC", tx, 0, pool.interestRateBps / 100);
    } catch (e: any) { console.log("  Error:", e.message?.slice(0, 100)); }
    await sleep(2000);
  }

  // Step 2: Deposit 5 SOL collateral
  console.log("[2] Depositing 5 SOL collateral...");
  try {
    const tx = await program.methods.depositCollateral(new anchor.BN(5 * LAMPORTS_PER_SOL))
      .accounts({ pool: poolPDA, userPosition: positionPDA, owner: deployer.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("  TX:", tx);
    await logActivity("deposit_collateral", user, 5, "SOL", tx, 0, pool.interestRateBps / 100);
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 100)); }
  await sleep(2000);

  // Step 3: Borrow 300 aiUSDC (5+existing SOL ≈ $800 collateral, ratio 120% → max ~$666)
  console.log("[3] Borrowing 300 aiUSDC...");
  try {
    const tx = await program.methods.borrow(new anchor.BN(300_000_000))
      .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint, userPosition: positionPDA, userTokenAccount: userAta, owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("  TX:", tx);
    let p = await program.account.lendingPool.fetch(poolPDA);
    let u = p.totalBorrows.toNumber() / p.totalDeposits.toNumber();
    await logActivity("borrow", user, 300, "aiUSDC", tx, u * 100, p.interestRateBps / 100);
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 100)); }
  await sleep(2000);

  // Step 4: Borrow 200 more
  console.log("[4] Borrowing 200 more aiUSDC...");
  try {
    const tx = await program.methods.borrow(new anchor.BN(200_000_000))
      .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint, userPosition: positionPDA, userTokenAccount: userAta, owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("  TX:", tx);
    let p = await program.account.lendingPool.fetch(poolPDA);
    let u = p.totalBorrows.toNumber() / p.totalDeposits.toNumber();
    await logActivity("borrow", user, 200, "aiUSDC", tx, u * 100, p.interestRateBps / 100);
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 100)); }
  await sleep(2000);

  // Step 5: Repay 100 (partial)
  console.log("[5] Repaying 100 aiUSDC...");
  try {
    const tx = await program.methods.repay(new anchor.BN(100_000_000))
      .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint, userPosition: positionPDA, userTokenAccount: userAta, owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    console.log("  TX:", tx);
    let p = await program.account.lendingPool.fetch(poolPDA);
    let u = p.totalBorrows.toNumber() / p.totalDeposits.toNumber();
    await logActivity("repay", user, 100, "aiUSDC", tx, u * 100, p.interestRateBps / 100);
  } catch (e: any) { console.log("  Error:", e.message?.slice(0, 100)); }

  // Final state
  const poolAfter = await program.account.lendingPool.fetch(poolPDA);
  const posAfter = await program.account.userPosition.fetch(positionPDA);
  const util = poolAfter.totalBorrows.toNumber() / poolAfter.totalDeposits.toNumber();

  console.log("\n=== FINAL STATE ===");
  console.log("Deposits:", poolAfter.totalDeposits.toNumber() / 1e6, "aiUSDC");
  console.log("Borrows:", poolAfter.totalBorrows.toNumber() / 1e6, "aiUSDC");
  console.log("Utilization:", (util * 100).toFixed(1), "%");
  console.log("Rate:", poolAfter.interestRateBps / 100, "%");
  console.log("Collateral:", posAfter.collateralSol.toNumber() / LAMPORTS_PER_SOL, "SOL");
  console.log("\n→ AI should see", (util * 100).toFixed(1), "% utilization and adjust rate next cycle!");
}

main().catch(console.error);
