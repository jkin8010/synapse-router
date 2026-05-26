import type { ProviderCard } from "../context";

export interface BillingPreview {
  strategy: string;
  unit: string;
  estimatedCost: number;
  inputCost?: number;
  outputCost?: number;
  hasPricing: boolean;
}

// Pricing shape from provider card features[].pricing
interface ProviderCardPricing {
  input?: number;
  output?: number;
  unit?: string;
}

export function computeBillingPreview(
  provider: ProviderCard | undefined,
  intent: string,
): BillingPreview {
  if (!provider) {
    return { strategy: "unknown", unit: "", estimatedCost: 0, hasPricing: false };
  }

  const feature = provider.features?.find((f) => f.intent === intent);
  const pricing = (feature as Record<string, unknown> | undefined)
    ?.pricing as ProviderCardPricing | undefined;

  if (!pricing) {
    return { strategy: "flat", unit: "per call", estimatedCost: 0, hasPricing: false };
  }

  const inputPrice = pricing.input ?? 0;
  const outputPrice = pricing.output ?? 0;
  const unit = pricing.unit ?? "per call";

  if (/token/i.test(unit)) {
    return {
      strategy: "perToken",
      unit,
      estimatedCost: inputPrice + outputPrice,
      inputCost: inputPrice,
      outputCost: outputPrice,
      hasPricing: true,
    };
  }

  if (/per\s+(image|minute|second|unit)/i.test(unit)) {
    const unitPrice = outputPrice > 0 ? outputPrice : inputPrice;
    return { strategy: "perUnit", unit, estimatedCost: unitPrice, hasPricing: true };
  }

  return { strategy: "flat", unit, estimatedCost: inputPrice + outputPrice, hasPricing: true };
}
