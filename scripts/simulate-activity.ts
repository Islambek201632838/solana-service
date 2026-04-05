/**
 * Simulate realistic lending activity with REAL multiple users.
 * Each user has their own keypair, position, and token account.
 * Targets utilization between 30-70% with periodic spikes.
 *
 * Prerequisites: run setup-devnet-users.ts first to create users.
 *
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/simulate-activity.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
// Cycle every 3 minutes (more activity)
const CYCLE_MS = (parseInt(process.env.CYCLE_MINUTES || "3")) * 60 * 1000;

async function logActivity(action: string, user: string, amount: number, token: string, txSig: string, util: number, rate: number) {
  try {
    await fetch(`${BACKEND_URL}/api/activity/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, user, amount, token, tx_signature: txSig, pool_util_after: util, rate_at_time: rate }),
    });
  } catch (e: any) {
    console.log(`  [LOG ERROR] ${e.message?.slice(0, 60)}`);
  }
}

interface UserWallet {
  name: string;
  keypair: Keypair;
  positionPDA: PublicKey;
  ata: PublicKey;
}

const USER_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
const KEYS_DIR = "./keys/users";

async function loadUsers(connection: anchor.web3.Connection, poolPDA: PublicKey, programId: PublicKey, tokenMint: PublicKey): Promise<UserWallet[]> {
  const users: UserWallet[] = [];
  for (const name of USER_NAMES) {
    const keyPath = path.join(KEYS_DIR, `${name.toLowerCase()}.json`);
    if (!fs.existsSync(keyPath)) continue;
    const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keyData));
    const [positionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), poolPDA.toBuffer(), keypair.publicKey.toBuffer()], programId
    );
    const ata = await getAssociatedTokenAddress(tokenMint, keypair.publicKey);
    users.push({ name, keypair, positionPDA, ata });
  }
  return users;
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

  // Load real user wallets + deployer
  let users = await loadUsers(connection, poolPDA, programId, tokenMint);

  // Always include deployer (biggest position)
  const [deployerPos] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );
  const deployerAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);
  users.unshift({ name: "Deployer", keypair: deployer.payer, positionPDA: deployerPos, ata: deployerAta });

  console.log("=== ACTIVITY SIMULATOR ===");
  console.log("Pool:", poolPDA.toString());
  console.log(`Users: ${users.map(u => u.name).join(", ")} (${users.length})`);
  console.log(`Cycle: every ${CYCLE_MS / 60000} min`);
  console.log(`Target utilization: 30-70%\n`);

  let cycle = 0;

  while (true) {
    cycle++;

    // Pick random user (deployer more often since bigger position)
    const weights = users.map((u, i) => i === 0 ? 3 : 1); // deployer 3x more likely
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let userIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { userIdx = i; break; }
    }
    const user = users[userIdx];

    try {
      const poolState = await program.account.lendingPool.fetch(poolPDA);
      const position = await program.account.userPosition.fetch(user.positionPDA);

      const deposits = poolState.totalDeposits.toNumber() / 1e6;
      const borrows = poolState.totalBorrows.toNumber() / 1e6;
      const liquidity = poolState.availableLiquidity.toNumber() / 1e6;
      const collateral = position.collateralSol.toNumber() / LAMPORTS_PER_SOL;
      const borrowed = position.borrowed.toNumber() / 1e6;
      const rate = poolState.interestRateBps / 100;
      const util = deposits > 0 ? (borrows / deposits) * 100 : 0;
      const solPrice = poolState.solPriceUsd.toNumber() / 1e6;
      const colRatio = poolState.collateralRatioBps / 10000;
      const maxBorrow = Math.max(0, (collateral * solPrice / colRatio) - borrowed);

      const userLabel = `${user.name} (${user.keypair.publicKey.toString().slice(0, 6)}...)`;
      const ts = new Date().toLocaleTimeString();

      console.log(`[${ts}] #${cycle} ${user.name}: util=${util.toFixed(1)}% borr=$${borrows.toFixed(0)} liq=$${liquidity.toFixed(0)} maxBorr=$${maxBorrow.toFixed(0)}`);

      // ===== SMART STRATEGY: target 30-70% utilization =====
      let action: string;
      let amount: number;
      const dice = Math.random();

      if (util < 20) {
        // WAY TOO LOW → aggressive borrow (80% chance)
        if (dice < 0.8) {
          action = "borrow";
          // Borrow big chunk to push utilization up
          const targetBorrow = deposits * 0.15; // try to add 15% utilization
          amount = Math.min(Math.floor(targetBorrow), Math.floor(maxBorrow), Math.floor(liquidity * 0.8));
        } else {
          action = "borrow";
          amount = Math.min(rand(50, 150), Math.floor(maxBorrow), Math.floor(liquidity));
        }
      } else if (util < 35) {
        // LOW → borrow (70%)
        if (dice < 0.7) {
          action = "borrow";
          const targetBorrow = deposits * 0.08;
          amount = Math.min(Math.floor(targetBorrow), Math.floor(maxBorrow), Math.floor(liquidity * 0.6));
        } else {
          action = "repay";
          amount = Math.min(rand(10, 30), borrowed);
        }
      } else if (util < 55) {
        // OPTIMAL ZONE → mix of borrow/repay (slight borrow bias)
        if (dice < 0.55) {
          action = "borrow";
          amount = Math.min(rand(20, 80), Math.floor(maxBorrow), Math.floor(liquidity * 0.4));
        } else {
          action = "repay";
          amount = Math.min(rand(15, 50), borrowed);
        }
      } else if (util < 75) {
        // HIGH → lean repay (60%)
        if (dice < 0.6) {
          action = "repay";
          amount = Math.min(rand(30, 100), borrowed);
        } else {
          action = "borrow";
          amount = Math.min(rand(10, 40), Math.floor(maxBorrow), Math.floor(liquidity * 0.3));
        }
      } else {
        // DANGER ZONE >75% → force repay (90%)
        if (dice < 0.9) {
          action = "repay";
          const targetRepay = borrows * 0.1; // repay 10% of borrows
          amount = Math.min(Math.floor(targetRepay), borrowed);
          if (amount < 5) amount = Math.min(rand(30, 80), borrowed);
        } else {
          action = "borrow";
          amount = Math.min(rand(5, 20), Math.floor(maxBorrow), Math.floor(liquidity * 0.1));
        }
      }

      // Ensure minimum amount
      if (amount < 1) amount = 0;

      if (amount <= 0) {
        console.log(`  Skip: ${action} (no room, maxBorrow=$${maxBorrow.toFixed(0)} borrowed=$${borrowed.toFixed(0)})`);
      } else {
        const lamports = Math.floor(amount) * 1_000_000;
        console.log(`  ${user.name}: ${action} $${Math.floor(amount)} aiUSDC...`);

        try {
          let tx: string;
          if (action === "borrow") {
            tx = await program.methods.borrow(new anchor.BN(lamports))
              .accounts({
                pool: poolPDA, poolVault: vaultPDA, tokenMint,
                userPosition: user.positionPDA, userTokenAccount: user.ata,
                owner: user.keypair.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              })
              .signers([user.keypair])
              .rpc();
          } else {
            tx = await program.methods.repay(new anchor.BN(lamports))
              .accounts({
                pool: poolPDA, poolVault: vaultPDA, tokenMint,
                userPosition: user.positionPDA, userTokenAccount: user.ata,
                owner: user.keypair.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
              })
              .signers([user.keypair])
              .rpc();
          }

          const pAfter = await program.account.lendingPool.fetch(poolPDA);
          const utilAfter = pAfter.totalDeposits.toNumber() > 0
            ? (pAfter.totalBorrows.toNumber() / pAfter.totalDeposits.toNumber()) * 100 : 0;
          const rateAfter = pAfter.interestRateBps / 100;

          await logActivity(action, userLabel, Math.floor(amount), "aiUSDC", tx, utilAfter, rateAfter);
          console.log(`  ✓ util=${utilAfter.toFixed(1)}% rate=${rateAfter}% TX=${tx.slice(0, 12)}...`);
        } catch (e: any) {
          console.log(`  ✗ TX Error: ${e.message?.slice(0, 100)}`);
        }
      }
    } catch (e: any) {
      console.log(`  ${user.name} fetch error: ${e.message?.slice(0, 80)}`);
    }

    const jitter = rand(-30, 30) * 1000; // ±30 sec randomness
    const waitMs = CYCLE_MS + jitter;
    console.log(`  Next in ${(waitMs / 60000).toFixed(1)} min...\n`);
    await sleep(waitMs);
  }
}

main().catch(console.error);
