import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaAiLend } from "../target/types/solana_ai_lend";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("solana-ai-lend", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaAiLend as Program<SolanaAiLend>;
  const authority = provider.wallet as anchor.Wallet;
  const aiAgent = Keypair.generate();

  let tokenMint: PublicKey;
  let poolPDA: PublicKey;
  let poolBump: number;
  let vaultPDA: PublicKey;
  let userTokenAccount: PublicKey;

  before(async () => {
    // Create a real SPL token mint (aiUSDC)
    tokenMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6 // 6 decimals like USDC
    );

    // Derive PDAs
    [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool"), authority.publicKey.toBuffer()],
      program.programId
    );

    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer()],
      program.programId
    );

    // Create user token account and mint 1M aiUSDC
    userTokenAccount = await createAccount(
      provider.connection,
      (authority as any).payer,
      tokenMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      (authority as any).payer,
      tokenMint,
      userTokenAccount,
      authority.publicKey,
      1_000_000_000_000 // 1M aiUSDC (6 decimals)
    );

    console.log("  Token Mint:", tokenMint.toString());
    console.log("  Pool PDA:", poolPDA.toString());
    console.log("  Vault PDA:", vaultPDA.toString());
    console.log("  User Token Account:", userTokenAccount.toString());
  });

  describe("initialize_pool", () => {
    it("creates pool with correct initial params", async () => {
      const tx = await program.methods
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
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log("  Initialize TX:", tx);

      const pool = await program.account.lendingPool.fetch(poolPDA);

      expect(pool.authority.toString()).to.equal(authority.publicKey.toString());
      expect(pool.aiAgent.toString()).to.equal(aiAgent.publicKey.toString());
      expect(pool.tokenMint.toString()).to.equal(tokenMint.toString());

      expect(pool.totalDeposits.toNumber()).to.equal(0);
      expect(pool.totalBorrows.toNumber()).to.equal(0);
      expect(pool.availableLiquidity.toNumber()).to.equal(0);

      expect(pool.interestRateBps).to.equal(500);
      expect(pool.collateralRatioBps).to.equal(15000);
      expect(pool.maxBorrowLimit.toNumber()).to.equal(10_000_000_000);

      expect(pool.maxInterestRateBps).to.equal(2000);
      expect(pool.minInterestRateBps).to.equal(100);

      expect(JSON.stringify(pool.currentMood)).to.equal(JSON.stringify({ calm: {} }));
      expect(pool.isFrozen).to.equal(false);
      expect(pool.bump).to.equal(poolBump);
      expect(pool.vaultBump).to.be.greaterThan(0);

      console.log("  Pool created successfully!");
    });

    it("fails on duplicate initialization", async () => {
      try {
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
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .rpc();

        expect.fail("Should have thrown — pool already exists");
      } catch (e) {
        expect(e.toString()).to.include("already in use");
        console.log("  Duplicate init correctly rejected");
      }
    });
  });

  describe("deposit", () => {
    const depositAmount = 1_000_000_000; // 1000 aiUSDC

    it("deposits 1000 aiUSDC", async () => {
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          userPosition: positionPDA,
          userTokenAccount: userTokenAccount,
          owner: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  Deposit TX:", tx);

      // Verify pool state
      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalDeposits.toNumber()).to.equal(depositAmount);
      expect(pool.availableLiquidity.toNumber()).to.equal(depositAmount);
      expect(pool.totalDepositsCount.toNumber()).to.equal(1);

      // Verify user position
      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.deposited.toNumber()).to.equal(depositAmount);
      expect(position.owner.toString()).to.equal(authority.publicKey.toString());
      expect(position.pool.toString()).to.equal(poolPDA.toString());
      expect(position.totalOperations).to.equal(1);

      // Verify vault balance
      const vault = await getAccount(provider.connection, vaultPDA);
      expect(Number(vault.amount)).to.equal(depositAmount);

      console.log("  Deposited:", depositAmount / 1e6, "aiUSDC");
      console.log("  Pool total deposits:", pool.totalDeposits.toNumber() / 1e6);
    });

    it("deposits additional 500 aiUSDC", async () => {
      const additionalAmount = 500_000_000; // 500 aiUSDC
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .deposit(new anchor.BN(additionalAmount))
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          userPosition: positionPDA,
          userTokenAccount: userTokenAccount,
          owner: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalDeposits.toNumber()).to.equal(depositAmount + additionalAmount);
      expect(pool.totalDepositsCount.toNumber()).to.equal(2);

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.deposited.toNumber()).to.equal(depositAmount + additionalAmount);
      expect(position.totalOperations).to.equal(2);

      console.log("  Total deposited:", position.deposited.toNumber() / 1e6, "aiUSDC");
    });

    it("fails on zero deposit", async () => {
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .deposit(new anchor.BN(0))
          .accounts({
            pool: poolPDA,
            poolVault: vaultPDA,
            tokenMint: tokenMint,
            userPosition: positionPDA,
            userTokenAccount: userTokenAccount,
            owner: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown — zero amount");
      } catch (e) {
        expect(e.toString()).to.include("Amount must be greater than zero");
        console.log("  Zero deposit correctly rejected");
      }
    });
  });

  describe("withdraw", () => {
    it("withdraws 500 aiUSDC", async () => {
      const withdrawAmount = 500_000_000; // 500 aiUSDC
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      const positionBefore = await program.account.userPosition.fetch(positionPDA);
      const depositedBefore = positionBefore.deposited.toNumber();

      const tx = await program.methods
        .withdraw(new anchor.BN(withdrawAmount))
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          userPosition: positionPDA,
          userTokenAccount: userTokenAccount,
          owner: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("  Withdraw TX:", tx);

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalDeposits.toNumber()).to.equal(depositedBefore - withdrawAmount);
      expect(pool.availableLiquidity.toNumber()).to.equal(depositedBefore - withdrawAmount);

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.deposited.toNumber()).to.equal(depositedBefore - withdrawAmount);

      const vault = await getAccount(provider.connection, vaultPDA);
      expect(Number(vault.amount)).to.equal(depositedBefore - withdrawAmount);

      console.log("  Withdrew:", withdrawAmount / 1e6, "aiUSDC");
      console.log("  Remaining:", position.deposited.toNumber() / 1e6, "aiUSDC");
    });

    it("fails when withdrawing more than deposited", async () => {
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .withdraw(new anchor.BN(999_999_000_000)) // way more than deposited
          .accounts({
            pool: poolPDA,
            poolVault: vaultPDA,
            tokenMint: tokenMint,
            userPosition: positionPDA,
            userTokenAccount: userTokenAccount,
            owner: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Should have thrown — insufficient deposit");
      } catch (e) {
        expect(e.toString()).to.include("Insufficient deposit balance");
        console.log("  Overwithdraw correctly rejected");
      }
    });

    it("fails on zero withdraw", async () => {
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .withdraw(new anchor.BN(0))
          .accounts({
            pool: poolPDA,
            poolVault: vaultPDA,
            tokenMint: tokenMint,
            userPosition: positionPDA,
            userTokenAccount: userTokenAccount,
            owner: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Should have thrown — zero amount");
      } catch (e) {
        expect(e.toString()).to.include("Amount must be greater than zero");
        console.log("  Zero withdraw correctly rejected");
      }
    });
  });
});
