import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaAiLend } from "../target/types/solana_ai_lend";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("solana-ai-lend", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaAiLend as Program<SolanaAiLend>;
  const authority = provider.wallet as anchor.Wallet;
  const aiAgent = Keypair.generate();
  const tokenMint = Keypair.generate(); // mock mint for now

  let poolPDA: PublicKey;
  let poolBump: number;

  before(async () => {
    [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool"), authority.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("initialize_pool", () => {
    it("creates pool with correct initial params", async () => {
      const tx = await program.methods
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
          tokenMint: tokenMint.publicKey,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("  Initialize TX:", tx);

      // Fetch and verify pool state
      const pool = await program.account.lendingPool.fetch(poolPDA);

      expect(pool.authority.toString()).to.equal(authority.publicKey.toString());
      expect(pool.aiAgent.toString()).to.equal(aiAgent.publicKey.toString());
      expect(pool.tokenMint.toString()).to.equal(tokenMint.publicKey.toString());

      // Balances
      expect(pool.totalDeposits.toNumber()).to.equal(0);
      expect(pool.totalBorrows.toNumber()).to.equal(0);
      expect(pool.availableLiquidity.toNumber()).to.equal(0);
      expect(pool.totalCollateralSol.toNumber()).to.equal(0);

      // AI-managed params
      expect(pool.interestRateBps).to.equal(500);
      expect(pool.collateralRatioBps).to.equal(15000);
      expect(pool.maxBorrowLimit.toNumber()).to.equal(10_000_000_000);
      expect(pool.liquidationThresholdBps).to.equal(12000);

      // Hard limits
      expect(pool.maxInterestRateBps).to.equal(2000);
      expect(pool.minInterestRateBps).to.equal(100);
      expect(pool.minCollateralRatioBps).to.equal(12000);
      expect(pool.maxCollateralRatioBps).to.equal(20000);

      // Stats
      expect(pool.totalDepositsCount.toNumber()).to.equal(0);
      expect(pool.totalBorrowsCount.toNumber()).to.equal(0);
      expect(pool.totalAiUpdates.toNumber()).to.equal(0);
      expect(pool.totalAiSkips.toNumber()).to.equal(0);
      expect(pool.totalLiquidations.toNumber()).to.equal(0);

      // Mood & state
      expect(JSON.stringify(pool.currentMood)).to.equal(JSON.stringify({ calm: {} }));
      expect(pool.isFrozen).to.equal(false);

      // Meta
      expect(pool.protocolCreatedAt.toNumber()).to.be.greaterThan(0);
      expect(pool.updateCooldown.toNumber()).to.equal(600);
      expect(pool.bump).to.equal(poolBump);

      console.log("  Pool created successfully!");
      console.log("  Rate:", pool.interestRateBps / 100, "%");
      console.log("  Collateral:", pool.collateralRatioBps / 100, "%");
      console.log("  Mood:", JSON.stringify(pool.currentMood));
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
            tokenMint: tokenMint.publicKey,
            authority: authority.publicKey,
          })
          .rpc();

        expect.fail("Should have thrown — pool already exists");
      } catch (e) {
        // Account already initialized
        expect(e.toString()).to.include("already in use");
        console.log("  Duplicate init correctly rejected");
      }
    });
  });
});
