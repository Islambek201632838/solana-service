import { useState } from "react";
import { useLang } from "../hooks/useLang";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import BorrowForm from "../components/dashboard/BorrowForm";
import { usePool } from "../hooks/usePool";
import { PROGRAM_ID, derivePoolPDA, deriveVaultPDA, derivePositionPDA, BN } from "../utils/anchor";

const TOKEN_MINT = new PublicKey(import.meta.env.VITE_TOKEN_MINT || "11111111111111111111111111111111");
const POOL_AUTHORITY = new PublicKey(import.meta.env.VITE_POOL_AUTHORITY || "11111111111111111111111111111111");

export default function Borrow() {
  const { state } = usePool();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const { t } = useLang();

  const handleBorrow = async (amount: number) => {
    if (!publicKey || !sendTransaction) {
      setTxStatus("Connect wallet first");
      return;
    }

    setLoading(true);
    setTxStatus(null);

    try {
      const amountLamports = new BN(Math.floor(amount * 1_000_000));
      const [poolPDA] = derivePoolPDA(POOL_AUTHORITY);
      const [vaultPDA] = deriveVaultPDA(poolPDA);
      const [positionPDA] = derivePositionPDA(poolPDA, publicKey);
      const userAta = await getAssociatedTokenAddress(TOKEN_MINT, publicKey);

      // Anchor discriminator for "borrow"
      const discriminator = Buffer.from([228, 253, 131, 202, 235, 176, 183, 247]);
      const data = Buffer.alloc(8 + 8);
      discriminator.copy(data);
      data.writeBigUInt64LE(BigInt(amountLamports.toString()), 8);

      const ix = {
        programId: PROGRAM_ID,
        keys: [
          { pubkey: poolPDA, isSigner: false, isWritable: true },
          { pubkey: vaultPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
          { pubkey: positionPDA, isSigner: false, isWritable: true },
          { pubkey: userAta, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      };

      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setTxStatus(`Borrowed ${amount} aiUSDC — TX: ${sig.slice(0, 8)}...`);
    } catch (e: any) {
      setTxStatus(`Error: ${e.message?.slice(0, 100)}`);
    } finally {
      setLoading(false);
    }
  };

  const solPrice = (state?.sol_price_usd ?? 0) / 1_000_000;
  const collateralRatio = (state?.collateral_ratio_bps ?? 15000) / 100;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("borrowTitle")}</h2>

      {txStatus && (
        <div className={`rounded-lg px-4 py-3 text-sm ${txStatus.startsWith("Error") ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
          {txStatus}
        </div>
      )}

      <BorrowForm
        onBorrow={handleBorrow}
        collateralSol={0}
        solPrice={solPrice || 185}
        collateralRatio={collateralRatio}
        currentBorrowed={0}
        loading={loading}
      />
    </div>
  );
}
