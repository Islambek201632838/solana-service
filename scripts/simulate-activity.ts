/**
 * Simulate realistic lending activity with multiple users.
 * Runs continuously — random borrow/repay every 2-5 minutes.
 *
 * This is SEPARATE from AI agent (which runs every 11 min).
 * AI agent adjusts RATES. This script simulates USER ACTIVITY.
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/simulate-activity.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
  createAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import * as fs from "fs";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function logActivity(action: string, user: string, amount: number, token: string, txSig: string, util: number, rate: number) {
  try {
    await fetch("http://localhost:8000/api/activity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, user, amount, token, tx_signature: txSig, pool_util_after: util, rate_at_time: rate }),
    });
  } catch {}
}

// Simulated user wallets
const USER_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];

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

  console.log("=== ACTIVITY SIMULATOR ===");
  console.log("Pool:", poolPDA.toString());
  console.log("Running random borrow/repay every 2-5 min...\n");

  let cycle = 0;

  while (true) {
    cycle++;
    const poolState = await program.account.lendingPool.fetch(poolPDA);
    const position = await program.account.userPosition.fetch(positionPDA);

    const deposits = poolState.totalDeposits.toNumber() / 1e6;
    const borrows = poolState.totalBorrows.toNumber() / 1e6;
    const liquidity = poolState.availableLiquidity.toNumber() / 1e6;
    const collateral = position.collateralSol.toNumber() / LAMPORTS_PER_SOL;
    const borrowed = position.borrowed.toNumber() / 1e6;
    const rate = poolState.interestRateBps / 100;
    const util = deposits > 0 ? (borrows / deposits) * 100 : 0;
    const solPrice = poolState.solPriceUsd.toNumber() / 1e6;
    const maxBorrow = (collateral * solPrice / (poolState.collateralRatioBps / 10000)) - borrowed;

    const userName = USER_NAMES[cycle % USER_NAMES.length];
    const userLabel = `${userName} (${deployer.publicKey.toString().slice(0, 6)}...)`;

    console.log(`[${new Date().toLocaleTimeString()}] Cycle ${cycle}: util=${util.toFixed(1)}% borrows=$${borrows} rate=${rate}%`);

    // Decide action + amount based on risk appetite
    let action: string;
    let amount: number;
    const risk = Math.random();

    if (util > 70) {
      // DANGEROUS: pool almost empty → force repay
      action = "repay";
      amount = Math.min(rand(50, 150), borrowed);
    } else if (util > 50 && risk > 0.4) {
      // HIGH UTIL: lean towards repay
      action = "repay";
      amount = Math.min(rand(30, 100), borrowed);
    } else if (util < 15 && risk > 0.3) {
      // LOW UTIL: aggressive borrow
      action = "borrow";
      // High risk: big amounts
      if (risk > 0.8) {
        amount = Math.min(rand(100, 200), Math.floor(maxBorrow), Math.floor(liquidity)); // aggressive
      } else if (risk > 0.5) {
        amount = Math.min(rand(50, 100), Math.floor(maxBorrow), Math.floor(liquidity)); // medium
      } else {
        amount = Math.min(rand(10, 50), Math.floor(maxBorrow), Math.floor(liquidity)); // conservative
      }
    } else if (borrowed > 0 && risk > 0.5) {
      action = "repay";
      // Random repay size
      if (risk > 0.9) {
        amount = borrowed; // repay ALL (rare)
      } else if (risk > 0.7) {
        amount = Math.min(rand(50, 100), borrowed); // big repay
      } else {
        amount = Math.min(rand(10, 30), borrowed); // small repay
      }
    } else {
      action = "borrow";
      if (risk > 0.8) {
        amount = Math.min(rand(80, 150), Math.floor(maxBorrow), Math.floor(liquidity));
      } else {
        amount = Math.min(rand(20, 60), Math.floor(maxBorrow), Math.floor(liquidity));
      }
    }

    if (amount <= 0) {
      console.log(`  Skip: ${action} amount=${amount} (no room)`);
    } else {
      const lamports = amount * 1_000_000;
      console.log(`  ${userName}: ${action} ${amount} aiUSDC...`);

      try {
        let tx: string;
        if (action === "borrow") {
          tx = await program.methods.borrow(new anchor.BN(lamports))
            .accounts({
              pool: poolPDA, poolVault: vaultPDA, tokenMint,
              userPosition: positionPDA, userTokenAccount: userAta,
              owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            }).rpc();
        } else {
          tx = await program.methods.repay(new anchor.BN(lamports))
            .accounts({
              pool: poolPDA, poolVault: vaultPDA, tokenMint,
              userPosition: positionPDA, userTokenAccount: userAta,
              owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
            }).rpc();
        }

        const pAfter = await program.account.lendingPool.fetch(poolPDA);
        const utilAfter = pAfter.totalDeposits.toNumber() > 0
          ? (pAfter.totalBorrows.toNumber() / pAfter.totalDeposits.toNumber()) * 100 : 0;
        const rateAfter = pAfter.interestRateBps / 100;

        await logActivity(action, userLabel, amount, "aiUSDC", tx, utilAfter, rateAfter);
        console.log(`  OK! util=${utilAfter.toFixed(1)}% rate=${rateAfter}% TX=${tx.slice(0, 12)}...`);
      } catch (e: any) {
        console.log(`  Error: ${e.message?.slice(0, 80)}`);
      }
    }

    // Wait 10 minutes (same as AI cycle, no rate limit issues)
    // 1 borrow/repay TX per 10 min = 6 TX/hour = no rate limit
    console.log(`  Next in 10 min...\n`);
    await sleep(10 * 60 * 1000);
  }
}

main().catch(console.error);
