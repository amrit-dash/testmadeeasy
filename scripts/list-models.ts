import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { resolveGeminiApiKey } from "../server/gemini-env";

const ai = new GoogleGenAI({
  apiKey: resolveGeminiApiKey()
});

async function main() {
  try {
    const response = await ai.models.list();
    const models = [];
    for await (const model of response) {
      if (model.name && (model.name.includes("3.1") || model.name.includes("3.0") || model.name.includes("2.5"))) {
        models.push(model.name);
      }
    }
    console.log("Available matching models:", models);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
