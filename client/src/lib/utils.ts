import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stripLatex(latex: string | null | undefined) {
  if (!latex) return "";
  return latex
    .replace(/\\begin\s*\{(array|tabular|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|align|aligned|gather|gathered|equation|eqnarray)\*?\}[\s\S]*?\\end\s*\{\1\*?\}/g, " [Math/Table] ")
    .replace(/\\begin\{[^}]+\}/g, "")
    .replace(/\\end\{[^}]+\}/g, "")
    .replace(/\\text\{([^}]+)\}/g, "$1") // replace \text{...} with just ...
    .replace(/\\[a-zA-Z]+/g, "") // remove commands like \frac, \sqrt
    .replace(/[{}]/g, "") // remove braces
    .replace(/\$/g, "") // remove math mode delimiters
    .replace(/\s+/g, " ") // normalize spaces
    .trim();
}

let cachedRates: Record<string, number> | null = null;

export async function fetchExchangeRates() {
  try {
    const cached = localStorage.getItem("exchange_rates");
    const lastFetch = localStorage.getItem("exchange_rates_time");

    if (cached && lastFetch && Date.now() - parseInt(lastFetch) < 1000 * 60 * 60 * 24) {
      cachedRates = JSON.parse(cached);
      return;
    }

    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = await res.json();
      cachedRates = data.rates;
      localStorage.setItem("exchange_rates", JSON.stringify(cachedRates));
      localStorage.setItem("exchange_rates_time", Date.now().toString());
    }
  } catch (e) {
    console.error("Failed to fetch rates:", e);
  }

}

export function stripOptionLabel(optionText: string): string {
  if (!optionText) return "";
  let stripped = optionText.replace(/^[\s\(\[]*(\d{1,2}|[A-Za-z]{1,3})[\.\)\]]+(?=\s|$|\$|\\[a-zA-Z]|<)\s*/, "").trim();

  // Smart un-wrap: If option is fully wrapped in $...$ or $$...$$ but doesn't have complex math, remove the $ signs.
  // Also handle the edge case where the AI generated \text{m/s} which got parsed as tab + ext{m/s}
  let raw = stripped;
  if (raw.startsWith("$$") && raw.endsWith("$$")) raw = raw.slice(2, -2).trim();
  else if (raw.startsWith("$") && raw.endsWith("$")) raw = raw.slice(1, -1).trim();

  // If it contains a tab followed by ext (the \text bug), fix it
  raw = raw.replace(/\t/g, " "); // Replace any literal tabs with spaces
  raw = raw.replace(/\\?text\{([^}]+)\}/g, " $1 "); // matches \text{...} or text{...}
  raw = raw.replace(/\\?ext\{([^}]+)\}/g, " $1 "); // matches \ext{...} or ext{...}
  raw = raw.replace(/\\?text([a-zA-Z\/]+)/g, " $1"); // matches \textm/s or textm/s
  raw = raw.replace(/\\?ext([a-zA-Z\/]+)/g, " $1"); // matches \extm/s or extm/s
  raw = raw.replace(/\s+/g, " "); // normalize spaces
  raw = raw.trim();

  // If it doesn't contain complex math commands, fractions, roots, super/subscripts, let's use the un-wrapped version
  const hasComplexMath = /\\(?:frac|sqrt|vec|int|sum|prod|alpha|beta|gamma|theta|pi|mu|rho|sigma|omega|Delta|Omega|text)|[\^_{}]/.test(raw);

  if (!hasComplexMath && raw !== stripped) {
    stripped = raw;
  }

  return stripped.length > 0 ? stripped : optionText;
}

export function parseOptions(optionsLatex: string | null | undefined): string[] {
  if (!optionsLatex) return [];
  const trimmed = optionsLatex.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch (e) {
      // Ignore JSON parse errors and fallback
    }
  }
  return trimmed.split(/\n+/).map(o => o.trim()).filter(Boolean);
}

export function getOptionLabel(index: number, format: string): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const smallLetters = "abcdefghijklmnopqrstuvwxyz";

  if (index < 0 || index >= letters.length) {
    return `${index + 1}.`;
  }

  switch (format) {
    case "A-B-C-D":
      return `${letters[index]}.`;
    case "a-b-c-d":
      return `${smallLetters[index]}.`;
    case "bracket-a":
      return `(${smallLetters[index]})`;
    case "1-2-3-4":
      return `${index + 1}.`;
    default:
      return `${letters[index]}.`;
  }
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  const defaultRates: Record<string, number> = {
    USD: 1,
    INR: 83.5,
    EUR: 0.92,
  };

  const symbols: Record<string, string> = {
    USD: "$",
    INR: "₹",
    EUR: "€",
  };

  const rate = (cachedRates ? cachedRates[currency] : defaultRates[currency]) || 1;
  const symbol = symbols[currency] || "$";

  const converted = amount * rate;
  return `${symbol} ${converted.toFixed(4)}`;
}

export function getPublicImageUrl(src: string | null | undefined): string {
  if (!src) return "";
  if (src.includes("/object/authenticated/")) {
    return src.replace("/object/authenticated/", "/object/public/");
  }
  return src;
}
