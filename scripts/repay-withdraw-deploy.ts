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
  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), poolPDA.toBuffer()], programId);
  const [posPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPDA.toBuffer(), deployer.publicKey.toBuffer()], programId
  );
  const ata = await getAssociatedTokenAddress(pool.tokenMint, deployer.publicKey);

  const pos = await program.account.userPosition.fetch(posPDA);
  const total = pos.borrowed.toNumber() + pos.accruedInterest.toNumber();
  if (total > 0) {
    await program.methods.repay(new anchor.BN(total))
      .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint: pool.tokenMint, userPosition: posPDA, userTokenAccount: ata, owner: deployer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    console.log(`Repaid $${total / 1e6}`);
  }

  await program.methods.withdrawCollateral(new anchor.BN(3 * LAMPORTS_PER_SOL))
    .accounts({ pool: poolPDA, userPosition: posPDA, owner: deployer.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  const bal = await provider.connection.getBalance(deployer.publicKey);
  console.log(`Withdrew 3 SOL. Balance: ${(bal / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
}

main().catch(console.error);
