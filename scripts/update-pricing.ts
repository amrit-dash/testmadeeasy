import { storage } from "../server/storage";
import * as cheerio from "cheerio";
import { updateAiPricingChart, ModelPricing, AI_PRICING_CHART } from "../server/ai-pricing";

export async function fetchAndUpdatePricingChart(): Promise<Record<string, ModelPricing> | null> {
  try {
    const res = await fetch("https://ai.google.dev/gemini-api/docs/pricing", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const newChart: Record<string, ModelPricing> = {};
    let currentModelName = "";
    
    // We try a broad search for model names, and the next table
    $('h3, h4, h2').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes("gemini 3.1 pro") || text.includes("gemini-3.1-pro")) {
        currentModelName = "gemini-3.1-pro-preview";
      } else if (text.includes("gemini 3.1 flash-lite") || text.includes("gemini-3.1-flash-lite")) {
        currentModelName = "gemini-3.1-flash-lite-preview";
      } else if (text.includes("gemini 3 flash") || text.includes("gemini-3-flash")) {
        currentModelName = "gemini-3-flash-preview";
      } else if (text.includes("gemini 2.5 pro") || text.includes("gemini-2.5-pro")) {
        currentModelName = "gemini-2.5-pro";
      } else if ((text.includes("gemini 2.5 flash-lite") || text.includes("gemini-2.5-flash-lite"))) {
        currentModelName = "gemini-2.5-flash-lite";
      } else if ((text.includes("gemini 2.5 flash") || text.includes("gemini-2.5-flash")) && !text.includes("lite") && !text.includes("8b")) {
        currentModelName = "gemini-2.5-flash";
      } else {
        currentModelName = ""; // Skip unrecognized models
      }
      
      if (currentModelName) {
        // Find the next table
        const table = $(el).nextAll('table').first();
        if (table.length > 0) {
          let promptRate1 = 0, completionRate1 = 0;
          let promptRate2 = 0, completionRate2 = 0;
          // Look explicitly for 128k or 200k in the row headers
          let threshold = 200000; 

          table.find('tr').each((_, tr) => {
            const cells = $(tr).find('th, td').map((_, cell) => $(cell).text().trim().replace(/\s+/g, ' ')).get();
            if (cells.length >= 3) {
              const header = cells[0].toLowerCase();
              const paidTierText = cells[2]; 
              
              // Extract prices. E.g., "$1.25" or "$0.30"
              const prices = paidTierText.match(/\$(\d+\.\d+)/g);
              if (prices && prices.length >= 1) {
                const p1 = parseFloat(prices[0].replace('$', ''));
                
                // If there's a second price, it implies a tiered structure
                const hasTier = prices.length >= 2;
                const p2 = hasTier ? parseFloat(prices[1].replace('$', '')) : p1;

                if (header.includes("input")) {
                  promptRate1 = p1;
                  promptRate2 = p2;
                } else if (header.includes("output")) {
                  completionRate1 = p1;
                  completionRate2 = p2;
                }
                
                if (!hasTier) {
                   threshold = Infinity; // Force flat rate if only one price is found
                }
              }
              
              if (threshold !== Infinity) {
                const tkMatch = paidTierText.match(/(\d+)k\s+tokens/i);
                if (tkMatch) {
                    threshold = parseInt(tkMatch[1], 10) * 1000;
                }
              }
            }
          });

          if (promptRate1 > 0 && completionRate1 > 0 && !newChart[currentModelName]) {
            if (threshold === Infinity || (promptRate1 === promptRate2 && completionRate1 === completionRate2)) {
               // Flat rate
               newChart[currentModelName] = {
                 tiers: [
                   { threshold: Infinity, promptRate: promptRate1, completionRate: completionRate1 }
                 ]
               };
            } else {
               // Tiered
               newChart[currentModelName] = {
                 tiers: [
                   { threshold: threshold, promptRate: promptRate1, completionRate: completionRate1 },
                   { threshold: Infinity, promptRate: promptRate2, completionRate: completionRate2 }
                 ]
               };
            }
          }
        }
      }
    });

    // If scraping failed to find all, merge with current defaults
        // Hardcode fallback just in case Google completely breaks the HTML structure
    const fallbackChart: Record<string, ModelPricing> = {
      "gemini-3.1-pro-preview": {
        tiers: [
          { threshold: 200000, promptRate: 2.00, completionRate: 12.00 },
          { threshold: Infinity, promptRate: 4.00, completionRate: 18.00 }
        ]
      },
      "gemini-3-flash-preview": {
        tiers: [
          { threshold: Infinity, promptRate: 0.50, completionRate: 3.00 }
        ]
      },
      "gemini-3.1-flash-lite-preview": {
        tiers: [
          { threshold: Infinity, promptRate: 0.25, completionRate: 1.50 }
        ]
      },
      "gemini-2.5-pro": {
        tiers: [
          { threshold: 200000, promptRate: 1.25, completionRate: 10.00 },
          { threshold: Infinity, promptRate: 2.50, completionRate: 15.00 }
        ]
      },
      "gemini-2.5-flash": {
        tiers: [
          { threshold: Infinity, promptRate: 0.30, completionRate: 2.50 }
        ]
      },
      "gemini-2.5-flash-lite": {
        tiers: [
          { threshold: Infinity, promptRate: 0.10, completionRate: 0.40 }
        ]
      }
    };

    const finalChart = { ...fallbackChart, ...newChart };

    updateAiPricingChart(finalChart);
    for (const [model, pricing] of Object.entries(finalChart)) {
      await storage.upsertAiPricing(model, pricing.tiers).catch(console.error);
    }
    return finalChart;
  } catch (error) {
    console.error("Failed to scrape Google Pricing:", error);
    // Return existing memory chart as fallback instead of failing
    return AI_PRICING_CHART;
  }
}
