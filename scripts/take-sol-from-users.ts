import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), poolPDA.toBuffer()], programId);

  async function withdrawAndReturn(name: string, withdrawSol: number) {
    const kd = JSON.parse(fs.readFileSync(`./keys/users/${name.toLowerCase()}.json`, "utf-8"));
    const kp = Keypair.fromSecretKey(new Uint8Array(kd));
    const [posPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), poolPDA.toBuffer(), kp.publicKey.toBuffer()], programId
    );
    const pos = await program.account.userPosition.fetch(posPDA);
    const ata = await getAssociatedTokenAddress(tokenMint, kp.publicKey);

    // Repay borrows first
    const borrowed = pos.borrowed.toNumber();
    if (borrowed > 0) {
      await program.methods.repay(new anchor.BN(borrowed))
        .accounts({ pool: poolPDA, poolVault: vaultPDA, tokenMint, userPosition: posPDA, userTokenAccount: ata, owner: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([kp]).rpc();
      console.log(`${name}: repaid $${borrowed / 1e6}`);
    }

    // Withdraw collateral
    await program.methods.withdrawCollateral(new anchor.BN(Math.floor(withdrawSol * LAMPORTS_PER_SOL)))
      .accounts({ pool: poolPDA, userPosition: posPDA, owner: kp.publicKey, systemProgram: SystemProgram.programId })
      .signers([kp]).rpc();

    // Send to deployer
    const bal = await provider.connection.getBalance(kp.publicKey);
    const send = bal - Math.floor(0.01 * LAMPORTS_PER_SOL);
    if (send > 0) {
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: deployer.publicKey, lamports: send })
        ), [kp]
      );
    }
    console.log(`${name}: withdrew ${withdrawSol} SOL → deployer`);
  }

  await withdrawAndReturn("Alice", 1);
  await withdrawAndReturn("Bob", 1);

  const bal = await provider.connection.getBalance(deployer.publicKey);
  console.log(`\nDeployer: ${(bal / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
}

main().catch(console.error);
