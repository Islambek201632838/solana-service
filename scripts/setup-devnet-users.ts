/**
 * Create 5 real user wallets on devnet with positions, collateral, and deposits.
 * Each user gets their own keypair, position PDA, token account.
 *
 * Run once: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/setup-devnet-users.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
  createAssociatedTokenAccount, mintTo, getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface UserConfig {
  name: string;
  solCollateral: number;   // SOL to deposit as collateral
  depositAmount: number;   // aiUSDC to deposit into pool
  borrowAmount: number;    // aiUSDC to borrow
}

const USERS: UserConfig[] = [
  { name: "Alice",   solCollateral: 0.3, depositAmount: 200, borrowAmount: 10 },
  { name: "Bob",     solCollateral: 0.3, depositAmount: 150, borrowAmount: 8  },
  { name: "Charlie", solCollateral: 0.2, depositAmount: 100, borrowAmount: 5  },
  { name: "Diana",   solCollateral: 0.2, depositAmount: 80,  borrowAmount: 3  },
  { name: "Eve",     solCollateral: 0.1, depositAmount: 50,  borrowAmount: 2  },
];

const KEYS_DIR = "./keys/users";

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

  console.log("=== DEVNET USER SETUP ===");
  console.log("Pool:", poolPDA.toString());
  console.log("Token Mint:", tokenMint.toString());
  console.log("Deployer:", deployer.publicKey.toString());
  console.log("");

  // Create keys directory
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const deployerBalance = await connection.getBalance(deployer.publicKey);
  console.log(`Deployer balance: ${(deployerBalance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);

  const totalSolNeeded = USERS.reduce((sum, u) => sum + u.solCollateral + 0.05, 0); // +0.05 for rent/fees
  console.log(`Total SOL needed: ~${totalSolNeeded.toFixed(2)} SOL`);

  if (deployerBalance / LAMPORTS_PER_SOL < totalSolNeeded + 1) {
    console.log("WARNING: Deployer may not have enough SOL. Continuing anyway...");
  }
  console.log("");

  for (const userConfig of USERS) {
    console.log(`--- Setting up ${userConfig.name} ---`);

    // 1. Load or create keypair
    const keyPath = path.join(KEYS_DIR, `${userConfig.name.toLowerCase()}.json`);
    let userKp: Keypair;
    if (fs.existsSync(keyPath)) {
      const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      userKp = Keypair.fromSecretKey(new Uint8Array(keyData));
      console.log(`  Loaded existing key: ${userKp.publicKey.toString()}`);
    } else {
      userKp = Keypair.generate();
      fs.writeFileSync(keyPath, JSON.stringify(Array.from(userKp.secretKey)));
      console.log(`  Generated new key: ${userKp.publicKey.toString()}`);
    }

    // 2. Transfer SOL for collateral + fees
    const userBalance = await connection.getBalance(userKp.publicKey);
    const neededSol = userConfig.solCollateral + 0.05; // extra for rent+fees
    if (userBalance / LAMPORTS_PER_SOL < neededSol) {
      const transferAmount = neededSol - userBalance / LAMPORTS_PER_SOL;
      console.log(`  Transferring ${transferAmount.toFixed(3)} SOL...`);
      const tx = await connection.requestAirdrop(userKp.publicKey, transferAmount * LAMPORTS_PER_SOL).catch(async () => {
        // Airdrop fails on devnet sometimes, use deployer transfer
        const sig = await provider.sendAndConfirm(
          new anchor.web3.Transaction().add(
            SystemProgram.transfer({
              fromPubkey: deployer.publicKey,
              toPubkey: userKp.publicKey,
              lamports: Math.ceil(transferAmount * LAMPORTS_PER_SOL),
            })
          )
        );
        return sig;
      });
      await sleep(2000);
    }
    console.log(`  SOL balance: ${((await connection.getBalance(userKp.publicKey)) / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

    // 3. Create token account and mint aiUSDC
    const mintAmount = (userConfig.depositAmount + userConfig.borrowAmount + 500) * 1_000_000; // extra buffer
    let userAta: PublicKey;
    try {
      const ataInfo = await getOrCreateAssociatedTokenAccount(
        connection, deployer.payer, tokenMint, userKp.publicKey
      );
      userAta = ataInfo.address;
      console.log(`  Token account: ${userAta.toString()}`);
    } catch (e: any) {
      console.log(`  Creating token account...`);
      userAta = await createAssociatedTokenAccount(
        connection, deployer.payer, tokenMint, userKp.publicKey
      );
    }

    // Mint tokens to user
    try {
      await mintTo(connection, deployer.payer, tokenMint, userAta, deployer.payer, mintAmount);
      console.log(`  Minted ${mintAmount / 1e6} aiUSDC`);
    } catch (e: any) {
      console.log(`  Mint error (may already have tokens): ${e.message?.slice(0, 60)}`);
    }

    // 4. Create position PDA
    const [positionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), poolPDA.toBuffer(), userKp.publicKey.toBuffer()], programId
    );

    // Check if position already exists
    let positionExists = false;
    try {
      await program.account.userPosition.fetch(positionPDA);
      positionExists = true;
      console.log(`  Position already exists: ${positionPDA.toString()}`);
    } catch {
      // Position doesn't exist, will create
    }

    if (!positionExists) {
      // 5. Deposit tokens (creates position)
      const depositLamports = userConfig.depositAmount * 1_000_000;
      try {
        const tx = await program.methods.deposit(new anchor.BN(depositLamports))
          .accounts({
            pool: poolPDA,
            poolVault: vaultPDA,
            tokenMint,
            userPosition: positionPDA,
            userTokenAccount: userAta,
            owner: userKp.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([userKp])
          .rpc();
        console.log(`  Deposited ${userConfig.depositAmount} aiUSDC → TX: ${tx.slice(0, 16)}...`);
        await sleep(1500);
      } catch (e: any) {
        console.log(`  Deposit error: ${e.message?.slice(0, 80)}`);
      }

      // 6. Deposit collateral (SOL)
      const collateralLamports = Math.floor(userConfig.solCollateral * LAMPORTS_PER_SOL);
      try {
        const tx = await program.methods.depositCollateral(new anchor.BN(collateralLamports))
          .accounts({
            pool: poolPDA,
            userPosition: positionPDA,
            owner: userKp.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userKp])
          .rpc();
        console.log(`  Deposited ${userConfig.solCollateral} SOL collateral → TX: ${tx.slice(0, 16)}...`);
        await sleep(1500);
      } catch (e: any) {
        console.log(`  Collateral error: ${e.message?.slice(0, 80)}`);
      }

      // 7. Borrow
      if (userConfig.borrowAmount > 0) {
        const borrowLamports = userConfig.borrowAmount * 1_000_000;
        try {
          const tx = await program.methods.borrow(new anchor.BN(borrowLamports))
            .accounts({
              pool: poolPDA,
              poolVault: vaultPDA,
              tokenMint,
              userPosition: positionPDA,
              userTokenAccount: userAta,
              owner: userKp.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([userKp])
            .rpc();
          console.log(`  Borrowed ${userConfig.borrowAmount} aiUSDC → TX: ${tx.slice(0, 16)}...`);
          await sleep(1500);
        } catch (e: any) {
          console.log(`  Borrow error: ${e.message?.slice(0, 80)}`);
        }
      }
    }

    // Log to activity service
    try {
      await fetch("http://localhost:8000/api/activity/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit", user: `${userConfig.name} (${userKp.publicKey.toString().slice(0, 6)}...)`,
          amount: userConfig.depositAmount, token: "aiUSDC",
          tx_signature: "setup", pool_util_after: 0, rate_at_time: 0,
        }),
      });
    } catch {}

    console.log(`  ✓ ${userConfig.name} setup complete!\n`);
    await sleep(1000);
  }

  // Print summary
  console.log("\n=== SUMMARY ===");
  const poolAfter = await program.account.lendingPool.fetch(poolPDA);
  console.log(`Pool deposits: $${(poolAfter.totalDeposits.toNumber() / 1e6).toFixed(0)}`);
  console.log(`Pool borrows: $${(poolAfter.totalBorrows.toNumber() / 1e6).toFixed(0)}`);
  console.log(`Utilization: ${poolAfter.totalDeposits.toNumber() > 0
    ? ((poolAfter.totalBorrows.toNumber() / poolAfter.totalDeposits.toNumber()) * 100).toFixed(1) : 0}%`);
  console.log(`Total collateral: ${(poolAfter.totalCollateralSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL`);

  console.log("\nUsers:");
  for (const userConfig of USERS) {
    const keyPath = path.join(KEYS_DIR, `${userConfig.name.toLowerCase()}.json`);
    const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    const kp = Keypair.fromSecretKey(new Uint8Array(keyData));
    const [posPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), poolPDA.toBuffer(), kp.publicKey.toBuffer()], programId
    );
    try {
      const pos = await program.account.userPosition.fetch(posPDA);
      console.log(`  ${userConfig.name}: deposit=$${(pos.deposited.toNumber() / 1e6).toFixed(0)} borrow=$${(pos.borrowed.toNumber() / 1e6).toFixed(0)} collateral=${(pos.collateralSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
    } catch {
      console.log(`  ${userConfig.name}: no position`);
    }
  }

  console.log("\nDone! Now update simulate-activity.ts to rotate between these users.");
}

main().catch(console.error);
