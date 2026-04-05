import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from "fs";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const deployer = provider.wallet as anchor.Wallet;
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
  const [posPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );
  const userAta = await getAssociatedTokenAddress(tokenMint, deployer.publicKey);
  const pos = await program.account.userPosition.fetch(posPDA);

  const borrowed = pos.borrowed.toNumber();
  const interest = pos.accruedInterest.toNumber();
  const collateral = pos.collateralSol.toNumber();
  console.log(`Deployer: collateral=${(collateral / LAMPORTS_PER_SOL).toFixed(2)} SOL, borrowed=${borrowed / 1e6}, interest=${interest / 1e6}`);

  // Repay all debt first
  const total = borrowed + interest;
  if (total > 0) {
    try {
      const tx = await program.methods.repay(new anchor.BN(total))
        .accounts({
          pool: poolPDA, poolVault: vaultPDA, tokenMint,
          userPosition: posPDA, userTokenAccount: userAta,
          owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc();
      console.log(`Repaid ${total / 1e6} aiUSDC. TX: ${tx.slice(0, 16)}`);
    } catch (e: any) {
      console.log(`Repay error: ${e.message?.slice(0, 80)}`);
    }
  }

  // Withdraw collateral to keep only 0.3 SOL
  const keepLamports = Math.floor(0.3 * LAMPORTS_PER_SOL);
  const posAfter = await program.account.userPosition.fetch(posPDA);
  const currentCollateral = posAfter.collateralSol.toNumber();
  const withdrawAmount = currentCollateral - keepLamports;

  if (withdrawAmount > 0) {
    try {
      const tx = await program.methods.withdrawCollateral(new anchor.BN(withdrawAmount))
        .accounts({
          pool: poolPDA, userPosition: posPDA,
          owner: deployer.publicKey, systemProgram: SystemProgram.programId,
        }).rpc();
      console.log(`Withdrew ${(withdrawAmount / LAMPORTS_PER_SOL).toFixed(2)} SOL collateral. TX: ${tx.slice(0, 16)}`);
    } catch (e: any) {
      console.log(`Withdraw error: ${e.message?.slice(0, 80)}`);
    }
  }

  // Fund AI agent
  const aiPubkey = new PublicKey("J2j7JLH5f1M3Y6izYFb1fx4vsniJ5j3ipTU9mi7zUd5F");
  const aiBal = await provider.connection.getBalance(aiPubkey);
  const deployerBal = await provider.connection.getBalance(deployer.publicKey);
  console.log(`\nAI agent: ${(aiBal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  console.log(`Deployer: ${(deployerBal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  if (aiBal / LAMPORTS_PER_SOL < 1 && deployerBal / LAMPORTS_PER_SOL > 2) {
    const sendAmount = Math.floor(1 * LAMPORTS_PER_SOL);
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: aiPubkey,
        lamports: sendAmount,
      })
    );
    await provider.sendAndConfirm(tx);
    console.log(`Transferred 1 SOL to AI agent`);
  }

  // Final summary
  const poolFinal = await program.account.lendingPool.fetch(poolPDA);
  console.log(`\n=== POOL STATUS ===`);
  console.log(`Deposits: $${poolFinal.totalDeposits.toNumber() / 1e6}`);
  console.log(`Borrows: $${poolFinal.totalBorrows.toNumber() / 1e6}`);
  console.log(`Collateral: ${(poolFinal.totalCollateralSol.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  console.log(`Utilization: ${poolFinal.totalDeposits.toNumber() > 0 ? ((poolFinal.totalBorrows.toNumber() / poolFinal.totalDeposits.toNumber()) * 100).toFixed(1) : 0}%`);
}

main().catch(console.error);
