import { AlertTriangle, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function StrategyBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
      <Zap className="mt-0.5 size-4 shrink-0" />
      <p className="leading-snug">{t("strategy_banner")}</p>
    </div>
  );
}

export function FraudBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="leading-snug">{t("fraud_banner")}</p>
    </div>
  );
}
