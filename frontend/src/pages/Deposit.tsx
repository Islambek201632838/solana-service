import { useState } from "react";
import { useLang } from "../hooks/useLang";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import DepositForm from "../components/dashboard/DepositForm";
import { usePool } from "../hooks/usePool";
import { useBreakpoint } from "../hooks/useMediaQuery";
import { PROGRAM_ID, derivePoolPDA, deriveVaultPDA, derivePositionPDA, BN } from "../utils/anchor";

const TOKEN_MINT = new PublicKey(import.meta.env.VITE_TOKEN_MINT || "11111111111111111111111111111111");
const POOL_AUTHORITY = new PublicKey(import.meta.env.VITE_POOL_AUTHORITY || "11111111111111111111111111111111");

export default function Deposit() {
  const { stats } = usePool();
  const { isMobile } = useBreakpoint();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const { t } = useLang();

  const handleDeposit = async (amount: number) => {
    if (!publicKey || !sendTransaction) {
      setTxStatus("Connect wallet first");
      return;
    }

    setLoading(true);
    setTxStatus(null);

    try {
      const amountLamports = new BN(Math.floor(amount * 1_000_000)); // 6 decimals
      const [poolPDA] = derivePoolPDA(POOL_AUTHORITY);
      const [vaultPDA] = deriveVaultPDA(poolPDA);
      const [positionPDA] = derivePositionPDA(poolPDA, publicKey);
      const userAta = await getAssociatedTokenAddress(TOKEN_MINT, publicKey);

      // Anchor discriminator for "deposit"
      const discriminator = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
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
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      };

      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setTxStatus(`Deposited ${amount} aiUSDC — TX: ${sig.slice(0, 8)}...`);
    } catch (e: any) {
      setTxStatus(`Error: ${e.message?.slice(0, 100)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("depositTitle")}</h2>

      {txStatus && (
        <div className={`rounded-lg px-4 py-3 text-sm ${txStatus.startsWith("Error") ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
          {txStatus}
        </div>
      )}

      <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-6`}>
        <DepositForm onDeposit={handleDeposit} maxBalance={10000} loading={loading} />

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-400">{t("yourPosition")}</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t("deposited")}</span>
              <span>${stats?.total_deposits_usd?.toLocaleString() ?? "0"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t("interestRate")}</span>
              <span>{stats?.interest_rate_pct?.toFixed(2) ?? "0"}% APY</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t("poolUtilization")}</span>
              <span>{stats?.utilization_pct?.toFixed(1) ?? "0"}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
