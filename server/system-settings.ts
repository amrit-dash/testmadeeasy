import { storage } from "./storage";

export interface SystemSettings {
  imageGenerationModel: string;
  answerGenerationModel: string;
  extractionModel: string;
  masterMatchThreshold: number;
  reviewModel?: string;
}

export let SYSTEM_SETTINGS: SystemSettings = {
  // Open-weight Gemma 4 by default; Gemini models remain selectable in Admin.
  imageGenerationModel: "gemma-4-31b-it",
  answerGenerationModel: "gemma-4-31b-it",
  extractionModel: "gemma-4-31b-it",
  masterMatchThreshold: 85,
  reviewModel: "gemma-4-26b-a4b-it",
};

export async function loadSystemSettingsFromDb() {
  try {
    const settings = await storage.getSystemSettings();
    
    if (settings.activeModels) {
      SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...settings.activeModels };
    }
    if (settings.reviewSettings) {
      SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...settings.reviewSettings };
    }
    console.log("Loaded system settings from DB:", SYSTEM_SETTINGS);
  } catch(e) {
    console.error("Failed to load system settings from DB", e);
  }
}

export async function updateSystemSettings(newSettings: Partial<SystemSettings>) {
  SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...newSettings };
  
  const activeModels = {
    imageGenerationModel: SYSTEM_SETTINGS.imageGenerationModel,
    answerGenerationModel: SYSTEM_SETTINGS.answerGenerationModel,
    extractionModel: SYSTEM_SETTINGS.extractionModel,
    reviewModel: SYSTEM_SETTINGS.reviewModel,
  };
  
  const reviewSettings = {
    masterMatchThreshold: SYSTEM_SETTINGS.masterMatchThreshold,
  };

  await storage.upsertSystemSettings("activeModels", activeModels);
  await storage.upsertSystemSettings("reviewSettings", reviewSettings);
}
