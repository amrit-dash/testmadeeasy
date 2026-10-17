import { storage } from "./storage";

export async function loadPricingChartFromDb() {
  try {
    const chart = await storage.getAiPricingChart();
    if (Object.keys(chart).length > 0) {
      // Fix JSON serialization where Infinity becomes null
      for (const model of Object.keys(chart)) {
        for (const tier of chart[model].tiers) {
          if (tier.threshold === null) tier.threshold = Infinity;
        }
      }
      AI_PRICING_CHART = { ...AI_PRICING_CHART, ...chart };
      console.log("Loaded AI pricing chart from DB");
    }
  } catch(e) {
    console.error("Failed to load AI pricing from DB", e);
  }
}
export interface PricingTier {
  threshold: number; // if Infinity, applies to all above previous threshold
  promptRate: number;
  completionRate: number;
  cachedPromptRate?: number;
}

export interface ModelPricing {
  tiers: PricingTier[];
  maxOutputTokens?: number;
}

// Gemma 4 open-weight models served through the Gemini API (same API key).
// Free of charge on the Gemini API; output capped at 32K tokens.
const GEMMA_PRICING: Record<string, ModelPricing> = {
  "gemma-4-31b-it": {
    maxOutputTokens: 32768,
    tiers: [{ threshold: Infinity, promptRate: 0, completionRate: 0, cachedPromptRate: 0 }]
  },
  "gemma-4-26b-a4b-it": {
    maxOutputTokens: 32768,
    tiers: [{ threshold: Infinity, promptRate: 0, completionRate: 0, cachedPromptRate: 0 }]
  },
};

export function isGemmaModel(model: string): boolean {
  return model.startsWith("gemma-");
}

// Pricing Chart from Google API docs (Updated for Gemini 2.5 and 3.1)
// Tiered pricing: <= 200K context vs > 200K context
export let AI_PRICING_CHART: Record<string, ModelPricing> = {
  ...GEMMA_PRICING,
  "gemini-3.1-pro-preview": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: 200000, promptRate: 2.00, completionRate: 12.00, cachedPromptRate: 0.50 },
      { threshold: Infinity, promptRate: 4.00, completionRate: 18.00, cachedPromptRate: 1.00 }
    ]
  },
  "gemini-3-flash-preview": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: Infinity, promptRate: 0.50, completionRate: 3.00, cachedPromptRate: 0.05 }
    ]
  },
  "gemini-3.1-flash-lite-preview": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: Infinity, promptRate: 0.25, completionRate: 1.50, cachedPromptRate: 0.065 }
    ]
  },
  "gemini-2.5-pro": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: 200000, promptRate: 1.25, completionRate: 10.00, cachedPromptRate: 0.3125 },
      { threshold: Infinity, promptRate: 2.50, completionRate: 15.00, cachedPromptRate: 0.625 }
    ]
  },
  "gemini-2.5-flash": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: Infinity, promptRate: 0.30, completionRate: 2.50, cachedPromptRate: 0.075 }
    ]
  },
  "gemini-2.5-flash-lite": {
    maxOutputTokens: 65536,
    tiers: [
      { threshold: Infinity, promptRate: 0.10, completionRate: 0.40, cachedPromptRate: 0.025 }
    ]
  }
};

export function updateAiPricingChart(newChart: Record<string, ModelPricing>) {
  // The pricing scraper only knows Gemini models; keep Gemma entries intact.
  AI_PRICING_CHART = { ...GEMMA_PRICING, ...newChart };
}

export function getMaxOutputTokens(model: string): number {
  return AI_PRICING_CHART[model]?.maxOutputTokens || GEMMA_PRICING[model]?.maxOutputTokens || (isGemmaModel(model) ? 32768 : 65536);
}

export function calculateAiCost(model: string, promptTokens: number, completionTokens: number, totalPromptTokensForTier?: number, cachedTokens: number = 0): number {
  const effectivePromptTokens = totalPromptTokensForTier !== undefined ? totalPromptTokensForTier : promptTokens;
  
  let pricing = AI_PRICING_CHART[model];
  
  // Default fallbacks if the specific model string isn't in the chart
  if (!pricing) {
    if (isGemmaModel(model)) {
       pricing = GEMMA_PRICING["gemma-4-31b-it"];
    } else if (model.includes("flash")) {
       pricing = AI_PRICING_CHART["gemini-2.5-flash"];
    } else if (model.includes("pro")) {
       pricing = AI_PRICING_CHART["gemini-2.5-pro"];
    } else {
       pricing = { maxOutputTokens: 65536, tiers: [{ threshold: Infinity, promptRate: 0.50, completionRate: 1.50, cachedPromptRate: 0.125 }] };
    }
  }

  // Find the appropriate tier based on total prompt tokens
  const tier = pricing.tiers.find(t => effectivePromptTokens <= t.threshold) || pricing.tiers[pricing.tiers.length - 1];

  const cachedRate = tier.cachedPromptRate ?? (tier.promptRate * 0.25);
  
  // promptTokens already includes cached tokens in Gemini API? 
  // Wait, typically promptTokenCount is the total. So the billed regular prompt tokens is (promptTokenCount - cachedContentTokenCount).
  // But wait, to be safe, if the API returns them separately, we do:
  // If promptTokens is the total prompt tokens, and cachedTokens is the subset:
  const regularPromptTokens = Math.max(0, promptTokens - cachedTokens);

  const promptCost = (regularPromptTokens / 1_000_000) * tier.promptRate;
  const cachedCost = (cachedTokens / 1_000_000) * cachedRate;
  const completionCost = (completionTokens / 1_000_000) * tier.completionRate;

  return promptCost + cachedCost + completionCost;
}

export function getAiPricingChart() {
  return AI_PRICING_CHART;
}
