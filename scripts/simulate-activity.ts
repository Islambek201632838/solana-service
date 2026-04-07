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

    // ── Accrue interest for ALL users with borrows (feeds insurance fund) ──
    for (const u of users) {
      try {
        const pos = await program.account.userPosition.fetch(u.positionPDA);
        if (pos.borrowed.toNumber() > 0) {
          await program.methods.accrueInterest()
            .accounts({ pool: poolPDA, userPosition: u.positionPDA })
            .rpc();
        }
      } catch (_e) { /* skip */ }
    }

    try {
      const poolState = await program.account.lendingPool.fetch(poolPDA);
      const deposits = poolState.totalDeposits.toNumber() / 1e6;
      const borrows = poolState.totalBorrows.toNumber() / 1e6;
      const liquidity = poolState.availableLiquidity.toNumber() / 1e6;
      const util = deposits > 0 ? (borrows / deposits) * 100 : 0;
      const solPrice = poolState.solPriceUsd.toNumber() / 1e6;
      const colRatio = poolState.collateralRatioBps / 10000;

      // Fetch all positions to pick the best user for the action
      const userInfos = await Promise.all(users.map(async (u) => {
        try {
          const pos = await program.account.userPosition.fetch(u.positionPDA);
          const collateral = pos.collateralSol.toNumber() / LAMPORTS_PER_SOL;
          const borrowed = pos.borrowed.toNumber() / 1e6;
          const maxBorrow = Math.max(0, (collateral * solPrice / colRatio) - borrowed);
          return { ...u, collateral, borrowed, maxBorrow };
        } catch (_e) {
          return { ...u, collateral: 0, borrowed: 0, maxBorrow: 0 };
        }
      }));

      // Decide action first based on utilization
      let action: string;
      const mood = Math.random();

      if (util > 85) {
        action = "repay";
      } else if (util < 30) {
        action = "borrow";
      } else if (mood > 0.85) {
        action = "borrow"; // whale borrow
      } else if (mood < 0.15) {
        action = "repay"; // whale repay
      } else if (Math.random() < 0.5) {
        action = "borrow";
      } else {
        action = "repay";
      }

      // Pick BEST user for chosen action
      let user: typeof userInfos[0];
      if (action === "borrow") {
        // Pick user with most borrow capacity
        const canBorrow = userInfos.filter(u => u.maxBorrow > 5);
        if (canBorrow.length === 0) {
          // Everyone maxed out, force repay from biggest borrower
          action = "repay";
          user = userInfos.reduce((a, b) => a.borrowed > b.borrowed ? a : b);
        } else {
          user = canBorrow[Math.floor(Math.random() * canBorrow.length)];
        }
      } else {
        // Pick user with borrows to repay
        const canRepay = userInfos.filter(u => u.borrowed > 1);
        if (canRepay.length === 0) {
          action = "borrow";
          user = userInfos.reduce((a, b) => a.maxBorrow > b.maxBorrow ? a : b);
        } else {
          user = canRepay[Math.floor(Math.random() * canRepay.length)];
        }
      }
      user = user!;

      const ts = new Date().toLocaleTimeString();
      const userLabel = `${user.name} (${user.keypair.publicKey.toString().slice(0, 6)}...)`;

      console.log(`[${ts}] #${cycle} ${user.name}: util=${util.toFixed(1)}% borr=$${borrows.toFixed(0)} liq=$${liquidity.toFixed(0)} maxBorr=$${user.maxBorrow.toFixed(0)} borrowed=$${user.borrowed.toFixed(0)}`);

      // Determine amount
      let amount: number;
      if (action === "borrow") {
        if (util < 30) {
          // Aggressive: borrow big to push util up
          amount = Math.min(rand(100, 400), Math.floor(user.maxBorrow), Math.floor(liquidity * 0.6));
        } else if (mood > 0.85) {
          amount = Math.min(rand(100, 300), Math.floor(user.maxBorrow), Math.floor(liquidity * 0.5));
        } else {
          amount = Math.min(rand(10, 80), Math.floor(user.maxBorrow), Math.floor(liquidity * 0.4));
        }
      } else {
        if (util > 85) {
          amount = Math.min(rand(50, 200), Math.floor(user.borrowed));
        } else if (mood < 0.15) {
          amount = Math.min(rand(100, 300), Math.floor(user.borrowed));
        } else {
          amount = Math.min(rand(10, 60), Math.floor(user.borrowed));
        }
      }

      // Ensure minimum amount
      if (amount < 1) amount = 0;

      if (amount <= 0) {
        console.log(`  Skip: ${action} (no room, maxBorrow=$${user.maxBorrow.toFixed(0)} borrowed=$${user.borrowed.toFixed(0)})`);
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
            // Accrue interest first so repay includes interest -> feeds insurance fund
            try {
              await program.methods.accrueInterest()
                .accounts({ pool: poolPDA, userPosition: user.positionPDA })
                .rpc();
              console.log(`  [accrue] interest accrued for ${user.name}`);
            } catch (_e) { /* no borrow or already accrued */ }

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
      console.log(`  fetch error: ${e.message?.slice(0, 80)}`);
    }

    // Random interval 1-5 min for chaotic timing
    const waitMs = rand(60, 300) * 1000;
    console.log(`  Next in ${(waitMs / 60000).toFixed(1)} min...\n`);
    await sleep(waitMs);
  }
}

main().catch(console.error);
