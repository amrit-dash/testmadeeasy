/** Resolve Gemini API key — supports legacy and integration env var names. */
export function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

/** Optional custom Gemini API base URL (e.g. proxy or Vertex). */
export function resolveGeminiBaseUrl(): string | undefined {
  return (
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL?.trim() ||
    process.env.GEMINI_BASE_URL?.trim() ||
    undefined
  );
}
