/**
 * Initialize pool on Solana devnet.
 * Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./keys/deployer.json npx tsx scripts/init-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, createAccount as createTokenAccount, mintTo,
} from "@solana/spl-token";
import * as fs from "fs";

async function main() {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const deployer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const aiAgentKey = JSON.parse(fs.readFileSync("./keys/ai-agent.json", "utf-8"));
  const aiAgent = Keypair.fromSecretKey(Uint8Array.from(aiAgentKey));

  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/solana_ai_lend.json", "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  console.log("Deployer:", deployer.publicKey.toString());
  console.log("AI Agent:", aiAgent.publicKey.toString());
  console.log("Program:", programId.toString());
  console.log("Balance:", await connection.getBalance(deployer.publicKey) / LAMPORTS_PER_SOL, "SOL\n");

  // 1. Create aiUSDC mint
  console.log("[1/5] Creating aiUSDC mint...");
  const tokenMint = await createMint(
    connection, (deployer as any).payer, deployer.publicKey, null, 6
  );
  console.log("  Mint:", tokenMint.toString());

  // 2. PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), deployer.publicKey.toBuffer()], programId
  );
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()], programId
  );
  console.log("  Pool:", poolPDA.toString());

  // 3. Initialize pool
  console.log("\n[2/5] Initializing pool...");
  await program.methods
    .initializePool({
      aiAgent: aiAgent.publicKey,
      initialInterestRateBps: 500,
      initialCollateralRatioBps: 15000,
      maxBorrowLimit: new anchor.BN(10_000_000_000),
      liquidationThresholdBps: 12000,
      maxInterestRateBps: 2000,
      minInterestRateBps: 100,
      minCollateralRatioBps: 12000,
      maxCollateralRatioBps: 20000,
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
  console.log("  Done!");

  // 4. Set SOL price
  console.log("\n[3/5] Setting SOL price ($185)...");
  await program.methods
    .setSolPrice(new anchor.BN(185_000_000))
    .accounts({ pool: poolPDA, authority: deployer.publicKey })
    .rpc();
  console.log("  Done!");

  // 5. Mint + Deposit
  console.log("\n[4/5] Minting 100K aiUSDC...");
  const userAta = await createTokenAccount(
    connection, (deployer as any).payer, tokenMint, deployer.publicKey
  );
  await mintTo(
    connection, (deployer as any).payer, tokenMint, userAta, deployer.publicKey, 100_000_000_000
  );
  console.log("  ATA:", userAta.toString());

  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );

  console.log("\n[5/5] Depositing 10K aiUSDC...");
  await program.methods
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

  // Verify
  const pool = await program.account.lendingPool.fetch(poolPDA);
  console.log("\n========================================");
  console.log("Pool initialized on devnet!");
  console.log("========================================");
  console.log("Pool PDA:         ", poolPDA.toString());
  console.log("Token Mint:       ", tokenMint.toString());
  console.log("Deposits:         ", pool.totalDeposits.toNumber() / 1e6, "aiUSDC");
  console.log("Rate:             ", pool.interestRateBps / 100, "%");
  console.log("Collateral Ratio: ", pool.collateralRatioBps / 100, "%");
  console.log("SOL Price:        $", pool.solPriceUsd.toNumber() / 1e6);
  console.log("\nUpdate your .env:");
  console.log(`  POOL_AUTHORITY=${deployer.publicKey.toString()}`);
}

main().catch(console.error);
