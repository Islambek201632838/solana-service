import { useLang } from "../../hooks/useLang";

interface Props {
  collateralRatioPct: number;
  priceStale?: boolean;
}

export default function LtvModeBadge({ collateralRatioPct }: Props) {
  const { t } = useLang();

  let mode: string;
  let color: string;
  if (collateralRatioPct >= 180) {
    mode = t("ltvExtreme");
    color = "bg-red-600/20 text-red-400 border-red-500/30";
  } else if (collateralRatioPct >= 150) {
    mode = t("ltvStorm");
    color = "bg-orange-600/20 text-orange-400 border-orange-500/30";
  } else if (collateralRatioPct >= 130) {
    mode = t("ltvNormal");
    color = "bg-green-600/20 text-green-400 border-green-500/30";
  } else {
    mode = t("ltvCalm");
    color = "bg-cyan-600/20 text-cyan-400 border-cyan-500/30";
  }

  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${color}`}>
      {t("collateral")} {collateralRatioPct.toFixed(0)}% — {mode}
    </span>
  );
}
