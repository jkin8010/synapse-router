import type { ProviderCard as ProviderCardType } from "../context";

interface ProviderCardProps {
  card: ProviderCardType;
  isSelected: boolean;
  isConfigured: boolean;
  onSelect: () => void;
}

export default function ProviderCard({ card, isSelected, isConfigured, onSelect }: ProviderCardProps) {
  const isClickable = isConfigured;

  const containerClass = isSelected
    ? "bg-gray-850 border border-blue-500 ring-1 ring-blue-500/30 rounded-lg p-3 cursor-pointer transition-colors duration-150"
    : isClickable
      ? "bg-gray-850 border border-gray-700 rounded-lg p-3 cursor-pointer transition-colors duration-150"
      : "bg-gray-850 border border-gray-700 rounded-lg p-3 opacity-60 cursor-not-allowed";

  const handleClick = () => {
    if (isClickable) onSelect();
  };

  const visibleFeatures = card.features.slice(0, 3);

  return (
    <div className={containerClass} onClick={handleClick}>
      {/* Title row */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full inline-block ${isSelected ? "bg-blue-500" : "bg-gray-500"}`}
        />
        <span className="text-sm font-medium text-gray-100">{card.provider.name}</span>
      </div>

      {/* Description */}
      {card.provider.description && (
        <p className="text-xs text-gray-400 mb-2 truncate">{card.provider.description}</p>
      )}

      {/* Feature badges */}
      {visibleFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {visibleFeatures.map((feature) => (
            <span
              key={feature.feature_id}
              className="bg-gray-800 text-gray-300 text-xs rounded-md px-2 py-0.5"
            >
              {feature.feature_name || feature.feature_id}
            </span>
          ))}
        </div>
      )}

      {/* Feature count */}
      <p className="text-xs text-gray-500">{card.features.length} features</p>

      {/* Not configured warning */}
      {!isConfigured && (
        <p className="text-xs text-yellow-400 mt-1">(no key configured)</p>
      )}
    </div>
  );
}
