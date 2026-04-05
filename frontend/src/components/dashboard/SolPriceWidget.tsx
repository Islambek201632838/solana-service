import { useState, useEffect } from "react";
import { useLang } from "../../hooks/useLang";

interface Props {
  price: number;
  priceStale: boolean;
  priceLastUpdated: number;
}

export default function SolPriceWidget({ price, priceStale, priceLastUpdated }: Props) {
  const { t } = useLang();
  const [ago, setAgo] = useState("");

  useEffect(() => {
    const update = () => {
      if (!priceLastUpdated) { setAgo("—"); return; }
      const sec = Math.floor(Date.now() / 1000 - priceLastUpdated);
      if (sec < 60) setAgo(`${sec}s`);
      else if (sec < 3600) setAgo(`${Math.floor(sec / 60)}m`);
      else setAgo(`${Math.floor(sec / 3600)}h`);
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [priceLastUpdated]);

  const color = priceStale ? "text-red-400" : "text-green-400";

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">SOL/USD</span>
        <span className={`text-xs ${color}`}>{ago} {t("ago")}</span>
      </div>
      <div className={`text-2xl font-bold ${priceStale ? "text-red-400" : "text-white"}`}>
        ${price.toFixed(2)}
      </div>
      {priceStale && (
        <div className="text-xs text-red-400 mt-1">{t("priceStale")}</div>
      )}
    </div>
  );
}
