/**
 * Initialize pool on devnet:
 * 1. Create aiUSDC mint
 * 2. Initialize pool
 * 3. Set SOL price
 * 4. Deposit initial liquidity
 *
 * Usage: npx ts-node scripts/init-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaAiLend } from "../target/types/solana_ai_lend";
import {
  Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, createAccount as createTokenAccount, mintTo,
} from "@solana/spl-token";
import * as fs from "fs";

async function main() {
  // Load keypairs
  const deployerKey = JSON.parse(fs.readFileSync("./keys/deployer.json", "utf-8"));
  const deployer = Keypair.fromSecretKey(Uint8Array.from(deployerKey));

  const aiAgentKey = JSON.parse(fs.readFileSync("./keys/ai-agent.json", "utf-8"));
  const aiAgent = Keypair.fromSecretKey(Uint8Array.from(aiAgentKey));

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("Deployer:", deployer.publicKey.toString());
  console.log("AI Agent:", aiAgent.publicKey.toString());
  console.log("Balance:", await connection.getBalance(deployer.publicKey) / LAMPORTS_PER_SOL, "SOL");

  // Setup Anchor provider
  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaAiLend as Program<SolanaAiLend>;
  console.log("Program ID:", program.programId.toString());

  // 1. Create aiUSDC mint
  console.log("\n[1/5] Creating aiUSDC mint...");
  const tokenMint = await createMint(connection, deployer, deployer.publicKey, null, 6);
  console.log("  Mint:", tokenMint.toString());

  // 2. Derive PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), deployer.publicKey.toBuffer()],
    program.programId
  );
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()],
    program.programId
  );
  console.log("  Pool PDA:", poolPDA.toString());
  console.log("  Vault PDA:", vaultPDA.toString());

  // 3. Initialize pool
  console.log("\n[2/5] Initializing pool...");
  const tx1 = await program.methods
    .initializePool({
      aiAgent: aiAgent.publicKey,
      initialInterestRateBps: 500,       // 5%
      initialCollateralRatioBps: 15000,  // 150%
      maxBorrowLimit: new anchor.BN(10_000_000_000), // 10K aiUSDC
      liquidationThresholdBps: 12000,    // 120%
      maxInterestRateBps: 2000,          // 20%
      minInterestRateBps: 100,           // 1%
      minCollateralRatioBps: 12000,      // 120%
      maxCollateralRatioBps: 20000,      // 200%
    })
    .accounts({
      pool: poolPDA,
      poolVault: vaultPDA,
      tokenMint: tokenMint,
      authority: deployer.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log("  TX:", tx1);

  // 4. Set SOL price
  console.log("\n[3/5] Setting SOL price ($185)...");
  const tx2 = await program.methods
    .setSolPrice(new anchor.BN(185_000_000))
    .accounts({
      pool: poolPDA,
      authority: deployer.publicKey,
    })
    .rpc();
  console.log("  TX:", tx2);

  // 5. Create user token account + mint + deposit
  console.log("\n[4/5] Minting 100K aiUSDC...");
  const userAta = await createTokenAccount(connection, deployer, tokenMint, deployer.publicKey);
  await mintTo(connection, deployer, tokenMint, userAta, deployer.publicKey, 100_000_000_000); // 100K
  console.log("  User ATA:", userAta.toString());

  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()],
    program.programId
  );

  console.log("\n[5/5] Depositing 10K aiUSDC...");
  const tx3 = await program.methods
    .deposit(new anchor.BN(10_000_000_000))
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
  console.log("  TX:", tx3);

  // Verify
  const pool = await program.account.lendingPool.fetch(poolPDA);
  console.log("\n========================================");
  console.log("Pool initialized on devnet!");
  console.log("========================================");
  console.log("Pool PDA:", poolPDA.toString());
  console.log("Token Mint:", tokenMint.toString());
  console.log("Total Deposits:", pool.totalDeposits.toNumber() / 1e6, "aiUSDC");
  console.log("Interest Rate:", pool.interestRateBps / 100, "%");
  console.log("Collateral Ratio:", pool.collateralRatioBps / 100, "%");
  console.log("SOL Price: $" + pool.solPriceUsd.toNumber() / 1e6);
  console.log("Mood:", JSON.stringify(pool.currentMood));
  console.log("\nUpdate .env with:");
  console.log(`  POOL_AUTHORITY=${deployer.publicKey.toString()}`);
  console.log(`  TOKEN_MINT=${tokenMint.toString()}`);
}

main().catch(console.error);
