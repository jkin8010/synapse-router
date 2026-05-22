import type { ProviderCard as ProviderCardType } from "../context";
import { useI18n } from "../i18n/context";

interface ProviderCardProps {
  card: ProviderCardType;
  isSelected: boolean;
  isConfigured: boolean;
  onSelect: () => void;
}

export default function ProviderCard({ card, isSelected, isConfigured, onSelect }: ProviderCardProps) {
  const { t } = useI18n();
  const isClickable = isConfigured;

  const containerClass = isSelected
    ? "bg-zinc-900/50 border border-emerald-400 ring-1 ring-emerald-400/30 rounded-xl p-3 cursor-pointer transition-colors duration-150"
    : isClickable
      ? "bg-zinc-900/50 border border-zinc-700 rounded-xl p-3 cursor-pointer transition-colors duration-150 hover:border-zinc-600"
      : "bg-zinc-900/50 border border-zinc-700 rounded-xl p-3 opacity-60 cursor-not-allowed";

  const handleClick = () => {
    if (isClickable) onSelect();
  };

  const visibleFeatures = card.features.slice(0, 3);

  return (
    <div className={containerClass} onClick={handleClick}>
      {/* Title row */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full inline-block ${isSelected ? "bg-emerald-400" : "bg-zinc-500"}`}
        />
        <span className="text-sm font-medium text-zinc-100">{card.provider.name}</span>
      </div>

      {/* Description */}
      {card.provider.description && (
        <p className="text-xs text-zinc-400 mb-2 truncate">{card.provider.description}</p>
      )}

      {/* Feature badges */}
      {visibleFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {visibleFeatures.map((feature) => (
            <span
              key={feature.feature_id}
              className="bg-zinc-800 text-zinc-300 text-xs rounded-md px-2 py-0.5"
            >
              {feature.feature_name || feature.feature_id}
            </span>
          ))}
        </div>
      )}

      {/* Feature count */}
      <p className="text-xs text-zinc-500">{card.features.length} {t("pack.features")}</p>

      {/* base_url display */}
      {card.service?.base_url && (
        <p className="text-xs text-zinc-500 mt-0.5 truncate">
          <span className="text-zinc-600">URL: </span>
          {card.service.base_url}
        </p>
      )}

      {/* Not configured warning */}
      {!isConfigured && (
        <p className="text-xs text-yellow-400 mt-1">{t("pack.noKey")}</p>
      )}
    </div>
  );
}
