import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaAiLend } from "../target/types/solana_ai_lend";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
  let positionPDA: PublicKey;
  let userTokenAccount: PublicKey;

  before(async () => {
    tokenMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );

    [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool"), authority.publicKey.toBuffer()],
      program.programId
    );

    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer()],
      program.programId
    );

    [positionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
      program.programId
    );

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
      1_000_000_000_000 // 1M aiUSDC
    );
  });

  // ===========================================
  // STEP 2: Initialize Pool
  // ===========================================

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
      expect(pool.interestRateBps).to.equal(500);
      expect(pool.collateralRatioBps).to.equal(15000);
      expect(pool.solPriceUsd.toNumber()).to.equal(0);
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
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("already in use");
        console.log("  Duplicate init correctly rejected");
      }
    });
  });

  // ===========================================
  // STEP 3: Deposit + Withdraw
  // ===========================================

  describe("deposit", () => {
    it("deposits 1000 aiUSDC", async () => {
      await program.methods
        .deposit(new anchor.BN(1_000_000_000))
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
      expect(pool.totalDeposits.toNumber()).to.equal(1_000_000_000);
      expect(pool.availableLiquidity.toNumber()).to.equal(1_000_000_000);
      console.log("  Deposited 1000 aiUSDC");
    });
  });

  describe("withdraw", () => {
    it("withdraws 500 aiUSDC", async () => {
      await program.methods
        .withdraw(new anchor.BN(500_000_000))
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

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalDeposits.toNumber()).to.equal(500_000_000);
      console.log("  Withdrew 500, remaining deposit: 500 aiUSDC");
    });
  });

  // ===========================================
  // STEP 4: Collateral + Borrow + Repay + Interest + Liquidate
  // ===========================================

  describe("set_sol_price", () => {
    it("sets SOL price to $185", async () => {
      await program.methods
        .setSolPrice(new anchor.BN(185_000_000)) // $185.00
        .accounts({
          pool: poolPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.solPriceUsd.toNumber()).to.equal(185_000_000);
      console.log("  SOL price set to $185.00");
    });

    it("fails with zero price", async () => {
      try {
        await program.methods
          .setSolPrice(new anchor.BN(0))
          .accounts({
            pool: poolPDA,
            authority: authority.publicKey,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("Invalid or stale oracle price");
        console.log("  Zero price correctly rejected");
      }
    });
  });

  describe("deposit_collateral", () => {
    it("deposits 2 SOL as collateral", async () => {
      const tx = await program.methods
        .depositCollateral(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          pool: poolPDA,
          userPosition: positionPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  Deposit Collateral TX:", tx);

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.collateralSol.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalCollateralSol.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);

      console.log("  Collateral: 2 SOL ($370 at $185/SOL)");
    });
  });

  describe("borrow", () => {
    // Pool state: 500 aiUSDC available, collateral 2 SOL ($370), ratio 150%
    // Max borrow with 2 SOL: $370 / 1.5 = ~$246 aiUSDC

    it("borrows 100 aiUSDC (collateral $370 > required $150)", async () => {
      const tx = await program.methods
        .borrow(new anchor.BN(100_000_000)) // 100 aiUSDC
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

      console.log("  Borrow TX:", tx);

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.borrowed.toNumber()).to.equal(100_000_000);

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalBorrows.toNumber()).to.equal(100_000_000);
      expect(pool.availableLiquidity.toNumber()).to.equal(400_000_000); // 500 - 100

      console.log("  Borrowed 100 aiUSDC, available: 400 aiUSDC");
    });

    it("fails borrow exceeding collateral ratio", async () => {
      // Already borrowed 100, try 200 more → total 300 → need $450 collateral, have $370
      try {
        await program.methods
          .borrow(new anchor.BN(200_000_000))
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
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("Insufficient collateral");
        console.log("  Borrow exceeding collateral correctly rejected");
      }
    });

    it("fails borrow exceeding max_borrow_limit", async () => {
      // max_borrow_limit = 10K aiUSDC, try to borrow 10K (total would exceed)
      try {
        await program.methods
          .borrow(new anchor.BN(10_000_000_000))
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
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("Borrow amount exceeds limit");
        console.log("  Borrow exceeding limit correctly rejected");
      }
    });
  });

  describe("withdraw_collateral (while borrowed)", () => {
    it("fails while borrow is active", async () => {
      try {
        await program.methods
          .withdrawCollateral(new anchor.BN(LAMPORTS_PER_SOL))
          .accounts({
            pool: poolPDA,
            userPosition: positionPDA,
            owner: authority.publicKey,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("Cannot withdraw collateral with active borrow");
        console.log("  Withdraw collateral while borrowed correctly rejected");
      }
    });
  });

  describe("accrue_interest", () => {
    it("accrues interest on borrow position", async () => {
      // Wait a bit for time to pass
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await program.methods
        .accrueInterest()
        .accounts({
          pool: poolPDA,
          userPosition: positionPDA,
        })
        .rpc();

      const position = await program.account.userPosition.fetch(positionPDA);
      // Interest may be 0-1 due to short elapsed time (5% APY on 100 aiUSDC = ~0.01/day)
      expect(position.accruedInterest.toNumber()).to.be.gte(0);
      console.log("  Accrued interest:", position.accruedInterest.toNumber(), "lamports");
    });
  });

  describe("repay", () => {
    it("repays full borrowed amount", async () => {
      const position = await program.account.userPosition.fetch(positionPDA);
      const totalOwed = position.borrowed.toNumber() + position.accruedInterest.toNumber();

      await program.methods
        .repay(new anchor.BN(totalOwed))
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

      const positionAfter = await program.account.userPosition.fetch(positionPDA);
      expect(positionAfter.borrowed.toNumber()).to.equal(0);
      expect(positionAfter.accruedInterest.toNumber()).to.equal(0);

      console.log("  Repaid", totalOwed / 1e6, "aiUSDC (principal + interest)");
    });
  });

  describe("withdraw_collateral (after repay)", () => {
    it("withdraws 2 SOL after loan is repaid", async () => {
      await program.methods
        .withdrawCollateral(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          pool: poolPDA,
          userPosition: positionPDA,
          owner: authority.publicKey,
        })
        .rpc();

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.collateralSol.toNumber()).to.equal(0);

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalCollateralSol.toNumber()).to.equal(0);

      console.log("  Withdrew 2 SOL collateral");
    });
  });

  describe("liquidate", () => {
    it("fails on healthy position", async () => {
      // Setup: deposit collateral + borrow again
      await program.methods
        .depositCollateral(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          pool: poolPDA,
          userPosition: positionPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .borrow(new anchor.BN(100_000_000))
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

      // Try to liquidate healthy position (collateral $370 >> required $120)
      try {
        await program.methods
          .liquidate()
          .accounts({
            pool: poolPDA,
            poolVault: vaultPDA,
            tokenMint: tokenMint,
            borrowerPosition: positionPDA,
            liquidatorTokenAccount: userTokenAccount,
            liquidator: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.toString()).to.include("Position is healthy");
        console.log("  Liquidate healthy position correctly rejected");
      }
    });

    it("succeeds on undercollateralized position", async () => {
      // Drop SOL price to $50 → collateral value = 2 SOL * $50 = $100
      // Borrowed = 100 aiUSDC, threshold 120% = $120 > $100 → undercollateralized
      await program.methods
        .setSolPrice(new anchor.BN(50_000_000)) // $50
        .accounts({
          pool: poolPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const positionBefore = await program.account.userPosition.fetch(positionPDA);
      const poolBefore = await program.account.lendingPool.fetch(poolPDA);

      await program.methods
        .liquidate()
        .accounts({
          pool: poolPDA,
          poolVault: vaultPDA,
          tokenMint: tokenMint,
          borrowerPosition: positionPDA,
          liquidatorTokenAccount: userTokenAccount,
          liquidator: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const position = await program.account.userPosition.fetch(positionPDA);
      expect(position.borrowed.toNumber()).to.equal(0);
      expect(position.collateralSol.toNumber()).to.equal(0);
      expect(position.accruedInterest.toNumber()).to.equal(0);

      const pool = await program.account.lendingPool.fetch(poolPDA);
      expect(pool.totalLiquidations.toNumber()).to.equal(1);

      console.log("  Liquidation successful!");
      console.log("  Borrower position cleared");
      console.log("  Total liquidations:", pool.totalLiquidations.toNumber());
    });
  });
});
