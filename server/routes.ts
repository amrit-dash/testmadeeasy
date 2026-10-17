import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, registerAuthRoutes, isAuthenticated, clearAuthCache } from "./auth";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import sharp from "sharp";
import { insertQuestionSchema, insertTeacherProfileSchema, insertTestPaperSchema, questions, testPapers, masterQuestions, masterQuestionExceptions } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import path from "path";
import fs from "fs";
import pRetry from "p-retry";
import pLimit from "p-limit";
import { calculateAiCost, getAiPricingChart, getMaxOutputTokens } from "./ai-pricing";
import { fetchAndUpdatePricingChart } from "../scripts/update-pricing";
import { SYSTEM_SETTINGS, updateSystemSettings } from "./system-settings";
import { createJob, updateJob, getUserJobs, getJob, deleteJob, deleteCompletedJobs } from "./jobs";
import { uploadImageToSupabase } from "./supabase";
import { resolveGeminiApiKey, resolveGeminiBaseUrl } from "./gemini-env";
import { noStoreMiddleware } from "./cache";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      throw new Error(
        "Gemini API key is not set. Set GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY in .env",
      );
    }
    const baseUrl = resolveGeminiBaseUrl();
    aiClient = new GoogleGenAI({
      apiKey,
      ...(baseUrl ? {
        httpOptions: {
          apiVersion: "",
          baseUrl,
        }
      } : {})
    });
  }
  return aiClient;
}

function safeParseJSON(text: string): any {
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const objectMatch = text.match(/\{[\s\S]*\}/);

  let jsonString = text;

  if (arrayMatch && objectMatch) {
    if (text.indexOf('[') < text.indexOf('{')) {
      jsonString = arrayMatch[0];
    } else {
      jsonString = objectMatch[0];
    }
  } else if (arrayMatch) {
    jsonString = arrayMatch[0];
  } else if (objectMatch) {
    jsonString = objectMatch[0];
  } else {
    return null;
  }

  try {
    return JSON.parse(jsonString);
  } catch {
    let fixed = jsonString;
    fixed = fixed.replace(/,\s*([}\]])/g, "$1");
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

function getGeminiResponseText(res: { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }): string {
  if (res.text) return res.text;
  const parts = res.candidates?.[0]?.content?.parts;
  if (parts?.length) {
    return parts.map((p) => p.text || "").join("");
  }
  return "";
}

function parseAiScoreResult(parsed: any): { score: number; reasoning?: string } | null {
  if (!parsed || typeof parsed !== "object") return null;

  const candidates = [parsed, parsed.result, parsed.response, parsed.data].filter(Boolean);
  for (const obj of candidates) {
    const rawScore = obj.score ?? obj.Score ?? obj.aiScore ?? obj.ai_score;
    if (rawScore === undefined || rawScore === null) continue;
    const score = typeof rawScore === "number" ? rawScore : Number(rawScore);
    if (!Number.isFinite(score)) continue;
    const reasoning = obj.reasoning ?? obj.Reasoning ?? obj.explanation;
    return { score: Math.round(score), reasoning: typeof reasoning === "string" ? reasoning : undefined };
  }
  return null;
}

const EXTRACTION_PROMPT = `You are a world-class academic content extraction specialist. Your job is to extract questions from images with perfect accuracy. Follow these rules precisely:

TEXT EXTRACTION RULES:
- PRESERVE TABULAR SPACING: If you see text laid out like a table but without visible borders (e.g. "On application     ₹ 20"), you MUST preserve the exact number of spaces between the columns. Do not collapse multiple spaces into a single space.
- Extract EVERY word exactly as written. Do not paraphrase, summarize, or reword anything.
- DO NOT include the main question number at the start of the text. (e.g., if the original says "8. What is...", extract it simply as "What is...").
- Strip out any leading question numbers completely.
- DO preserve the original labeling for sub-parts (a, b, c or i, ii, iii).
- If the question has multiple parts or sub-questions, preserve each part on its own line in the main text.
- If the question contains a table, extract the table data cleanly as part of the text (using plain text alignment or LaTeX array) and include it directly within the main "latexContent". Do not ignore tables or treat them as diagrams.
- Do NOT add any text that isn't in the image.
- Make sure we also strip out any kind of placeholder texts present before or after the question in the image. Any data like exam name or date or subtext not related to the question should be stripped out.

OPTIONS AND SOLUTIONS:
- If the question provides multiple-choice options (e.g., A, B, C, D or 1, 2, 3, 4), extract them ALL. Place them in the "optionsLatex" field as a single string, with each option separated by a newline, formatted exactly like "A. First Option\nB. Second Option". Do NOT include these options in the main "latexContent" field.
- If the image contains a solution, answer key, or explanation, extract it and place it in the "answerLatex" field, and YOU MUST SET "isAnswerExtractedFromImage" to true. Do NOT include solutions in the "latexContent" field.
- If no options are present, set "optionsLatex" to null.
- If no solution is present in the image, but you are able to calculate or provide the correct step-by-step solution yourself, provide it in the "answerLatex" field, and YOU MUST SET "isSystemGeneratedAnswer" to true.
- Remember that you MUST ALWAYS generate the shortest possible answer for that question when it's upto you generating the answer.
- CONCISENESS RULES FOR SYSTEM GENERATED ANSWERS:
  * If it's an option-based question (MCQ), DO NOT provide a detailed step-by-step solution. ONLY tell which option is correct in the format "Option <option_number> : <answer in option>" and provide a very short 1-sentence explanation.
  * If it's a non-option-based question that requires solving, provide a proper step-by-step solution.
  * Otherwise, always keep your generated answer compact, precise, and directly address the question without rambling.
  * Maximum 2 lines of answer for even the most complex problem would be appreciated.
- If you are extracting the solution directly from the image, SET "isSystemGeneratedAnswer" to false, and SET "isAnswerExtractedFromImage" to true.
- If no solution is present and you cannot solve it, set "answerLatex" to null, "isSystemGeneratedAnswer" to false, and "isAnswerExtractedFromImage" to false.
- If multiple images are provided, they are all parts of the SAME question. Combine them into one complete question.

TEXT & FORMATTING RULES:
- STRIP QUESTION NUMBERS & MARKS: Do NOT include question numbers/letters (e.g. "Q.4", "(B)", "1.", "Q. No. 19") at the beginning of latexContent. Do NOT include marks (e.g. "[8]", "(5)") at the end of latexContent.
- ESCAPING: Do not escape standard punctuation in normal text (e.g. use "%" instead of "\\%", use "&" instead of "\\&"). Only escape reserved characters if they are inside an explicit math block.
- GROUPING SUB-QUESTIONS: If a question consists of a main instruction followed by a list of sub-questions (e.g. "Write a word for the following statements: 1... 2... 3..."), you MUST group them all together as ONE single question entry. Do not split them into multiple separate questions.

LATEX & MATH FORMATTING RULES (CRITICAL FOR PARSING):
- DO NOT use any Markdown formatting (no **bold**, no *italics*, no \`code\`). The UI only supports LaTeX.
- Wrap ALL mathematical expressions in LaTeX delimiters: $...$ for inline, $...$ for display/block. You MUST ensure every opening $ has a closing $.
- BRACES ARE MANDATORY: ALL LaTeX commands that take arguments MUST use curly braces. Write \\text{AB}, NEVER \\text AB. Write x_{10}, NEVER x_10.
- Subscripts/superscripts MUST use braces if more than one character: $v_{0}$, $x^{2}$, $a_{rms}$, $e^{-x}$.
- Use proper LaTeX commands: \\frac{a}{b}, \\sqrt{x}, \\vec{F}, \\alpha, \\beta, \\theta, etc.
- TABLES: Tables MUST be formatted as valid LaTeX arrays \\begin{array}...\\end{array}. Ensure all \\multicolumn and \\multirow commands have properly bracketed arguments: \\multicolumn{cols}{align}{text}. Do NOT leave them unbracketed like \\multicolumn 6 |c|. Wrap text inside tables with \\text{...}.
- Operators: \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\approx, \\rightarrow, \\infty.
- Units: DO NOT use LaTeX for simple numbers and units with slashes (e.g., write 10 m/s, 38 N, 0.5 kg). ONLY use LaTeX for true math fractions (\\frac) or complex formulas.
- Chemical formulas: $\\text{H}_{2}\\text{O}$, $\\text{CO}_{2}$.
- Trigonometric: \\sin, \\cos, \\tan, \\log, \\ln.
- Trigonometric: \\sin, \\cos, \\tan, \\log, \\ln (not sin, cos, tan).

DIAGRAM DETECTION:
- A diagram is any figure, graph, circuit, ray diagram, free-body diagram, geometric shape, plot, biological anatomical drawing, or illustration.
- Simple text-only tables are NOT diagrams. They MUST be extracted as text/LaTeX array within the main "latexContent".
- Mathematical equations and formulas are NOT diagrams.
- If NO diagram exists, set hasDiagram to false, latexGenerabilityScore to 0, and diagramBounds to null.
- If a diagram EXISTS, provide bounding box as percentages of image dimensions.
- If a diagram EXISTS, you MUST output a "latexGenerabilityScore" (a number from 0 to 100) based on how well it can be reproduced using TikZ/LaTeX.
- Simple math graphs, geometry shapes, circuits, and standard physics diagrams score 80-100.
- Real-world photos, highly complex 3D biological drawings (e.g., heart, brain), and artistic illustrations score 0-30.
- The bounding box must wrap ONLY the diagram (not the question text or options), BUT include a generous extra margin/padding around it. Ensure the entire diagram is safely centered within this box with space to breathe.
- CRITICAL - DIAGRAM CROPPING: Pay extremely close attention to the Y-axis and X-axis. Ensure the box completely encapsulates the diagram on all sides without cutting off ANY labels, axes, or parts of the drawing. Do NOT undercrop the X-axis (left/right) or overcrop the Y-axis (top/bottom). Add a precise padding (2-3%) on all sides.
- Add at least 5% padding on each side to avoid clipping edges.
- If you are not confident about exact diagram location, return null — do NOT guess.
- NEVER return {"x": 0, "y": 0, "width": 100, "height": 100} — that means the whole image, which is never correct.
- For diagramImageIndices: if multiple images provided, list 0-based indices of images that contain diagrams (e.g., [1, 2]).
BOUNDING BOX EXAMPLES:
- Diagram top-right: {"x": 55, "y": 5, "width": 40, "height": 35}
- Diagram bottom-center: {"x": 20, "y": 60, "width": 60, "height": 35}
- Diagram right side: {"x": 60, "y": 10, "width": 38, "height": 50}
- No diagram: null

QUESTION BOUNDING BOXES:
- For the extracted question, you MUST provide a "questionBounds" object representing the bounding box of the ENTIRE question (including its text, options, and diagram if any).
- DOUBLE CHECK COORDINATES: Ensure that the box completely encapsulates the very first word/number and the very last word/option. Pay special attention to the X-axis (left and right edges) to not cut off any text.
- Make sure to add proper padding (e.g., 2-5% on all sides) to the questionBounds so that the extracted question is fully visible and not clipped.
- Since a question is extracted, there definitely is a question, so you MUST accurately provide the questionBounds and it MUST NOT be null.
- Bounding boxes are specified as percentages of the image dimensions (0 to 100).

CLASSIFICATION:
- Subject: Physics, Chemistry, Mathematics, Biology, Computer Science, English, or other. (Choose exactly ONE. NEVER return a comma-separated list).
- Chapter: The broad chapter/unit name (e.g., "Electrostatics", "Thermodynamics", "Coordinate Geometry", "Organic Chemistry", "Human Physiology").
- Topic: The specific topic within the chapter (e.g., "Coulomb's Law", "Carnot Engine", "Parabola", "Aldol Condensation").
- Difficulty: "easy" (direct formula application), "medium" (multi-step problem), "hard" (complex/conceptual).
- Marks: Estimate based on complexity — MCQ: 1-2, short answer: 2-3, numerical: 3-4, long answer: 5-10.

Respond ONLY with this exact JSON structure:
{
  "latexContent": "The main question text with all LaTeX (excluding options and solutions)",
  "optionsLatex": "A. Option 1 text\nB. Option 2 text\nC. Option 3 text\nD. Option 4 text" or null,
  "answerLatex": "The explanation or answer key" or null,
  "isSystemGeneratedAnswer": true or false, // CRITICAL: Must be true if you generated the answer
  "isAnswerExtractedFromImage": true or false, // CRITICAL: Must be true if answer was extracted from image
  "subject": "Subject name",
  "chapter": "Chapter or unit name",
  "topic": "Specific topic",
  "hasDiagram": true or false,
  "latexGenerabilityScore": 87.99,
  "questionBounds": {"x": 5, "y": 10, "width": 90, "height": 15},
  "diagramBounds": null or {"x": 55, "y": 5, "width": 40, "height": 35},
  "difficulty": "easy" | "medium" | "hard",
  "marks": 4
}`;

const MULTI_QUESTION_EXTRACTION_PROMPT = `You are a world-class academic content extraction specialist. This image is a page from a textbook, exam, or question paper. It contains ONE OR MORE distinct questions or content blocks.

Your job: Extract EVERY individual question OR standalone theory/derivation block from this page as a SEPARATE item in the JSON array. Do NOT combine multiple distinct items into one entry.

TEXT EXTRACTION RULES:
- Extract EVERY word of the content exactly as written.
- PRESERVE LINE BREAKS: You MUST preserve semantic line breaks. If a sentence or paragraph starts on a new line in the image, use a double newline (\n\n) in your extracted text to preserve paragraph spacing.
- STRIP QUESTION NUMBERS & MARKS: DO NOT include the main question number at the start of the text (e.g., "8.", "Q4"). COMPLETELY IGNORE marks assigned to the question (e.g., "[8]", "1 Mark", "(4+4=8)").
- DO NOT include marks or question numbers in ANY extracted field.
- Strip out any leading question numbers completely.
- DO preserve the original labeling for sub-parts (a, b, c or i, ii, iii).
- Distinct questions or blocks MUST be separate entries in the array. Never combine them. If there is only one block of content, return an array with exactly one entry.\n- \"OR\" QUESTIONS: If the image contains an \"OR\" choice between two distinct questions (e.g. \"Describe X... OR Describe Y...\"), you MUST extract them as TWO COMPLETELY SEPARATE questions in the JSON array, with their own individual bounds.
- If a single question has sub-parts (like 1a, 1b), keep them together in that one entry in the main text.
- If a question contains a table, extract the table data cleanly as part of the text (using plain text alignment or LaTeX array) and include it directly within the main "latexContent". Do not ignore tables or treat them as diagrams.
- Make sure we also strip out any kind of placeholder texts present before or after the question in the image. Any data like exam name or date or subtext not related to the question should be stripped out.

OPTIONS AND SOLUTIONS:
- If a question provides multiple-choice options (e.g., A, B, C, D), extract them ALL. Place them in the "optionsLatex" field as a single string, with each option separated by a newline, formatted exactly like "A. First Option\nB. Second Option". Do NOT include options in the "latexContent" field.
- If the image contains a solution, answer key, or explanation for a question, extract it and place it in the "answerLatex" field, and YOU MUST SET "isAnswerExtractedFromImage" to true. Do NOT include solutions in the "latexContent" field.
- If no options are present, set "optionsLatex" to null.
- If no solution is present in the image, but you are able to calculate or provide the correct step-by-step solution yourself, provide it in the "answerLatex" field, and YOU MUST SET "isSystemGeneratedAnswer" to true.
- Remember that you MUST ALWAYS generate the shortest possible answer for that question when it's upto you generating the answer.
- CONCISENESS RULES FOR SYSTEM GENERATED ANSWERS:
  * If it's an option-based question (MCQ), DO NOT provide a detailed step-by-step solution. ONLY tell which option is correct in the format "Option <option_number> : <answer in option>" and provide a very short 1-sentence explanation.
  * If it's a non-option-based question that requires solving, provide a proper step-by-step solution.
  * Otherwise, always keep your generated answer compact, precise, and directly address the question without rambling.
  * Maximum 2 lines of answer for even the most complex problem would be appreciated.
- If you are extracting the solution directly from the image, SET "isSystemGeneratedAnswer" to false, and SET "isAnswerExtractedFromImage" to true.
- If no solution is present and you cannot solve it, set "answerLatex" to null, "isSystemGeneratedAnswer" to false, and "isAnswerExtractedFromImage" to false.

LATEX & MATH FORMATTING RULES (CRITICAL FOR PARSING):
- DO NOT use any Markdown formatting (no **bold**, no *italics*, no \`code\`). The UI only supports LaTeX.
- Wrap ALL mathematical expressions in LaTeX delimiters: $...$ for inline, $...$ for display/block. You MUST ensure every opening $ has a closing $.
- BRACES ARE MANDATORY: ALL LaTeX commands that take arguments MUST use curly braces. Write \\text{AB}, NEVER \\text AB. Write x_{10}, NEVER x_10.
- Subscripts/superscripts MUST use braces if more than one character: $v_{0}$, $x^{2}$, $a_{rms}$, $e^{-x}$.
- Use proper LaTeX commands: \\frac{a}{b}, \\sqrt{x}, \\vec{F}, \\alpha, \\beta, \\theta, etc.
- TABLES: Tables MUST be formatted as valid LaTeX arrays \\begin{array}...\\end{array}. Ensure all \\multicolumn and \\multirow commands have properly bracketed arguments: \\multicolumn{cols}{align}{text}. Do NOT leave them unbracketed like \\multicolumn 6 |c|. Wrap text inside tables with \\text{...}.
- Operators: \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\approx, \\rightarrow, \\infty.
- Units: DO NOT use LaTeX for simple numbers and units with slashes (e.g., write 10 m/s, 38 N, 0.5 kg). ONLY use LaTeX for true math fractions (\\frac) or complex formulas.
- Chemical formulas: $\\text{H}_{2}\\text{O}$, $\\text{CO}_{2}$.
- Trigonometric: \\sin, \\cos, \\tan, \\log, \\ln.

BOUNDING BOXES:
- For EVERY question, you MUST provide a "questionBounds" object representing the bounding box of the ENTIRE question (including its text, options, and diagram if any).
- CRITICAL - PREVENT OVERCROPPING/UNDERCROPPING:
  * X-axis: You MUST capture the FULL width of the question. Ensure the box starts far enough left to include the question number (e.g., "19.", "Q4") and extends far enough right to include the longest line of text or option. Do NOT cut off the left or right edges! If unsure, make the width wider!
  * Y-axis: Pay extremely close attention to the top and bottom edges. The box MUST completely encapsulate the very top of the question and the very bottom (including the last line of options or diagram). Do NOT cut off the top line or bottom line!
- SAFE PADDING: Add a mandatory 3-5% padding on ALL sides (reduce x, reduce y, increase width, increase height) so that the extracted question is fully visible and not cut off.
- Since a question is extracted, there definitely is a question, so you MUST accurately provide the questionBounds and it MUST NOT be null.
- Bounding boxes are specified as percentages of the image dimensions (0 to 100).
- Example questionBounds: {"x": 2, "y": 10, "width": 96, "height": 18}

DIAGRAM DETECTION:
- A diagram is any figure, graph, circuit, ray diagram, free-body diagram, geometric shape, plot, biological anatomical drawing, or illustration.
- TABLES: If a table is simple (just text/numbers in a grid), extract it within "latexContent" using \\begin{array} wrapped in block math delimiters $...$. DO NOT use \\begin{tabular}.
- COMPLEX TABLES FALLBACK: If a table is highly complex, has heavily merged columns/rows, contains intricate diagrams inside cells, or cannot be accurately represented in a simple array, you MUST treat the entire table as a DIAGRAM. Set hasDiagram to true, and provide the "diagramBounds" accurately encapsulating the complex table.
- If NO diagram exists for a question, set hasDiagram to false, latexGenerabilityScore to 0, and diagramBounds to null.
- If a diagram EXISTS, provide "diagramBounds" as percentages of the image dimensions.
- If a diagram EXISTS, you MUST output a "latexGenerabilityScore" (a number from 0 to 100) based on how well it can be reproduced using TikZ/LaTeX.
- Simple math graphs, geometry shapes, circuits, and standard physics diagrams score 80-100.
- Real-world photos, highly complex 3D biological drawings (e.g., heart, brain), and artistic illustrations score 0-30.
- The diagramBounds must wrap ONLY the diagram (not the text/options), BUT you MUST include a generous extra margin/padding around it. Ensure the entire diagram is safely centered within this box with space to breathe.
- CRITICAL - DIAGRAM CROPPING: Pay extremely close attention to the Y-axis and X-axis. Ensure the box completely encapsulates the diagram on all sides without cutting off ANY labels, axes, or parts of the drawing. Add a precise padding (2-3%) on all sides to avoid bleeding into unrelated text.

CLASSIFICATION (per question):
- Subject: Physics, Chemistry, Mathematics, Biology, Computer Science, English, or other. (Choose exactly ONE. NEVER return a comma-separated list).
- Chapter: The broad chapter/unit name.
- Topic: The specific topic within the chapter.
- Difficulty: "easy", "medium", or "hard".
- Marks: Estimate — MCQ: 1-2, short answer: 2-3, numerical: 3-4, long answer: 5-10.

Respond ONLY with this exact JSON structure:
{
  "questions": [
    {
      "latexContent": "The main question text with all LaTeX (excluding options and solutions)",
      "optionsLatex": "A. Option 1 text\nB. Option 2 text\nC. Option 3 text\nD. Option 4 text" or null,
      "answerLatex": "The explanation or answer key" or null,
      "isSystemGeneratedAnswer": true or false, // CRITICAL: Must be true if you generated the answer
  "isAnswerExtractedFromImage": true or false, // CRITICAL: Must be true if answer was extracted from image
      "subject": "Subject name",
      "chapter": "Chapter or unit name",
      "topic": "Specific topic",
      "questionBounds": {"x": 5, "y": 10, "width": 90, "height": 15},
      "hasDiagram": true or false,
      "latexGenerabilityScore": 85,
      "diagramBounds": null or {"x": 55, "y": 5, "width": 40, "height": 35},
      "difficulty": "easy" | "medium" | "hard",
      "marks": 4
    }
  ]
}

If the page has NO extractable questions (only theory/examples), respond with:
{"questions": []}`;

function normalizeForComparison(text: string): string {
  return text
    .replace(/\$\$?/g, " ")
    .replace(/\\(frac|sqrt|vec|text|begin|end|left|right)\b/g, " ")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/[{}\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = normalizeForComparison(a).split(" ").filter(t => t.length > 1);
  const tokensB = normalizeForComparison(b).split(" ").filter(t => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

function computeSimilarityWithSet(setA: Set<string>, b: string, q: any): number {
  if (!b || setA.size === 0) return 0;
  let setB = q._tokens;
  if (!setB) {
      const tokensB = normalizeForComparison(b).split(" ").filter(t => t.length > 1);
      setB = new Set(tokensB);
      q._tokens = setB;
  }
  if (setB.size === 0) return 0;
  
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

function findDuplicateQuestion(
  extractedContent: string,
  masterQuestionsList: any[],
  userQuestions: any[]
) {
  let bestMatch: { id: number; latexContent: string; optionsLatex?: string | null; answerLatex?: string | null; diagramLatex?: string | null; subject: string; chapter: string | null; topic: string; similarity: number; source: string } | null = null;
  let bestScore = 0;

  const tokensA = normalizeForComparison(extractedContent).split(" ").filter(t => t.length > 1);
  if (tokensA.length === 0) return null;
  const setA = new Set(tokensA);

  for (const q of masterQuestionsList) {
    const score = computeSimilarityWithSet(setA, q.latexContent, q);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { id: q.id, latexContent: q.latexContent, optionsLatex: q.optionsLatex, answerLatex: q.answerLatex, diagramLatex: q.diagramLatex, subject: q.subject, chapter: q.chapter, topic: q.topic, similarity: Math.round(score * 100), source: "master" };
    }
  }

  const threshold = Math.max(SYSTEM_SETTINGS.masterMatchThreshold || 85, 80) / 100;

  if (bestMatch && bestScore >= threshold) {
    return bestMatch;
  }

  bestMatch = null;
  bestScore = 0;

  for (const q of userQuestions) {
    const score = computeSimilarityWithSet(setA, q.latexContent, q);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { id: q.id, latexContent: q.latexContent, optionsLatex: q.optionsLatex, answerLatex: q.answerLatex, diagramLatex: q.diagramLatex, subject: q.subject, chapter: q.chapter, topic: q.topic, similarity: Math.round(score * 100), source: "library" };
    }
  }

  if (bestMatch && bestScore >= threshold) {
    return bestMatch;
  }
  return null;
}

async function addToMasterBankIfNew(latexContent: string, data: { subject: string; chapter?: string; topic: string; hasDiagram?: boolean; latexGenerabilityScore?: number; difficulty?: string; marks?: number; originalImageUrl?: string; diagramImageUrl?: string; diagramLatex?: string; diagramType?: string; optionsLatex?: string | null; answerLatex?: string | null; isSystemGeneratedAnswer?: boolean; isAnswerEditedByUser?: boolean; isAnswerExtractedFromImage?: boolean; diagramBounds?: string | null; questionBounds?: string | null; }, userId: string, existingMasterList?: any[]): Promise<number | null> {
  try {
    const masterQuestionsList = existingMasterList || await storage.getPossibleDuplicateMasterQuestions(data.subject, data.topic, data.chapter);
    const tokensA = normalizeForComparison(latexContent).split(" ").filter(t => t.length > 1);
    if (tokensA.length > 0) {
      const setA = new Set(tokensA);
      const threshold = Math.max(SYSTEM_SETTINGS.masterMatchThreshold || 85, 80) / 100;
      for (const q of masterQuestionsList) {
        if (computeSimilarityWithSet(setA, q.latexContent, q) >= threshold) {
          return q.id;
        }
      }
    }
    const newMaster = await storage.createMasterQuestion({
      imageUrl: data.originalImageUrl || null,
      subject: data.subject,
      chapter: data.chapter || null,
      topic: data.topic,
      latexContent,
      optionsLatex: data.optionsLatex || null,
      answerLatex: data.answerLatex || null,
      diagramLatex: data.diagramLatex || null,
      diagramType: data.diagramType || (data.diagramLatex ? "latex" : "image"),
      hasDiagram: data.hasDiagram || false,
      latexGenerabilityScore: data.latexGenerabilityScore || 0,
      isSystemGeneratedAnswer: data.isSystemGeneratedAnswer || false,
      isAnswerEditedByUser: data.isAnswerEditedByUser || false,
      isAnswerExtractedFromImage: data.isAnswerExtractedFromImage || false,
      diagramBounds: data.diagramBounds || null,
      questionBounds: data.questionBounds || null,
      difficulty: data.difficulty || "medium",
      marks: data.marks || 4,
      source: "teacher_upload",
      addedBy: userId,
    });

    const job = await createJob(userId, "score_master_question", 1, { masterQuestionId: newMaster.id });
    (async () => {
      try {
        await updateJob(job.id, { status: "processing" });
        
        const systemInstruction = `You are evaluating the completeness and quality of a standardized Master Question.

Give higher scores to questions that are fully specified, clearly formatted in LaTeX, and include correct options (if applicable) and a clear solution.
Output a JSON object with two fields: "score" (integer 0-100) and "reasoning" (string).`;

        const prompt = `Master Question:
Text: ${newMaster.latexContent || "None"}
Options: ${newMaster.optionsLatex || "None"}
Answer: ${newMaster.answerLatex || "None"}
Diagram: ${newMaster.diagramLatex || "None"}`;

        const res = await getAi().models.generateContent({
          model: SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                score: { type: "INTEGER" },
                reasoning: { type: "STRING" }
              }
            } as any
          }
        });

        let aiCost = 0;
        if (res.usageMetadata) {
           aiCost = calculateAiCost(
             SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
             res.usageMetadata.promptTokenCount || 0,
             res.usageMetadata.candidatesTokenCount || 0,
             res.usageMetadata.promptTokenCount || 0,
             res.usageMetadata.cachedContentTokenCount || 0
           );
           if (aiCost > 0) {
             await storage.incrementUserCost(userId, aiCost);
           }
        }

        const result = parseAiScoreResult(safeParseJSON(getGeminiResponseText(res) || "{}"));
        if (result) {
           await storage.updateMasterQuestion(newMaster.id, { aiScore: result.score, aiCost });
           await updateJob(job.id, { status: "completed", result: { ...result, aiCost } });
        } else {
           console.warn("Failed to parse AI score for master question", newMaster.id, getGeminiResponseText(res));
           await deleteJob(job.id);
        }
      } catch (err: any) {
        console.error("Scoring master question failed", err);
        await updateJob(job.id, { status: "failed", error: err.message });
      }
    })();
    return newMaster.id;
  } catch (err) {
    console.error("Error adding to master bank:", err);
    return null;
  }
}



async function cropImage(buffer: Buffer, bounds: { x: number, y: number, width: number, height: number } | null): Promise<Buffer> {
  if (!bounds || typeof bounds.x !== 'number') return buffer;
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return buffer;

    // Use exact bounds (AI is already instructed to add 5% padding)
    const bx = Math.max(0, bounds.x);
    const by = Math.max(0, bounds.y);
    const bw = Math.min(100 - bx, bounds.width);
    const bh = Math.min(100 - by, bounds.height);

    const left = Math.max(0, Math.round((bx / 100) * metadata.width));
    const top = Math.max(0, Math.round((by / 100) * metadata.height));
    let width = Math.round((bw / 100) * metadata.width);
    let height = Math.round((bh / 100) * metadata.height);

    width = Math.min(width, metadata.width - left);
    height = Math.min(height, metadata.height - top);

    if (width <= 0 || height <= 0) return buffer;

    return await sharp(buffer)
      .extract({ left, top, width, height })
      .toBuffer();
  } catch (e) {
    console.error("Failed to crop image", e);
    return buffer;
  }
}

async function extractDiagramLatex(aiClient: any, imageParts: any[], bounds: any, questionText: string): Promise<{ latex: string | null, tokenUsage: { prompt: number, completion: number, total: number } }> {
  const tokenUsage = { prompt: 0, completion: 0, total: 0 };
  try {
    const diagramPrompt = `You are an expert at TikZ and LaTeX.
The user has provided an image of an entire page that contains MULTIPLE questions and diagrams.

YOUR GOAL: Find the specific diagram that corresponds to the following question text:
"${questionText}"
${bounds ? `\nHint: The diagram for this specific question is roughly located at these bounds (percentages): ${JSON.stringify(bounds)}` : ''}

Your task is to generate ONLY valid, compilable TikZ code that perfectly recreates THAT SPECIFIC DIAGRAM.
Do NOT recreate diagrams from other questions on the page.
Do NOT include the question text itself. ONLY recreate the diagram.

CRITICAL RENDERING RESTRICTIONS (MUST FOLLOW):
1. The rendering engine is a specialized WebAssembly TikZ renderer (TikZJax). It does NOT support standard LaTeX packages like amsmath, circuitikz, chemfig, or tikz-cd.
2. DO NOT output \\documentclass, \\usepackage, or \\begin{document}. You should ONLY output \\usetikzlibrary declarations (if any) followed immediately by the \\begin{tikzpicture} environment.
3. DO NOT use \\usepackage{amsmath} or any of its commands (e.g., \\text, \\xrightarrow, \\boldsymbol). Instead of \\text{}, you MUST use \\mbox{}. For reaction arrows, draw them manually using standard TikZ \\draw with an arrow tip (e.g., -{Stealth}), rather than using \\xrightarrow.
4. If you use any TikZ libraries (like positioning, calc, arrows.meta, shapes), you MUST explicitly include \\usetikzlibrary{libraryname} before the \\begin{tikzpicture} environment.
5. Put all custom styles or \\tikzset configurations directly as options to the \\begin{tikzpicture}[...] environment (e.g., \\begin{tikzpicture}[my style/.style={...}]).

Additional Guidelines:
- If the image contains a circuit, draw it manually using standard tikz lines and nodes. Do not use circuitikz.
- If the diagram is a graph, ensure there is adequate spacing between the axis labels and the axes (e.g., use node distance or shift so labels don't overlap the axis lines).
- For complex biology-based diagrams (e.g., anatomical structures like the brain, eye, heart, or cells), attempt to recreate them with high-quality, smooth Bezier curves (\\draw[smooth]) to approximate the anatomical shapes accurately. Preserve all labels (A, B, C...) and pointer lines exactly as they appear in the original image.
- For non-biological complex real-world objects (like a car or a plane in physics), you can use simple geometric shapes and text if drawing them realistically is too complex.`;

    const response = await aiClient.models.generateContent({
      model: SYSTEM_SETTINGS.imageGenerationModel,
      contents: [
        {
          role: "user",
          parts: [
            ...imageParts,
          ],
        },
      ],
      config: {
        systemInstruction: diagramPrompt,
        temperature: 0.2
      },
    });

    if (response.usageMetadata) {
      tokenUsage.prompt = response.usageMetadata.promptTokenCount || 0;
      tokenUsage.completion = response.usageMetadata.candidatesTokenCount || 0;
      tokenUsage.total = response.usageMetadata.totalTokenCount || 0;
    }

    let rawLatex = response.text || "";
    rawLatex = rawLatex.replace(/^```(latex)?\n/i, "").replace(/```$/i, "").trim();
    return { latex: rawLatex, tokenUsage };
  } catch (err) {
    console.error("Failed to extract TikZ diagram:", err);
    return { latex: null, tokenUsage };
  }
}

export async function checkAndCreateException(userId: string, masterQuestionId: number, userQuestionId: number, newData: any) {
  try {
    const master = await storage.getMasterQuestion(masterQuestionId);
    if (!master) return;

    // Check if core content differs
    const coreFieldsDiffer = 
      (newData.latexContent && newData.latexContent !== master.latexContent) ||
      (newData.optionsLatex !== undefined && newData.optionsLatex !== master.optionsLatex) ||
      (newData.answerLatex !== undefined && newData.answerLatex !== master.answerLatex) ||
      (newData.diagramLatex !== undefined && newData.diagramLatex !== master.diagramLatex);

    if (coreFieldsDiffer) {
      const exception = await storage.createMasterQuestionException({
        masterQuestionId,
        userQuestionId,
        userId,
        status: "pending"
      });

      // U3: Trigger background AI scoring job
      const job = await createJob(userId, "score_exception", 1, { exceptionId: exception.id });
      
      // Async scoring
      (async () => {
        try {
          await updateJob(job.id, { status: "processing" });
          
          const systemInstruction = `You are evaluating a user's edit to a standardized Master Question.

Evaluate the quality and correctness of the User's Edited Question compared to the Master Question. Give higher scores to versions that add missing correct solutions, fix typos, or improve LaTeX formatting.
Output a JSON object with two fields: "score" (integer 0-100) and "reasoning" (string).`;

          const prompt = `Master Question:
Text: ${master.latexContent || "None"}
Options: ${master.optionsLatex || "None"}
Answer: ${master.answerLatex || "None"}
Diagram: ${master.diagramLatex || "None"}

User's Edited Question:
Text: ${newData.latexContent || master.latexContent || "None"}
Options: ${newData.optionsLatex !== undefined ? newData.optionsLatex : (master.optionsLatex || "None")}
Answer: ${newData.answerLatex !== undefined ? newData.answerLatex : (master.answerLatex || "None")}
Diagram: ${newData.diagramLatex !== undefined ? newData.diagramLatex : (master.diagramLatex || "None")}`;

          const res = await getAi().models.generateContent({
            model: SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  score: { type: "INTEGER" },
                  reasoning: { type: "STRING" }
                }
              } as any
            }
          });

          let aiCost = 0;
          if (res.usageMetadata) {
             aiCost = calculateAiCost(
               SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
               res.usageMetadata.promptTokenCount || 0,
               res.usageMetadata.candidatesTokenCount || 0,
               res.usageMetadata.promptTokenCount || 0,
               res.usageMetadata.cachedContentTokenCount || 0
             );
             if (aiCost > 0) {
               // Assign the exception scoring cost to the admin user instead of the teacher
               const admin = await storage.getFirstAdminUser();
               const chargeUserId = admin?.id || userId;
               await storage.incrementUserCost(chargeUserId, aiCost);
             }
          }

          const result = parseAiScoreResult(safeParseJSON(getGeminiResponseText(res) || "{}"));
          if (result) {
             await storage.updateMasterQuestionExceptionScore(exception.id, result.score, aiCost);
             await updateJob(job.id, { status: "completed", result: { ...result, aiCost } });
          } else {
             console.warn("Failed to parse AI score for exception", exception.id, getGeminiResponseText(res));
             await deleteJob(job.id);
          }
        } catch (err: any) {
          console.error("Scoring exception failed", err);
          await updateJob(job.id, { status: "failed", error: err.message });
        }
      })();
    }
  } catch (err) {
    console.error("Failed to check and create exception", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // Global concurrency limit to prevent Gemini rate limit (429) errors from multiple parallel requests
  const globalAiLimit = pLimit(10);

  app.post("/api/questions/regenerate-figure", isAuthenticated, async (req: any, res) => {
    try {
      const { imageBase64, questionText, questionId, source, index, extractJobId } = req.body;
      if (!imageBase64 || !questionText) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const userId = req.user.id;
      const job = await createJob(userId, "regenerate_figure", 1, { questionId, source, index, extractJobId });
      res.json({ jobId: job.id, message: "Regeneration started in the background" });

      // Run regeneration in background
      globalAiLimit(async () => {
        // Extract the actual base64 data (remove data:image/jpeg;base64, prefix if present)
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const diagramPrompt = `You are an expert at TikZ and LaTeX.
The user has provided a CROPPED image of a specific diagram that corresponds to the following question text:
"${questionText}"

Your task is to generate ONLY valid, compilable LaTeX code using the TikZ package that perfectly recreates THIS DIAGRAM.
Do NOT include the question text itself. ONLY recreate the diagram.

Additional TikZ Guidelines:
- CRITICAL RESTRICTION: Do NOT use complex external packages like circuitikz, chemfig, or tikz-cd. The renderer ONLY supports standard TikZ libraries (e.g., arrows.meta, calc, positioning, shapes, decorations, intersections, patterns).
- If the image contains a circuit, draw it manually using standard tikz lines and nodes. Do not use circuitikz.
- If the diagram is a graph, ensure there is adequate spacing between the axis labels and the axes.
- If the diagram contains complex real-world objects, DO NOT try to draw them realistically. Instead, draw a simple geometric shape and write the name of the object inside or next to it.`;

        const response = await getAi().models.generateContent({
          model: SYSTEM_SETTINGS.imageGenerationModel,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
              ],
            },
          ],
          config: {
            systemInstruction: diagramPrompt,
            temperature: 0.2
          },
        });

        let promptTokens = response.usageMetadata?.promptTokenCount || 0;
        let completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
        let cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
        let totalTokens = response.usageMetadata?.totalTokenCount || 0;
        let aiCost = calculateAiCost(SYSTEM_SETTINGS.imageGenerationModel, promptTokens, completionTokens, promptTokens, cachedTokens);

        await storage.incrementUserCost(userId, aiCost);

        let rawLatex = response.text || "";
        rawLatex = rawLatex.replace(/^```(latex)?\n/i, "").replace(/```$/i, "").trim();

        // Always read the latest job data in case it was updated (e.g. question was saved to library while generating)
        const currentJob = await getJob(job.id);
        const currentSource = currentJob?.data?.source || source;
        const currentQuestionId = currentJob?.data?.questionId || questionId;

        if (currentSource === 'library' && currentQuestionId) {
          // Immediately update the DB record if it's already saved
          const q = await storage.getQuestion(currentQuestionId, userId);
          if (q && q.userId === userId) {
            const dataToUpdate = {
              diagramLatex: rawLatex,
              diagramType: 'latex',
              hasDiagram: true,
              promptTokens: (q.promptTokens || 0) + promptTokens,
              completionTokens: (q.completionTokens || 0) + completionTokens,
              totalTokens: (q.totalTokens || 0) + totalTokens,
              aiCost: (q.aiCost || 0) + aiCost
            };
            const updated = await storage.updateQuestion(currentQuestionId, userId, dataToUpdate);
            if (q.masterQuestionId && updated) {
              await checkAndCreateException(userId, q.masterQuestionId, updated.id, dataToUpdate);
            }
          }
        } else if (currentSource === 'master_bank' && currentQuestionId) {
          // Immediately update the master bank DB record
          const q = await storage.getMasterQuestion(currentQuestionId);
          if (q) {
            await storage.updateMasterQuestion(currentQuestionId, {
              diagramLatex: rawLatex,
              diagramType: 'latex',
              hasDiagram: true,
              promptTokens: (q.promptTokens || 0) + promptTokens,
              completionTokens: (q.completionTokens || 0) + completionTokens,
              totalTokens: (q.totalTokens || 0) + totalTokens,
              aiCost: (q.aiCost || 0) + aiCost
            });
          }
        }

        await updateJob(job.id, {
          progress: 1,
          status: "completed",
          result: { diagramLatex: rawLatex, promptTokens, completionTokens, totalTokens, aiCost, questionId: currentQuestionId, source: currentSource, index }
        });
      }).catch(async (err) => {
        console.error("Background regeneration failed:", err);
        await updateJob(job.id, { status: "failed", error: "Background regeneration failed" });
      });

    } catch (error) {
      console.error("Error starting regenerate figure:", error);
      res.status(500).json({ error: "Failed to start regenerate figure" });
    }
  });

  app.post("/api/questions/bulk-extract", isAuthenticated, upload.array("images", 20), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      const userId = req.user.id;

      const uploadedUrls = await Promise.all(
        files.map(async (f) => {
          try {
            const fileName = `source_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            return await uploadImageToSupabase(f.buffer, fileName, req.headers.authorization);
          } catch (err) {
            console.error("Failed to upload file to Supabase:", err);
            return null; // Return null on failure so Promise.all doesn't reject
          }
        })
      );
      const thumbnails = uploadedUrls;

      const job = await createJob(userId, "bulk_extract", files.length, { thumbnails });
      res.json({ jobId: job.id, message: "Extraction started in the background" });

      // Run extraction in background
      (async () => {
        const results: any[] = [];
        let completed = 0;

        const masterQuestionsCache: Record<string, any[]> = {};
        let userQuestions: any[] = [];
        try {

          userQuestions = await storage.getQuestionsByUser(userId);
        } catch (e) {
          console.error("Failed to load questions for duplicate check:", e);
        }

        const filePromises = files.map((file, fileIndex) => globalAiLimit(async () => {
          let accumulatedTokens = { prompt: 0, completion: 0, cached: 0, total: 0 };
          try {
            const base64Image = file.buffer.toString("base64");
            const mimeType = file.mimetype || "image/png";

            const extractionSchema = {
              type: "OBJECT",
              properties: {
                questions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      latexContent: { type: "STRING" },
                      subject: { type: "STRING" },
                      chapter: { type: "STRING" },
                      topic: { type: "STRING" },
                      optionsLatex: { type: "STRING", nullable: true },
                      answerLatex: { type: "STRING", nullable: true },
                      isSystemGeneratedAnswer: { type: "BOOLEAN" },
                      isAnswerExtractedFromImage: { type: "BOOLEAN" },
                      questionBounds: {
                        type: "OBJECT",
                        properties: {
                          x: { type: "NUMBER" },
                          y: { type: "NUMBER" },
                          width: { type: "NUMBER" },
                          height: { type: "NUMBER" },
                        },
                        nullable: true,
                      },
                      hasDiagram: { type: "BOOLEAN" },
                      diagramBounds: {
                        type: "OBJECT",
                        properties: {
                          x: { type: "NUMBER" },
                          y: { type: "NUMBER" },
                          width: { type: "NUMBER" },
                          height: { type: "NUMBER" },
                        },
                        nullable: true,
                      },
                      latexGenerabilityScore: { type: "NUMBER", nullable: true },
                      difficulty: { type: "STRING" },
                      marks: { type: "NUMBER" },
                    },
                    required: ["latexContent", "hasDiagram"],
                  },
                },
              },
            };



            const runExtraction = async (attemptCount: number) => {
              const promptText = attemptCount > 1
                ? MULTI_QUESTION_EXTRACTION_PROMPT + "\n\nCRITICAL INSTRUCTION: Your previous response was too long and got truncated! You MUST be extremely concise this time to fit within token limits."
                : MULTI_QUESTION_EXTRACTION_PROMPT;

              const maxOutputTokens = getMaxOutputTokens(SYSTEM_SETTINGS.extractionModel);

              const res = await getAi().models.generateContent({
                // Upgraded to 3.1-pro-preview to ensure it reliably identifies distinct text blocks correctly
                model: SYSTEM_SETTINGS.extractionModel,
                contents: [
                  {
                    role: "user",
                    parts: [
                      { inlineData: { data: base64Image, mimeType } },
                    ],
                  },
                ],
                config: {
                  systemInstruction: promptText,
                  maxOutputTokens,
                  responseMimeType: "application/json",
                  responseSchema: extractionSchema as any
                },
              });

              if (res.usageMetadata) {
                accumulatedTokens.prompt += res.usageMetadata.promptTokenCount || 0;
                accumulatedTokens.completion += res.usageMetadata.candidatesTokenCount || 0;
                accumulatedTokens.cached += res.usageMetadata.cachedContentTokenCount || 0;
                accumulatedTokens.total += res.usageMetadata.totalTokenCount || 0;
              }

              const text = res.text || "";
              // Validate it's not brutally truncated
              if (text && !text.endsWith("}") && !text.endsWith("]")) {
                throw new Error("JSON generation truncated");
              }
              return { text, usage: res.usageMetadata };
            };

            const extractionResult = await pRetry(runExtraction, {
              retries: 2,
              onFailedAttempt: (error: any) => {

              },
            });
            const responseText = extractionResult.text;
            const usage = accumulatedTokens;




            const extractedData = safeParseJSON(responseText);
            let questionsArray = [];
            if (Array.isArray(extractedData)) {
              questionsArray = extractedData;
            } else if (extractedData?.questions && Array.isArray(extractedData.questions)) {
              questionsArray = extractedData.questions;
            }

            if (!Array.isArray(questionsArray) || questionsArray.length === 0) {
              console.error("Failed to extract questions. Parsed data:", extractedData);
              // Still charge the user for the tokens used even if it failed to extract anything valid
              let failedCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, accumulatedTokens.prompt, accumulatedTokens.completion, accumulatedTokens.prompt, accumulatedTokens.cached);
              if (failedCost > 0) {
                await storage.incrementUserCost(userId, failedCost);
              }
              results.push({
                fileName: file.originalname,
                status: "failed",
                error: "Could not extract any content from this image. The model failed to identify distinct questions or blocks.",
              });
              return;
            }

            const questionsCount = questionsArray.filter((q: any) => q && q.latexContent).length;

            // Apply the total accumulated tokens directly as cost to avoid rounding losses
            let totalBulkCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, accumulatedTokens.prompt, accumulatedTokens.completion, accumulatedTokens.prompt, accumulatedTokens.cached);

            const basePromptTokens = Math.ceil(accumulatedTokens.prompt / (questionsCount || 1));
            const baseCompletionTokens = Math.ceil(accumulatedTokens.completion / (questionsCount || 1));
            const baseCachedTokens = Math.ceil(accumulatedTokens.cached / (questionsCount || 1));

            for (const q of questionsArray) {
              if (q && q.latexContent) {
                let qPromptTokens = basePromptTokens;
                let qCompletionTokens = baseCompletionTokens;
                let qCachedTokens = baseCachedTokens;
                let qTotalTokens = qPromptTokens + qCompletionTokens;
                // Cost per question is approximate, the true sum is tracked in totalBulkCost
                let qAiCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, qPromptTokens, qCompletionTokens, accumulatedTokens.prompt, qCachedTokens);

                const normalized = {
                  latexContent: String(q.latexContent || ""),
                  optionsLatex: q.optionsLatex ? String(q.optionsLatex) : (Array.isArray(q.options) ? q.options.join("\n") : null),
                  answerLatex: q.answerLatex ? String(q.answerLatex) : null,
                  subject: String(q.subject || "General"),
                  chapter: String(q.chapter || ""),
                  topic: String(q.topic || "General"),
                  hasDiagram: Boolean(q.hasDiagram),
                  latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
                  isSystemGeneratedAnswer: q.isSystemGeneratedAnswer === true || q.isSystemGeneratedAnswer === "true",
                  isAnswerExtractedFromImage: q.isAnswerExtractedFromImage === true || q.isAnswerExtractedFromImage === "true",
                  diagramBounds: q.diagramBounds || null,
                  questionBounds: q.questionBounds || null,
                  difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
                  marks: Number(q.marks) || 4,
                };

                const cacheKey = `${normalized.subject}|${normalized.topic}|${normalized.chapter}`;
                if (!masterQuestionsCache[cacheKey]) {
                  masterQuestionsCache[cacheKey] = await storage.getPossibleDuplicateMasterQuestions(normalized.subject, normalized.topic, normalized.chapter);
                }
                let duplicateMatch = normalized.latexContent.length > 10
                  ? findDuplicateQuestion(normalized.latexContent, masterQuestionsCache[cacheKey] || [], userQuestions)
                  : null;
                  
                let masterQuestionId = null;

                let originalExtractedData = null;
                if (duplicateMatch && duplicateMatch.similarity >= (SYSTEM_SETTINGS.masterMatchThreshold || 85) && duplicateMatch.source === "master") {
                  // Keep a backup of the richer extracted data in case the user wants to upgrade the Master
                  originalExtractedData = {
                    latexContent: normalized.latexContent,
                    optionsLatex: normalized.optionsLatex,
                    answerLatex: normalized.answerLatex,
                    hasDiagram: normalized.hasDiagram
                  };

                  normalized.latexContent = duplicateMatch.latexContent;
                  normalized.optionsLatex = duplicateMatch.optionsLatex || null;
                  normalized.answerLatex = duplicateMatch.answerLatex || null;
                  if (duplicateMatch.diagramLatex) {
                    normalized.hasDiagram = true;
                  }
                  masterQuestionId = duplicateMatch.id;
                  
                  // Keep duplicateMatch so the frontend UI can still display the warning & upgrade button
                }

                const originalImageUrl = uploadedUrls[fileIndex] || "";
                if (!originalImageUrl) {
                  console.warn(`Missing imageUrl for fileIndex ${fileIndex}, image upload likely failed.`);
                }

                let diagramLatex = masterQuestionId ? (masterQuestionsCache[cacheKey]?.find((m: any) => m.id === masterQuestionId)?.diagramLatex || null) : null;

                results.push({
                  ...normalized,
                  originalImageUrl,
                  duplicateMatch,
                  originalExtractedData,
                  masterQuestionId,
                  diagramLatex,
                  promptTokens: qPromptTokens,
                  completionTokens: qCompletionTokens,
                  totalTokens: qTotalTokens,
                  aiCost: qAiCost,
                  fileName: file.originalname,
                  status: "success",
                  imageUrl: originalImageUrl,
                });
              }
            }

            if (totalBulkCost > 0) {
              await storage.incrementUserCost(userId, totalBulkCost);
            }
          } catch (fileError) {
            console.error("Error extracting from image:", file.originalname, fileError);
            if (accumulatedTokens.prompt > 0 || accumulatedTokens.completion > 0) {
              let failedCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, accumulatedTokens.prompt, accumulatedTokens.completion, accumulatedTokens.prompt, accumulatedTokens.cached);
              if (failedCost > 0) {
                storage.incrementUserCost(userId, failedCost).catch(e => console.error("Failed to increment user cost", e));
              }
            }
            try {
              results.push({
                fileName: file.originalname,
                status: "failed",
                error: "Extraction failed for this image",
              });
            } catch (err) {
              results.push({
                fileName: file.originalname,
                status: "failed",
                error: "Extraction failed for this image",
              });
            }
          }

          completed++;
          await updateJob(job.id, { progress: completed });
        })); // end of map

        await Promise.all(filePromises);

        const successCount = results.filter((r: any) => r.status === "success").length;
        const failedCount = results.filter((r: any) => r.status === "failed").length;


        await updateJob(job.id, {
          status: "completed",
          result: { questions: results },
          data: { ...(job.data || {}), successCount, failedCount }
        });
      })().catch(async (err: any) => {
        console.error("Background extraction failed:", err);
        await updateJob(job.id, { status: "failed", error: "Background extraction failed" });
      });

    } catch (error) {
      console.error("Error starting bulk extraction:", error);
      res.status(500).json({ error: "Failed to start bulk extraction" });
    }
  });

  app.get("/api/jobs", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    const jobs = await getUserJobs(req.user.id);
    res.json(jobs);
  });

  app.get("/api/jobs/:id", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.userId !== req.user.id) return res.status(403).json({ error: "Unauthorized" });
    res.json(job);
  });

  app.patch("/api/jobs/:id", isAuthenticated, async (req: any, res) => {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.userId !== req.user.id) return res.status(403).json({ error: "Unauthorized" });

    if (req.body.data) {
      await updateJob(job.id, { data: { ...job.data, ...req.body.data } });
    }

    if (req.body.result !== undefined) {
      await updateJob(job.id, { result: req.body.result });
    }

    res.json(await getJob(job.id));
  });

  app.delete("/api/jobs/:id", isAuthenticated, async (req: any, res) => {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.userId !== req.user.id) return res.status(403).json({ error: "Unauthorized" });
    await deleteJob(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/questions/bulk-save", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { questions, extractJobId } = req.body;
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "No questions provided" });
      }

      const job = await createJob(userId, "bulk_save", questions.length, { extractJobId });
      res.status(202).json({ jobId: job.id, message: "Bulk save started in background" });

      // Run in background
      (async () => {
        try {
          await updateJob(job.id, { status: "processing" });
          const results: { index: number; originalIndex?: number; status: string; error?: string }[] = [];
          let savedCount = 0;

          // Fetch user jobs and master questions ONCE before the loop to prevent connection pool exhaustion
          const userJobs = await getUserJobs(userId);
          const masterQuestionsCache: Record<string, any[]> = {};

          // Parallelize Supabase image uploads to speed up completion
          const uploadLimit = pLimit(5);
          await Promise.all(questions.map((q: any) => uploadLimit(async () => {
            if (q.imageUrl && q.imageUrl.startsWith("data:")) {
              try {
                const match = q.imageUrl.match(/^data:(image\/\w+);base64,(.*)$/);
                if (match) {
                  const buffer = Buffer.from(match[2], "base64");
                  const fileName = `question_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                  const uploadedUrl = await uploadImageToSupabase(buffer, fileName, req.headers.authorization);
                  q.imageUrl = uploadedUrl;
                }
              } catch (e) {
                console.error("Failed to upload image to Supabase", e);
              }
            }
          })));

          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            try {
              if (!q.latexContent || !q.subject || !q.topic) {
                results.push({ index: i, originalIndex: q.originalIndex, status: "failed", error: "Missing required fields (subject, topic, or content)" });
                continue;
              }

              // Check for completed jobs that haven't been applied to the frontend state yet
              if (typeof q.originalIndex === "number") {
                const completedJobs = userJobs.filter(j =>
                  (j.type === 'regenerate_figure' || j.type === 'generate_answer') &&
                  j.status === 'completed' &&
                  j.data?.source === 'upload' &&
                  j.data?.index === q.originalIndex
                );
                for (const relatedJob of completedJobs) {
                  if (relatedJob.type === 'regenerate_figure' && relatedJob.result?.diagramLatex) {
                    q.diagramLatex = relatedJob.result.diagramLatex;
                    q.diagramType = 'latex';
                    q.hasDiagram = true;
                    q.promptTokens = (q.promptTokens || 0) + (relatedJob.result.promptTokens || 0);
                    q.completionTokens = (q.completionTokens || 0) + (relatedJob.result.completionTokens || 0);
                    q.totalTokens = (q.totalTokens || 0) + (relatedJob.result.totalTokens || 0);
                    q.aiCost = (q.aiCost || 0) + (relatedJob.result.aiCost || 0);
                  }
                  if (relatedJob.type === 'generate_answer' && relatedJob.result?.answerLatex) {
                    q.answerLatex = relatedJob.result.answerLatex;
                    q.isSystemGeneratedAnswer = true;
                    q.promptTokens = (q.promptTokens || 0) + (relatedJob.result.promptTokens || 0);
                    q.completionTokens = (q.completionTokens || 0) + (relatedJob.result.completionTokens || 0);
                    q.totalTokens = (q.totalTokens || 0) + (relatedJob.result.totalTokens || 0);
                    q.aiCost = (q.aiCost || 0) + (relatedJob.result.aiCost || 0);
                  }
                }
              }

              const data = insertQuestionSchema.parse({
                ...q,
                userId,
                masterQuestionId: q.masterQuestionId ?? null,
                chapter: q.chapter || null,
                promptTokens: q.promptTokens || 0,
                completionTokens: q.completionTokens || 0,
                totalTokens: q.totalTokens || 0,
                aiCost: q.aiCost || 0,
                submittedBy: q.submittedBy || userId,
                latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
                isSystemGeneratedAnswer: q.isSystemGeneratedAnswer === true || q.isSystemGeneratedAnswer === "true",
                isAnswerEditedByUser: q.isAnswerEditedByUser === true || q.isAnswerEditedByUser === "true",
                isAnswerExtractedFromImage: q.isAnswerExtractedFromImage === true || q.isAnswerExtractedFromImage === "true",
                diagramBounds: q.diagramBounds ? (typeof q.diagramBounds === 'string' ? q.diagramBounds : JSON.stringify(q.diagramBounds)) : null,
                questionBounds: q.questionBounds ? (typeof q.questionBounds === 'string' ? q.questionBounds : JSON.stringify(q.questionBounds)) : null,
              });
              const question = await storage.createQuestion(data);
              if (data.masterQuestionId) {
                await checkAndCreateException(userId, data.masterQuestionId, question.id, data);
              }
              if (data.aiCost) {
                await storage.incrementSavedCost(userId, data.aiCost);
              }

              if (typeof q.originalIndex === "number") {
                const allRelatedJobs = userJobs.filter(j =>
                  (j.type === 'regenerate_figure' || j.type === 'generate_answer') &&
                  j.data?.index === q.originalIndex &&
                  j.data?.source === 'upload'
                );
                for (const relatedJob of allRelatedJobs) {
                  await updateJob(relatedJob.id, { data: { ...relatedJob.data, questionId: question.id, source: 'library' } });

                  if (relatedJob.status === 'completed') {
                    if (relatedJob.type === 'regenerate_figure' && relatedJob.result?.diagramLatex && !data.diagramLatex) {
                      await storage.updateQuestion(question.id, userId, {
                        diagramLatex: relatedJob.result.diagramLatex,
                        diagramType: 'latex',
                        hasDiagram: true,
                        promptTokens: (question.promptTokens || 0) + (relatedJob.result.promptTokens || 0),
                        completionTokens: (question.completionTokens || 0) + (relatedJob.result.completionTokens || 0),
                        totalTokens: (question.totalTokens || 0) + (relatedJob.result.totalTokens || 0),
                        aiCost: (question.aiCost || 0) + (relatedJob.result.aiCost || 0)
                      });
                    }
                    if (relatedJob.type === 'generate_answer' && relatedJob.result?.answerLatex && !data.answerLatex) {
                      await storage.updateQuestion(question.id, userId, {
                        answerLatex: relatedJob.result.answerLatex,
                        isSystemGeneratedAnswer: true,
                        promptTokens: (question.promptTokens || 0) + (relatedJob.result.promptTokens || 0),
                        completionTokens: (question.completionTokens || 0) + (relatedJob.result.completionTokens || 0),
                        totalTokens: (question.totalTokens || 0) + (relatedJob.result.totalTokens || 0),
                        aiCost: (question.aiCost || 0) + (relatedJob.result.aiCost || 0)
                      });
                    }
                  }
                }
              }

              savedCount++;
              results.push({ index: i, originalIndex: q.originalIndex, status: "saved" });

              const masterId = await addToMasterBankIfNew(data.latexContent, {
                originalImageUrl: data.imageUrl || undefined,
                subject: data.subject,
                chapter: data.chapter || undefined,
                topic: data.topic,
                hasDiagram: data.hasDiagram || false,
                latexGenerabilityScore: Number(data.latexGenerabilityScore) || 0,
                difficulty: data.difficulty || "medium",
                marks: data.marks || 4,
                diagramLatex: data.diagramLatex || undefined,
                isSystemGeneratedAnswer: data.isSystemGeneratedAnswer || false,
                isAnswerEditedByUser: data.isAnswerEditedByUser || false,
                isAnswerExtractedFromImage: data.isAnswerExtractedFromImage || false,
                diagramBounds: data.diagramBounds || undefined,
                questionBounds: data.questionBounds || undefined,
              }, userId, masterQuestionsCache[data.subject] || []);
              if (masterId && !data.masterQuestionId) {
                await storage.updateQuestionMasterId(question.id, masterId);
              }
            } catch (e: any) {
              console.error("Error saving question in bulk:", e);
              results.push({ index: i, originalIndex: q.originalIndex, status: "failed", error: e.message || "Validation failed" });
            }
            await updateJob(job.id, { progress: i + 1 });
          }

          await updateJob(job.id, {
            status: "completed",
            result: { saved: savedCount, total: questions.length, failed: questions.length - savedCount, results }
          });

          // Cleanup the bulk_extract job
          if (extractJobId) {
            if (savedCount === questions.length) {
              await deleteJob(extractJobId).catch(console.error);
            } else {
              const extractJob = await getJob(extractJobId);
              if (extractJob && extractJob.result?.questions) {
                const savedIndices = results.filter(r => r.status === "saved").map(r => r.originalIndex);
                const remainingQuestions = extractJob.result.questions.filter((_: any, i: number) => !savedIndices.includes(i));
                await updateJob(extractJobId, { result: { questions: remainingQuestions } }).catch(console.error);
              }
            }
          }
        } catch (error) {
          console.error("Error in bulk save bg job:", error);
          await updateJob(job.id, { status: "failed", error: "Failed to save questions" }).catch(console.error);
        }
      })();
    } catch (error) {
      console.error("Error starting bulk save:", error);
      res.status(400).json({ error: "Failed to start save job" });
    }
  });

  app.post("/api/questions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      if (req.body.imageUrl && req.body.imageUrl.startsWith("data:")) {
        try {
          const match = req.body.imageUrl.match(/^data:(image\/\w+);base64,(.*)$/);
          if (match) {
            const buffer = Buffer.from(match[2], "base64");
            const fileName = `question_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const uploadedUrl = await uploadImageToSupabase(buffer, fileName, req.headers.authorization);
            req.body.imageUrl = uploadedUrl;
          }
        } catch (e) {
          console.error("Failed to upload image to Supabase", e);
        }
      }

      const data = insertQuestionSchema.parse({
        ...req.body,
        userId,
        submittedBy: req.body.submittedBy || userId
      });
      const question = await storage.createQuestion(data);
      if (data.masterQuestionId) {
        await checkAndCreateException(userId, data.masterQuestionId, question.id, data);
      }
      if (data.aiCost) {
        await storage.incrementSavedCost(userId, data.aiCost);
      }

      const masterId = await addToMasterBankIfNew(data.latexContent, {
        originalImageUrl: data.imageUrl || undefined,
        subject: data.subject,
        chapter: data.chapter || undefined,
        topic: data.topic,
        hasDiagram: data.hasDiagram || false,
        latexGenerabilityScore: Number(data.latexGenerabilityScore) || 0,
        difficulty: data.difficulty || "medium",
        marks: data.marks || 4,
        diagramLatex: data.diagramLatex || undefined,
        optionsLatex: data.optionsLatex || undefined,
        answerLatex: data.answerLatex || undefined,
        isSystemGeneratedAnswer: data.isSystemGeneratedAnswer || false,
        isAnswerEditedByUser: data.isAnswerEditedByUser || false,
        isAnswerExtractedFromImage: data.isAnswerExtractedFromImage || false,
      }, userId);
      if (masterId && !data.masterQuestionId) {
        await storage.updateQuestionMasterId(question.id, masterId);
      }

      res.status(201).json(question);
    } catch (error) {
      console.error("Error creating question:", error);
      res.status(400).json({ error: "Failed to save question" });
    }
  });

  app.get("/api/questions", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const questions = await storage.getQuestionsByUser(userId);
      res.json(questions);
    } catch (error) {
      console.error("Error fetching questions:", error);
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.get("/api/questions/:id/image", isAuthenticated, async (req: any, res) => {
    try {
      const type = (req.query.type as 'original' | 'diagram') || 'diagram';
      const q = await storage.getQuestionImage(parseInt(req.params.id), req.user.id);
      if (!q) return res.status(404).end();

      const dataUri = q.image;
      if (!dataUri || !dataUri.startsWith('data:image/')) return res.status(404).end();

      const matches = dataUri.match(/^data:(image\/\w+);base64,(.*)$/);
      if (!matches) return res.status(404).end();

      const buffer = Buffer.from(matches[2], 'base64');
      res.setHeader('Content-Type', matches[1]);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(buffer);
    } catch (error) {
      res.status(500).end();
    }
  });

  app.get("/api/questions/:id", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const question = await storage.getQuestion(parseInt(req.params.id), userId);
      if (!question || question.userId !== userId) return res.status(404).json({ error: "Question not found" });
      res.json(question);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch question" });
    }
  });

  app.delete("/api/questions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      await storage.deleteQuestion(parseInt(req.params.id), userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete question" });
    }
  });

  app.post("/api/questions/batch-delete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid ids array" });
      }
      await storage.deleteQuestions(ids, userId);
      res.json({ success: true, deleted: ids.length });
    } catch (error) {
      console.error("Batch delete failed:", error);
      res.status(500).json({ error: "Failed to batch delete questions" });
    }
  });

  app.patch("/api/questions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const questionId = parseInt(req.params.id);

      const existing = await storage.getQuestion(questionId, userId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Question not found" });
      }

      // Update allowed fields
      const { latexContent, diagramLatex, optionsLatex, answerLatex, diagramType, isDiagramHidden, diagramImageUrl, diagramBounds, isSystemGeneratedAnswer, isAnswerEditedByUser, isAnswerExtractedFromImage } = req.body;
      const dataToUpdate: any = {};

      if (latexContent !== undefined) dataToUpdate.latexContent = latexContent;
      if (diagramType !== undefined) dataToUpdate.diagramType = diagramType;
      if (isDiagramHidden !== undefined) dataToUpdate.isDiagramHidden = isDiagramHidden;
      if (isSystemGeneratedAnswer !== undefined) dataToUpdate.isSystemGeneratedAnswer = isSystemGeneratedAnswer;
      if (isAnswerEditedByUser !== undefined) dataToUpdate.isAnswerEditedByUser = isAnswerEditedByUser;
      if (isAnswerExtractedFromImage !== undefined) dataToUpdate.isAnswerExtractedFromImage = isAnswerExtractedFromImage;
      if (diagramImageUrl !== undefined) {
        dataToUpdate.diagramImageUrl = diagramImageUrl;
        dataToUpdate.hasDiagram = true;
      }
      if (diagramBounds !== undefined) {
        dataToUpdate.diagramBounds = diagramBounds ? (typeof diagramBounds === 'string' ? diagramBounds : JSON.stringify(diagramBounds)) : null;
      }
      if (diagramLatex !== undefined) {
        dataToUpdate.diagramLatex = diagramLatex;
        // Update hasDiagram flag based on diagram content presence or existing image
        dataToUpdate.hasDiagram = (!!diagramLatex && diagramLatex.trim().length > 0) || !!existing.imageUrl;
      }
      if (optionsLatex !== undefined) dataToUpdate.optionsLatex = optionsLatex;
      if (answerLatex !== undefined) dataToUpdate.answerLatex = answerLatex;

      const updated = await storage.updateQuestion(questionId, userId, dataToUpdate);

      // Check if actual meaningful content was changed
      let hasMeaningfulChanges = false;
      if (existing.masterQuestionId && updated) {
        if (
          (dataToUpdate.latexContent !== undefined && dataToUpdate.latexContent !== existing.latexContent) ||
          (dataToUpdate.optionsLatex !== undefined && dataToUpdate.optionsLatex !== existing.optionsLatex) ||
          (dataToUpdate.answerLatex !== undefined && dataToUpdate.answerLatex !== existing.answerLatex) ||
          (dataToUpdate.diagramLatex !== undefined && dataToUpdate.diagramLatex !== existing.diagramLatex) ||
          (dataToUpdate.diagramType !== undefined && dataToUpdate.diagramType !== existing.diagramType) ||
          (dataToUpdate.hasDiagram !== undefined && dataToUpdate.hasDiagram !== existing.hasDiagram) ||
          (dataToUpdate.isSystemGeneratedAnswer !== undefined && dataToUpdate.isSystemGeneratedAnswer !== existing.isSystemGeneratedAnswer) ||
          (dataToUpdate.isAnswerEditedByUser !== undefined && dataToUpdate.isAnswerEditedByUser !== existing.isAnswerEditedByUser) ||
          (dataToUpdate.isAnswerExtractedFromImage !== undefined && dataToUpdate.isAnswerExtractedFromImage !== existing.isAnswerExtractedFromImage)
        ) {
          hasMeaningfulChanges = true;
        }

        if (hasMeaningfulChanges) {
          await checkAndCreateException(userId, existing.masterQuestionId, updated.id, dataToUpdate);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating question:", error);
      res.status(500).json({ error: "Failed to update question" });
    }
  });

  app.get("/api/profile", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const profile = await storage.getTeacherProfile(userId);
      res.json(profile || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.get("/api/users/:id/basic", isAuthenticated, async (req: any, res) => {
    try {
      // Basic info for display purposes
      const [user] = await storage.getAllUsers().then(users => users.filter(u => u.id === req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/user/theme", isAuthenticated, async (req: any, res) => {
    try {
      const { theme, colorPreset } = req.body;
      if (!theme || !colorPreset) {
        return res.status(400).json({ error: "Both theme and colorPreset are required" });
      }
      await storage.updateUserTheme(req.user.id, theme, colorPreset);
      clearAuthCache(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating theme:", error);
      res.status(500).json({ error: "Failed to update theme" });
    }
  });

  app.patch("/api/user/currency", isAuthenticated, async (req: any, res) => {
    try {
      const { currency } = req.body;
      if (!currency || !["USD", "INR", "EUR"].includes(currency)) {
        return res.status(400).json({ error: "Valid currency (USD, INR, EUR) is required" });
      }
      await storage.updateUserCurrency(req.user.id, currency);
      clearAuthCache(req.user.id);
      res.json({ success: true, currency });
    } catch (error) {
      console.error("Error updating currency:", error);
      res.status(500).json({ error: "Failed to update currency" });
    }
  });

  app.post("/api/auth/user/profile", isAuthenticated, upload.single("profileImage"), async (req: any, res) => {
    try {

      const { firstName, lastName, email, phone } = req.body || {};
      const updates: any = { firstName, lastName, email, phone };

      if (req.file) {
        const imageBuffer = await sharp(req.file.buffer)
          .resize(400, 400, { fit: "cover" })
          .png()
          .toBuffer();
        updates.profileImageUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
      }

      await storage.updateUserProfile(req.user.id, updates);
      clearAuthCache(req.user.id);
      res.json({ success: true, profileImageUrl: updates.profileImageUrl });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/profile", isAuthenticated, upload.single("logo"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      let logoUrl = req.body.logoUrl || null;

      if (req.file) {
        const logoBuffer = await sharp(req.file.buffer)
          .resize(200, 200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .png()
          .toBuffer();
        logoUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;
      }

      const data = insertTeacherProfileSchema.parse({
        userId,
        coachingName: req.body.coachingName || null,
        teacherName: req.body.teacherName || null,
        contactInfo: req.body.contactInfo || null,
        logoUrl,
        headerFormat: req.body.headerFormat || '{"style":"classic"}',
        watermarkText: req.body.watermarkText || null,
        accentColor: req.body.accentColor || "#000000",
      });

      const profile = await storage.upsertTeacherProfile(data);
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(400).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/test-papers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const data = insertTestPaperSchema.parse({ ...req.body, userId });

      if (!data.questionIds || data.questionIds.length === 0) {
        return res.status(400).json({ error: "At least one question is required" });
      }

      const userQuestions = await storage.getQuestionsByIds(data.questionIds, userId);
      if (userQuestions.length !== data.questionIds.length) {
        return res.status(400).json({ error: "Some questions do not belong to you" });
      }

      const paper = await storage.createTestPaper(data);
      res.status(201).json(paper);
    } catch (error) {
      console.error("Error creating test paper:", error);
      res.status(400).json({ error: "Failed to create test paper" });
    }
  });

  app.get("/api/test-papers", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const papers = await storage.getTestPapersByUser(userId);
      const enriched = await Promise.all(papers.map(async (paper) => {
        const questionsList = await storage.getQuestionsByIds(paper.questionIds, userId);
        const validIds = questionsList.map((q) => q.id);
        return {
          ...paper,
          questionIds: validIds,
          totalMarks: questionsList.reduce((sum, q) => sum + (q.marks || 0), 0),
        };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test papers" });
    }
  });

  app.get("/api/test-papers/:id", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const paper = await storage.getTestPaper(parseInt(req.params.id), userId);
      if (!paper || paper.userId !== userId) return res.status(404).json({ error: "Test paper not found" });
      const questionsList = await storage.getQuestionsByIds(paper.questionIds, userId);
      const validIds = new Set(questionsList.map((q) => q.id));
      const sanitizedPaper = {
        ...paper,
        questionIds: paper.questionIds.filter((id) => validIds.has(id)),
        totalMarks: questionsList.reduce((sum, q) => sum + (q.marks || 0), 0),
      };
      const profile = await storage.getTeacherProfile(userId);
      res.json({ paper: sanitizedPaper, questions: questionsList, profile });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test paper" });
    }
  });

  app.delete("/api/test-papers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      await storage.deleteTestPaper(parseInt(req.params.id), userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete test paper" });
    }
  });

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  app.post("/api/admin/master-questions/sync", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allUserQs = await storage.getQuestionsWithoutMasterId();
      const allMasterQs = await storage.getAllMasterQuestions();

      let updatedCount = 0;
      const syncLimit = pLimit(10);
      const syncPromises: Promise<void>[] = [];

      for (const q of allUserQs) {
        let bestMatchId: number | null = null;
        let bestScore = 0;

        const mastersInSubject = allMasterQs.filter(m => m.subject === q.subject);

        for (const m of mastersInSubject) {
          const score = computeSimilarity(q.latexContent, m.latexContent);
          if (score > bestScore) {
            bestScore = score;
            bestMatchId = m.id;
          }
        }

        if (bestMatchId && bestScore >= (SYSTEM_SETTINGS.masterMatchThreshold || 85) / 100) {
          syncPromises.push(syncLimit(async () => {
            await storage.updateQuestionMasterId(q.id, bestMatchId!);
            
            const master = allMasterQs.find(m => m.id === bestMatchId);
            if (master) {
              let hasMeaningfulChanges = false;
              if (
                (q.latexContent && q.latexContent !== master.latexContent) ||
                (q.optionsLatex && q.optionsLatex !== master.optionsLatex) ||
                (q.answerLatex && q.answerLatex !== master.answerLatex) ||
                (q.diagramLatex && q.diagramLatex !== master.diagramLatex) ||
                (q.hasDiagram !== master.hasDiagram) ||
                (q.isSystemGeneratedAnswer !== master.isSystemGeneratedAnswer) ||
                (q.isAnswerEditedByUser !== master.isAnswerEditedByUser) ||
                (q.isAnswerExtractedFromImage !== master.isAnswerExtractedFromImage)
              ) {
                hasMeaningfulChanges = true;
              }

              if (hasMeaningfulChanges) {
                await checkAndCreateException(q.userId, master.id, q.id, q);
              }
            }
          }));

          updatedCount++;
        }
      }
      
      await Promise.all(syncPromises);

      res.json({ success: true, updatedCount });
    } catch (err) {
      console.error("Failed to sync master questions", err);
      res.status(500).json({ error: "Failed to sync master questions" });
    }
  });

  app.get("/api/admin/master-questions/exceptions", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const exceptions = await storage.getPendingExceptionsWithDetails();
      
      const grouped = exceptions.reduce((acc: any, row: any) => {
        const mId = row.master.id;
        if (!acc[mId]) {
          acc[mId] = {
            master: row.master,
            exceptions: []
          };
        }
        acc[mId].exceptions.push({
          exception: row.exception,
          userQuestion: row.userQuestion
        });
        return acc;
      }, {});

      res.json(Object.values(grouped));
    } catch (err) {
      console.error("Failed to fetch exceptions", err);
      res.status(500).json({ error: "Failed to fetch exceptions" });
    }
  });

  app.get("/api/admin/master-questions/exceptions/count", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const count = await storage.getPendingExceptionsCount();
      res.json({ count });
    } catch (err) {
      console.error("Failed to fetch exception count", err);
      res.status(500).json({ error: "Failed to fetch exception count" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const exceptionId = parseInt(req.params.id);
      
      const row = await storage.getExceptionWithDetails(exceptionId);
      if (!row) {
        return res.status(404).json({ error: "Exception not found or already resolved" });
      }

      const { master, userQuestion } = row;
      
      const editedData = req.body || {};

      await storage.updateMasterQuestion(master.id, {
        latexContent: editedData.latexContent !== undefined ? editedData.latexContent : userQuestion.latexContent,
        optionsLatex: editedData.optionsLatex !== undefined ? editedData.optionsLatex : userQuestion.optionsLatex,
        answerLatex: editedData.answerLatex !== undefined ? editedData.answerLatex : userQuestion.answerLatex,
        diagramLatex: editedData.diagramLatex !== undefined ? editedData.diagramLatex : userQuestion.diagramLatex,
        hasDiagram: editedData.hasDiagram !== undefined ? editedData.hasDiagram : userQuestion.hasDiagram,
        diagramType: editedData.diagramType !== undefined ? editedData.diagramType : userQuestion.diagramType,
        isSystemGeneratedAnswer: userQuestion.isSystemGeneratedAnswer,
        isAnswerEditedByUser: userQuestion.isAnswerEditedByUser,
        isAnswerExtractedFromImage: userQuestion.isAnswerExtractedFromImage,
      });

      await storage.updateMasterQuestionExceptionStatus(exceptionId, "approved");
      
      const otherExceptions = await storage.getOtherPendingExceptionsForMaster(master.id, exceptionId);
      for (const other of otherExceptions) {
        await storage.updateMasterQuestionExceptionStatus(other.id, "rejected");
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to approve exception", err);
      res.status(500).json({ error: "Failed to approve exception" });
    }
  });

  app.post("/api/admin/master-questions/:masterId/recalculate-similarity", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const masterId = parseInt(req.params.masterId);
      const master = await storage.getMasterQuestion(masterId);
      
      if (!master) {
        return res.status(404).json({ error: "Master question not found" });
      }

      // Fetch all exceptions for this master
      const exceptions = await db.select().from(masterQuestionExceptions).where(eq(masterQuestionExceptions.masterQuestionId, masterId));
      let count = 0;
      let totalCost = 0;
      
      const itemsForPrompt: any[] = [];
      
      for (const exception of exceptions) {
        const userQuestion = await storage.getQuestion(exception.userQuestionId);
        if (!userQuestion) continue;
        
        itemsForPrompt.push({
          exceptionId: exception.id,
          master: master,
          user: userQuestion
        });
      }

      if (itemsForPrompt.length === 0) {
        return res.json({ success: true, count: 0, aiCost: 0 });
      }

      // Chunk items if more than 10
      const chunkSize = 10;
      for (let i = 0; i < itemsForPrompt.length; i += chunkSize) {
        const chunk = itemsForPrompt.slice(i, i + chunkSize);

        const systemInstruction = `You are evaluating a list of User's Edited Questions compared to their Original Master Questions.
Calculate a similarity score (0-100) between the Master Question and User's Edited Question based on the following logic:
1. Calculate a Base Score (0-80 points) based ONLY on the match between the Question Text. If the text is identical or fixes typos/formatting, give 80 points.
2. Add Bonus Weights (up to 20 points) if the User's Edited Question provides an Answer, Options, or Diagram that was MISSING in the Master Question, or improves existing ones significantly.
3. The final score is Base Score + Bonus Weights. Output an integer 0-100.
Output a JSON array of objects, strictly matching the input order, with fields: "id" (the exceptionId), "score" (integer 0-100), and "reasoning" (string).`;

        const promptParts = chunk.map(item => `
Exception ID: ${item.exceptionId}
Master Question:
Text: ${item.master.latexContent || "None"}
Options: ${item.master.optionsLatex || "None"}
Answer: ${item.master.answerLatex || "None"}
Diagram: ${item.master.diagramLatex || "None"}

User's Edited Question:
Text: ${item.user.latexContent || item.master.latexContent || "None"}
Options: ${item.user.optionsLatex !== undefined ? item.user.optionsLatex : (item.master.optionsLatex || "None")}
Answer: ${item.user.answerLatex !== undefined ? item.user.answerLatex : (item.master.answerLatex || "None")}
Diagram: ${item.user.diagramLatex !== undefined ? item.user.diagramLatex : (item.master.diagramLatex || "None")}
`).join("\n---\n");

        const prompt = `Evaluate the following items:\n${promptParts}`;

        const aiRes = await getAi().models.generateContent({
          model: SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "INTEGER" },
                  score: { type: "INTEGER" },
                  reasoning: { type: "STRING" }
                }
              }
            } as any
          }
        });

        let aiCost = 0;
        if (aiRes.usageMetadata) {
          aiCost = calculateAiCost(
            SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
            aiRes.usageMetadata.promptTokenCount || 0,
            aiRes.usageMetadata.candidatesTokenCount || 0,
            aiRes.usageMetadata.promptTokenCount || 0,
            aiRes.usageMetadata.cachedContentTokenCount || 0
          );
          totalCost += aiCost;
          if (aiCost > 0) {
            await storage.incrementUserCost(req.user.id, aiCost);
          }
        }

        const results = safeParseJSON(aiRes.text || "[]");
        if (Array.isArray(results)) {
          const costPerItem = aiCost / results.length;
          for (const resObj of results) {
            if (typeof resObj.id === "number" && typeof resObj.score === "number" && Number.isFinite(resObj.score)) {
              await storage.updateMasterQuestionExceptionScore(resObj.id, resObj.score, costPerItem);
              count++;
            }
          }
        }
      }

      res.json({ success: true, count, aiCost: totalCost });
    } catch (err) {
      console.error("Failed to recalculate similarity", err);
      res.status(500).json({ error: "Failed to recalculate similarity" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/batch-recalculate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid ids array" });
      }

      const chunkSize = 10;
      let count = 0;
      let totalCost = 0;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunkIds = ids.slice(i, i + chunkSize);
        
        // Fetch all exceptions in chunk
        const exceptions = await db.select().from(masterQuestionExceptions).where(inArray(masterQuestionExceptions.id, chunkIds));
        if (exceptions.length === 0) continue;

        const itemsForPrompt: any[] = [];
        
        for (const exception of exceptions) {
          const userQuestion = await storage.getQuestion(exception.userQuestionId);
          const masterQuestion = await storage.getMasterQuestion(exception.masterQuestionId);
          if (!userQuestion || !masterQuestion) continue;
          
          itemsForPrompt.push({
            exceptionId: exception.id,
            master: masterQuestion,
            user: userQuestion
          });
        }

        if (itemsForPrompt.length === 0) continue;

        const systemInstruction = `You are evaluating a list of User's Edited Questions compared to their Original Master Questions.
Calculate a similarity score (0-100) between the Master Question and User's Edited Question based on the following logic:
1. Calculate a Base Score (0-80 points) based ONLY on the match between the Question Text. If the text is identical or fixes typos/formatting, give 80 points.
2. Add Bonus Weights (up to 20 points) if the User's Edited Question provides an Answer, Options, or Diagram that was MISSING in the Master Question, or improves existing ones significantly.
3. The final score is Base Score + Bonus Weights. Output an integer 0-100.
Output a JSON array of objects, strictly matching the input order, with fields: "id" (the exceptionId), "score" (integer 0-100), and "reasoning" (string).`;

        const promptParts = itemsForPrompt.map(item => `
Exception ID: ${item.exceptionId}
Master Question:
Text: ${item.master.latexContent || "None"}
Options: ${item.master.optionsLatex || "None"}
Answer: ${item.master.answerLatex || "None"}
Diagram: ${item.master.diagramLatex || "None"}

User's Edited Question:
Text: ${item.user.latexContent || item.master.latexContent || "None"}
Options: ${item.user.optionsLatex !== undefined ? item.user.optionsLatex : (item.master.optionsLatex || "None")}
Answer: ${item.user.answerLatex !== undefined ? item.user.answerLatex : (item.master.answerLatex || "None")}
Diagram: ${item.user.diagramLatex !== undefined ? item.user.diagramLatex : (item.master.diagramLatex || "None")}
`).join("\n---\n");

        const prompt = `Evaluate the following items:\n${promptParts}`;

        const aiRes = await getAi().models.generateContent({
          model: SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "INTEGER" },
                  score: { type: "INTEGER" },
                  reasoning: { type: "STRING" }
                }
              }
            } as any
          }
        });

        let aiCost = 0;
        if (aiRes.usageMetadata) {
          aiCost = calculateAiCost(
            SYSTEM_SETTINGS.reviewModel || SYSTEM_SETTINGS.extractionModel || "gemma-4-26b-a4b-it",
            aiRes.usageMetadata.promptTokenCount || 0,
            aiRes.usageMetadata.candidatesTokenCount || 0,
            aiRes.usageMetadata.promptTokenCount || 0,
            aiRes.usageMetadata.cachedContentTokenCount || 0
          );
          totalCost += aiCost;
          if (aiCost > 0) {
            await storage.incrementUserCost(req.user.id, aiCost);
          }
        }

        const results = safeParseJSON(aiRes.text || "[]");
        if (Array.isArray(results)) {
          const costPerItem = aiCost / results.length;
          for (const resObj of results) {
            if (typeof resObj.id === "number" && typeof resObj.score === "number" && Number.isFinite(resObj.score)) {
              await storage.updateMasterQuestionExceptionScore(resObj.id, resObj.score, costPerItem);
              count++;
            }
          }
        }
      }

      res.json({ success: true, count, aiCost: totalCost });
    } catch (err) {
      console.error("Failed to batch recalculate similarity", err);
      res.status(500).json({ error: "Failed to batch recalculate similarity" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/batch-approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid ids array" });
      }

      const exceptions = await storage.getPendingExceptionsWithDetails();
      let count = 0;
      const processedMasterIds = new Set<number>();

      for (const exceptionId of ids) {
        const row = exceptions.find((e: any) => e.exception.id === exceptionId && e.exception.status === "pending");
        if (!row) continue;

        const { master, userQuestion } = row;
        
        if (processedMasterIds.has(master.id)) continue;
        processedMasterIds.add(master.id);

        await storage.updateMasterQuestion(master.id, {
          latexContent: userQuestion.latexContent,
          optionsLatex: userQuestion.optionsLatex,
          answerLatex: userQuestion.answerLatex,
          diagramLatex: userQuestion.diagramLatex,
          hasDiagram: userQuestion.hasDiagram,
          diagramType: userQuestion.diagramType,
          isSystemGeneratedAnswer: userQuestion.isSystemGeneratedAnswer,
          isAnswerEditedByUser: userQuestion.isAnswerEditedByUser,
          isAnswerExtractedFromImage: userQuestion.isAnswerExtractedFromImage,
        });

        await storage.updateMasterQuestionExceptionStatus(exceptionId, "approved");
        
        const otherExceptions = exceptions.filter((e: any) => e.master.id === master.id && e.exception.id !== exceptionId);
        for (const other of otherExceptions) {
          await storage.updateMasterQuestionExceptionStatus(other.exception.id, "rejected");
        }
        count++;
      }
      res.json({ success: true, count });
    } catch (err) {
      console.error("Failed to batch approve exceptions", err);
      res.status(500).json({ error: "Failed to batch approve exceptions" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/auto-approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const threshold = req.body.threshold !== undefined ? Number(req.body.threshold) : 100;
      const exceptions = await storage.getPendingExceptionsWithDetails();
      
      const perfectMatches = exceptions.filter((e: any) => e.exception.aiScore !== null && e.exception.aiScore !== undefined && e.exception.aiScore >= threshold);
      
      let count = 0;
      const processedMasterIds = new Set<number>();
      
      for (const row of perfectMatches) {
        if (row.exception.status !== "pending") continue;

        const { master, userQuestion } = row;
        
        if (processedMasterIds.has(master.id)) continue;
        processedMasterIds.add(master.id);

        await storage.updateMasterQuestion(master.id, {
          latexContent: userQuestion.latexContent,
          optionsLatex: userQuestion.optionsLatex,
          answerLatex: userQuestion.answerLatex,
          diagramLatex: userQuestion.diagramLatex,
          hasDiagram: userQuestion.hasDiagram,
          diagramType: userQuestion.diagramType,
          isSystemGeneratedAnswer: userQuestion.isSystemGeneratedAnswer,
          isAnswerEditedByUser: userQuestion.isAnswerEditedByUser,
          isAnswerExtractedFromImage: userQuestion.isAnswerExtractedFromImage,
        });

        await storage.updateMasterQuestionExceptionStatus(row.exception.id, "approved");
        
        const otherExceptions = exceptions.filter((e: any) => e.master.id === master.id && e.exception.id !== row.exception.id);
        for (const other of otherExceptions) {
          await storage.updateMasterQuestionExceptionStatus(other.exception.id, "rejected");
        }
        count++;
      }
      
      res.json({ success: true, count });
    } catch (err) {
      console.error("Failed to auto-approve perfect matches", err);
      res.status(500).json({ error: "Failed to auto-approve perfect matches" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/:id/reject", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const exceptionId = parseInt(req.params.id);
      await storage.updateMasterQuestionExceptionStatus(exceptionId, "rejected");
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to reject exception", err);
      res.status(500).json({ error: "Failed to reject exception" });
    }
  });

  app.post("/api/admin/master-questions/exceptions/clear-processed", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { count } = await storage.deleteProcessedExceptions();
      res.json({ success: true, count });
    } catch (err) {
      console.error("Failed to clear processed exceptions", err);
      res.status(500).json({ error: "Failed to clear processed exceptions" });
    }
  });

  app.get("/api/admin/master-questions", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const masterQs = await storage.getAllMasterQuestions();
      res.json(masterQs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch master questions" });
    }
  });

  app.get("/api/admin/master-questions/:id/image", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const type = (req.query.type as 'original' | 'diagram') || 'diagram';
      const q = await storage.getMasterQuestionImage(parseInt(req.params.id));

      const dataUri = q?.image;
      if (!dataUri || !dataUri.startsWith('data:image/')) return res.status(404).end();

      const matches = dataUri.match(/^data:(image\/\w+);base64,(.*)$/);
      if (!matches) return res.status(404).end();

      const buffer = Buffer.from(matches[2], 'base64');
      res.setHeader('Content-Type', matches[1]);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(buffer);
    } catch (error) {
      res.status(500).end();
    }
  });

  app.delete("/api/admin/master-questions/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteMasterQuestion(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete master question" });
    }
  });

  app.post("/api/admin/master-questions/bulk-extract", isAuthenticated, isAdmin, upload.array("images", 50), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      const source = req.body.source || "bulk_upload";
      const subjectOverride = req.body.subject || null;
      const boardOverride = req.body.board || null;
      const classOverride = req.body.className || null;
      const examOverride = req.body.exam || null;
      const yearOverride = req.body.year || null;
      const results: { filename: string; status: string; question?: any; error?: string; questionsAdded?: number; imageUrl?: string }[] = [];

      const masterQuestionsCache: Record<string, any[]> = {};

      for (const file of files) {
        try {
          const base64Image = file.buffer.toString("base64");
          const mimeType = file.mimetype || "image/png";

          const maxOutputTokens = getMaxOutputTokens(SYSTEM_SETTINGS.extractionModel);
          const response = await getAi().models.generateContent({
            model: SYSTEM_SETTINGS.extractionModel,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { data: base64Image, mimeType } },
                ],
              },
            ],
            config: {
              systemInstruction: MULTI_QUESTION_EXTRACTION_PROMPT,
              maxOutputTokens,
            },
          });

          if (response.usageMetadata) {
            const aiCost = calculateAiCost(
              SYSTEM_SETTINGS.extractionModel, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.candidatesTokenCount || 0, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.cachedContentTokenCount || 0);
            if (aiCost > 0) {
              await storage.incrementUserCost(req.user.id, aiCost);
            }
          }

          const responseText = response.text || "";
          const parsed = safeParseJSON(responseText);
          if (!parsed) {
            results.push({ filename: file.originalname, status: "failed", error: "Could not parse extraction response" });
            continue;
          }

          const questions = parsed.questions || [parsed];
          const fileName = `source_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const uploadedUrl = await uploadImageToSupabase(file.buffer, fileName, req.headers.authorization);
          const originalImageUrl = uploadedUrl;
          let addedCount = 0;
          let dupCount = 0;

          for (const q of questions) {
            const latexContent = q.latexContent || "";
            if (!latexContent.trim()) continue;

            const qSub = subjectOverride || q.subject || "Unknown";
            const qTopic = q.topic || "";
            const qChapter = q.chapter || "";
            const cacheKey = `${qSub}|${qTopic}|${qChapter}`;
            if (!masterQuestionsCache[cacheKey]) {
              masterQuestionsCache[cacheKey] = await storage.getPossibleDuplicateMasterQuestions(qSub, qTopic, qChapter);
            }
            const existingQs = masterQuestionsCache[cacheKey] || [];
            const tokensA = normalizeForComparison(latexContent).split(" ").filter(t => t.length > 1);
            let isDuplicate = false;
            if (tokensA.length > 0) {
              const setA = new Set(tokensA);
              isDuplicate = existingQs.some((eq: any) => computeSimilarityWithSet(setA, eq.latexContent, eq) >= 0.7);
            }
            if (isDuplicate) {
              dupCount++;
              continue;
            }



            const saved = await storage.createMasterQuestion({
              imageUrl: originalImageUrl,
              subject: subjectOverride || q.subject || "Unknown",
              chapter: q.chapter || null,
              topic: q.topic || "Unknown",
              latexContent,
              optionsLatex: q.optionsLatex || null,
              answerLatex: q.answerLatex || null,
              isSystemGeneratedAnswer: q.isSystemGeneratedAnswer === true || q.isSystemGeneratedAnswer === "true",
              isAnswerExtractedFromImage: q.isAnswerExtractedFromImage === true || q.isAnswerExtractedFromImage === "true",
              diagramLatex: q.diagramLatex || null,
              hasDiagram: q.hasDiagram || false,
              latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
              difficulty: q.difficulty || "medium",
              marks: q.marks || 4,
              source,
              addedBy: req.user.id,
              board: boardOverride || null,
              className: classOverride || null,
              exam: examOverride || null,
              year: yearOverride || null,
            });

            masterQuestionsCache[cacheKey].push(saved);
            addedCount++;
          }

          if (addedCount > 0) {
            results.push({
              filename: file.originalname, status: "success",
              imageUrl: originalImageUrl, questionsAdded: addedCount
            });
          } else if (dupCount > 0) {
            results.push({ filename: file.originalname, status: "duplicate" });
          } else {
            results.push({ filename: file.originalname, status: "failed", error: "No questions found in image" });
          }
        } catch (err: any) {
          results.push({ filename: file.originalname, status: "failed", error: err.message });
        }
      }

      const succeeded = results.reduce((sum, r) => sum + (r.questionsAdded || 0), 0);
      const duplicates = results.filter(r => r.status === "duplicate").length;
      const failed = results.filter(r => r.status === "failed").length;
      const imagesProcessed = results.filter(r => r.status === "success").length;

      res.json({
        total: files.length,
        succeeded,
        duplicates,
        failed,
        imagesProcessed,
        results,
      });
    } catch (error) {
      console.error("Bulk extract error:", error);
      res.status(500).json({ error: "Bulk extraction failed" });
    }
  });

  app.post("/api/admin/master-questions/pdf-extract", isAuthenticated, isAdmin, upload.array("pages", 200), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No page images uploaded" });
      }

      const source = req.body.source || "pdf_upload";
      const allQuestions: any[] = [];
      const masterQuestionsCache: Record<string, any[]> = {};
      const userQuestions: any[] = [];

      const pagePromises = files.map((file, i) => globalAiLimit(async () => {
        const pageNum = req.body[`pageNum_${i}`] || (i + 1);
        try {
          const base64Image = file.buffer.toString("base64");
          const mimeType = file.mimetype || "image/png";

          const maxOutputTokens = getMaxOutputTokens(SYSTEM_SETTINGS.extractionModel);
          const response = await getAi().models.generateContent({
            model: SYSTEM_SETTINGS.extractionModel,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { data: base64Image, mimeType } },
                ],
              },
            ],
            config: {
              systemInstruction: MULTI_QUESTION_EXTRACTION_PROMPT,
              maxOutputTokens,
            },
          });

          const responseText = response.text || "";
          const usage = response.usageMetadata;
          const totalPromptTokens = usage?.promptTokenCount || 0;
          const totalCompletionTokens = usage?.candidatesTokenCount || 0;
          const totalCachedTokens = usage?.cachedContentTokenCount || 0;

          // Bill the total cost of the request once to avoid precision loss or skipping if questions array is empty
          const totalCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, totalPromptTokens, totalCompletionTokens, totalPromptTokens, totalCachedTokens);
          if (totalCost > 0) {
            await storage.incrementUserCost(req.user.id, totalCost);
          }

          const parsed = safeParseJSON(responseText);
          if (!parsed) return;
          const questions = parsed.questions || [];

          const questionsCount = questions.length;
          const basePromptTokens = Math.ceil(totalPromptTokens / (questionsCount || 1));
          const baseCompletionTokens = Math.ceil(totalCompletionTokens / (questionsCount || 1));
          const baseCachedTokens = Math.ceil(totalCachedTokens / (questionsCount || 1));

          const fileName = `source_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const uploadedUrl = await uploadImageToSupabase(file.buffer, fileName, req.headers.authorization);
          const originalImageUrl = uploadedUrl;

          for (const q of questions) {
            let diagramImageUrl = null;
            let diagramLatex = null;
            let qPromptTokens = basePromptTokens;
            let qCompletionTokens = baseCompletionTokens;
            let qTotalTokens = qPromptTokens + qCompletionTokens;
            // qAiCost is approximate for record keeping
            let qAiCost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, qPromptTokens, qCompletionTokens, totalPromptTokens, baseCachedTokens);

            const qSub = q.subject || "Unknown";
            const qTopic = q.topic || "Unknown";
            const qChapter = q.chapter || "";
            const cacheKey = `${qSub}|${qTopic}|${qChapter}`;

            if (!masterQuestionsCache[cacheKey]) {
              masterQuestionsCache[cacheKey] = await storage.getPossibleDuplicateMasterQuestions(qSub, qTopic, qChapter);
            }
            const duplicateMatch = (q.latexContent && q.latexContent.length > 10)
              ? findDuplicateQuestion(q.latexContent, masterQuestionsCache[cacheKey] || [], userQuestions)
              : null;

            allQuestions.push({
              latexContent: q.latexContent || "",
              optionsLatex: q.optionsLatex ? String(q.optionsLatex) : (Array.isArray(q.options) ? q.options.join("\n") : null),
              answerLatex: q.answerLatex || null,
              isSystemGeneratedAnswer: q.isSystemGeneratedAnswer === true || q.isSystemGeneratedAnswer === "true",
              isAnswerExtractedFromImage: q.isAnswerExtractedFromImage === true || q.isAnswerExtractedFromImage === "true",
              subject: qSub,
              chapter: qChapter,
              topic: qTopic,
              hasDiagram: q.hasDiagram || false,
              diagramBounds: q.diagramBounds || null,
              diagramImageUrl: null,
              diagramLatex,
              imageUrl: originalImageUrl,
              difficulty: q.difficulty || "medium",
              marks: q.marks || 4,
              promptTokens: qPromptTokens,
              completionTokens: qCompletionTokens,
              totalTokens: qTotalTokens,
              aiCost: qAiCost,
              pageNumber: Number(pageNum),
              source,
              duplicateMatch,
            });
          }
        } catch (err: any) {
          console.error(`Error processing page ${pageNum}:`, err.message);
        }
      }));
      await Promise.all(pagePromises);

      res.json({ total: allQuestions.length, questions: allQuestions });
    } catch (error) {
      console.error("PDF extract error:", error);
      res.status(500).json({ error: "PDF extraction failed" });
    }
  });

  app.post("/api/admin/master-questions/bulk-save", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { questions, source } = req.body;
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "No questions provided" });
      }

      let saved = 0;
      let duplicates = 0;

      const userJobs = await getUserJobs(req.user.id);

      const uploadLimit = pLimit(5);
      await Promise.all(questions.map((q: any) => uploadLimit(async () => {
        if (q.imageUrl && q.imageUrl.startsWith("data:")) {
          try {
            const match = q.imageUrl.match(/^data:(image\/\w+);base64,(.*)$/);
            if (match) {
              const buffer = Buffer.from(match[2], "base64");
              const fileName = `master_question_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              const uploadedUrl = await uploadImageToSupabase(buffer, fileName, req.headers.authorization);
              q.imageUrl = uploadedUrl;
            }
          } catch (e) {
            console.error("Failed to upload image to Supabase", e);
          }
        }
      })));

      const involvedSubjects = Array.from(new Set(questions.map((q: any) => q.subject || "Unknown")));
      const masterQuestionsCache: Record<string, any[]> = {};
      
      for (const subject of involvedSubjects) {
        const mastersInSubject = await storage.getMasterQuestionsBySubject(subject as string);
        for (const m of mastersInSubject) {
          const cacheKey = `${m.subject}|${m.topic || ""}|${m.chapter || ""}`;
          if (!masterQuestionsCache[cacheKey]) masterQuestionsCache[cacheKey] = [];
          masterQuestionsCache[cacheKey].push(m);
        }
      }

      for (const q of questions) {
        const qSub = q.subject || "Unknown";
        const qTopic = q.topic || "";
        const qChapter = q.chapter || "";
        const cacheKey = `${qSub}|${qTopic}|${qChapter}`;
        const existing = masterQuestionsCache[cacheKey] || [];
        const tokensA = normalizeForComparison(q.latexContent || "").split(" ").filter(t => t.length > 1);
        let isDuplicate = false;
        if (tokensA.length > 0) {
           const setA = new Set(tokensA);
           const threshold = Math.max(SYSTEM_SETTINGS.masterMatchThreshold || 85, 80) / 100;
           isDuplicate = existing.some((eq: any) => computeSimilarityWithSet(setA, eq.latexContent, eq) >= threshold);
        }
        if (isDuplicate) {
          duplicates++;
          continue;
        }

        existing.push({ latexContent: q.latexContent || "", _tokens: new Set(tokensA) });

        // Check for completed jobs that haven't been applied to the frontend state yet
        if (typeof q.originalIndex === "number") {
          const completedJobs = userJobs.filter(j =>
            (j.type === 'regenerate_figure' || j.type === 'generate_answer') &&
            j.status === 'completed' &&
            j.data?.source === 'pdf_upload' &&
            j.data?.index === q.originalIndex
          );
          for (const job of completedJobs) {
            if (job.type === 'regenerate_figure' && job.result?.diagramLatex) {
              q.diagramLatex = job.result.diagramLatex;
              q.diagramType = 'latex';
              q.hasDiagram = true;
              q.promptTokens = (q.promptTokens || 0) + (job.result.promptTokens || 0);
              q.completionTokens = (q.completionTokens || 0) + (job.result.completionTokens || 0);
              q.totalTokens = (q.totalTokens || 0) + (job.result.totalTokens || 0);
              q.aiCost = (q.aiCost || 0) + (job.result.aiCost || 0);
            }
            if (job.type === 'generate_answer' && job.result?.answerLatex) {
              q.answerLatex = job.result.answerLatex;
              q.promptTokens = (q.promptTokens || 0) + (job.result.promptTokens || 0);
              q.completionTokens = (q.completionTokens || 0) + (job.result.completionTokens || 0);
              q.totalTokens = (q.totalTokens || 0) + (job.result.totalTokens || 0);
              q.aiCost = (q.aiCost || 0) + (job.result.aiCost || 0);
            }
          }
        }

        const masterQuestion = await storage.createMasterQuestion({
          imageUrl: q.imageUrl || null,
          subject: q.subject || "Unknown",
          chapter: q.chapter || null,
          topic: q.topic || "Unknown",
          latexContent: q.latexContent || "",
          diagramLatex: q.diagramLatex || null,
          diagramType: q.diagramType || (q.diagramLatex ? "latex" : "image"),
          optionsLatex: q.optionsLatex ? String(q.optionsLatex) : (Array.isArray(q.options) ? q.options.join("\n") : null),
          answerLatex: q.answerLatex || null,
          hasDiagram: q.hasDiagram || false,
          latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
          difficulty: q.difficulty || "medium",
          marks: q.marks || 4,
          promptTokens: q.promptTokens || 0,
          completionTokens: q.completionTokens || 0,
          totalTokens: q.totalTokens || 0,
          aiCost: q.aiCost || 0,
          source: source || "pdf_upload",
          addedBy: req.user.id,
        });

        if (typeof q.originalIndex === "number") {
          const allRelatedJobs = userJobs.filter(j =>
            (j.type === 'regenerate_figure' || j.type === 'generate_answer') &&
            j.data?.source === 'pdf_upload' &&
            j.data?.index === q.originalIndex
          );
          for (const job of allRelatedJobs) {
            await updateJob(job.id, { data: { ...job.data, questionId: masterQuestion.id, source: 'master_bank' } });

            if (job.status === 'completed') {
              if (job.type === 'regenerate_figure' && job.result?.diagramLatex && !q.diagramLatex) {
                await storage.updateMasterQuestion(masterQuestion.id, {
                  diagramLatex: job.result.diagramLatex,
                  diagramType: 'latex',
                  hasDiagram: true,
                  promptTokens: (masterQuestion.promptTokens || 0) + (job.result.promptTokens || 0),
                  completionTokens: (masterQuestion.completionTokens || 0) + (job.result.completionTokens || 0),
                  totalTokens: (masterQuestion.totalTokens || 0) + (job.result.totalTokens || 0),
                  aiCost: (masterQuestion.aiCost || 0) + (job.result.aiCost || 0)
                });
              }
              if (job.type === 'generate_answer' && job.result?.answerLatex && !q.answerLatex) {
                await storage.updateMasterQuestion(masterQuestion.id, {
                  answerLatex: job.result.answerLatex,
                  promptTokens: (masterQuestion.promptTokens || 0) + (job.result.promptTokens || 0),
                  completionTokens: (masterQuestion.completionTokens || 0) + (job.result.completionTokens || 0),
                  totalTokens: (masterQuestion.totalTokens || 0) + (job.result.totalTokens || 0),
                  aiCost: (masterQuestion.aiCost || 0) + (job.result.aiCost || 0)
                });
              }
            }
          }
        }

        if (q.aiCost) {
          await storage.incrementSavedCost(req.user.id, q.aiCost);
        }
        saved++;
      }

      res.json({ saved, duplicates, total: questions.length });
    } catch (error) {
      console.error("Bulk save error:", error);
      res.status(500).json({ error: "Failed to save questions" });
    }
  });

  app.post("/api/admin/update-pricing", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const newChart = await fetchAndUpdatePricingChart();
      if (newChart) {
        res.json({ success: true, message: "Pricing chart updated successfully", chart: newChart });
      } else {
        res.status(500).json({ error: "Failed to parse Google Pricing page structure" });
      }
    } catch (error) {
      console.error("Pricing update error:", error);
      res.status(500).json({ error: "Internal server error during pricing update" });
    }
  });



  app.get("/api/admin/settings", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      res.json(SYSTEM_SETTINGS);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await updateSystemSettings(req.body);
      res.json({ success: true, settings: SYSTEM_SETTINGS });
    } catch (e) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/admin/pricing", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const dbChart = await storage.getAiPricingChart();
      // If the user manually deleted all rows from the DB, show them the DB is empty (or fallback to RAM defaults)
      // We will merge it with the defaults so the UI always has a structure to render,
      // but if we want to reflect the DB precisely:
      res.json(Object.keys(dbChart).length > 0 ? dbChart : getAiPricingChart());
    } catch (e) {
      console.error("Pricing fetch error:", e);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const masterQs = await storage.getAllMasterQuestions();
      const subjects: Record<string, number> = {};
      for (const q of masterQs) {
        subjects[q.subject] = (subjects[q.subject] || 0) + 1;
      }
      res.json({ total: masterQs.length, subjects });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const targetUserId = req.params.id;
      const { role } = req.body;

      if (!["admin", "teacher"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      if (req.user.id === targetUserId && role !== "admin") {
        return res.status(403).json({ error: "Cannot remove your own admin privileges" });
      }

      await storage.updateUserRole(targetUserId, role);
      res.json({ success: true });
    } catch (error) {
      console.error("Update user role error:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.get("/api/admin/dashboard", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [allUsers, allQuestions, allPapers, masterQs, totalExceptionsCostResult, systemSettingsResult] = await Promise.all([
        storage.getAllUsers(),
        db.select({ id: questions.id, userId: questions.userId, subject: questions.subject }).from(questions),
        db.select({ id: testPapers.id, userId: testPapers.userId }).from(testPapers),
        db.select({ id: masterQuestions.id, subject: masterQuestions.subject }).from(masterQuestions),
        db.select({ totalCost: sql`SUM(${masterQuestionExceptions.aiCost})` }).from(masterQuestionExceptions),
        storage.getSystemSettings(),
      ]);

      const clearedExceptionsCost = Number(systemSettingsResult.clearedExceptionsCost) || 0;
      const totalExceptionsCost = (totalExceptionsCostResult[0]?.totalCost ? Number(totalExceptionsCostResult[0].totalCost) : 0) + clearedExceptionsCost;


      const masterSubjects: Record<string, number> = {};
      for (const q of masterQs) {
        masterSubjects[q.subject] = (masterSubjects[q.subject] || 0) + 1;
      }

      const questionSubjects: Record<string, number> = {};
      const userQuestionsMap = new Map<string, typeof allQuestions>();

      for (const q of allQuestions) {
        questionSubjects[q.subject] = (questionSubjects[q.subject] || 0) + 1;
        const arr = userQuestionsMap.get(q.userId);
        if (arr) {
          arr.push(q);
        } else {
          userQuestionsMap.set(q.userId, [q]);
        }
      }

      const userPapersMap = new Map<string, typeof allPapers>();
      for (const p of allPapers) {
        const arr = userPapersMap.get(p.userId);
        if (arr) {
          arr.push(p);
        } else {
          userPapersMap.set(p.userId, [p]);
        }
      }

      const userStats = allUsers.map(u => {
        const userQuestions = userQuestionsMap.get(u.id) || [];
        const userPapers = userPapersMap.get(u.id) || [];
        return {
          id: u.id,
          phone: u.phone,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          totalAiCost: u.totalAiCost,
          savedAiCost: u.savedAiCost,
          createdAt: u.createdAt,
          questionCount: userQuestions.length,
          paperCount: userPapers.length,
          subjects: [...new Set(userQuestions.map(q => q.subject))],
        };
      });

      res.json({
        totalUsers: allUsers.length,
        totalQuestions: allQuestions.length,
        totalPapers: allPapers.length,
        totalMasterQuestions: masterQs.length,
        totalExceptionsCost,
        masterSubjects,
        questionSubjects,
        users: userStats,
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.post("/api/admin/scrape", isAuthenticated, async (req: any, res) => {
    if (!req.session?.adminVerified) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { source: sourceFilter, maxPapers = 2, customUrl } = req.body;

    const SCRAPE_Q_PROMPT = `You are a question paper analyzer. Extract ALL questions from the given content.
Also detect the metadata from the content context.

For EACH question found, return a JSON array where each element has:
{
  "subject": "Physics" | "Chemistry" | "Mathematics" | "Biology" | "other subject name",
  "chapter": "chapter name or null",
  "topic": "specific topic",
  "latexContent": "the full question text with LaTeX math notation using $...$ for inline and $$...$$ for display",
  "hasDiagram": true/false,
  "difficulty": "easy" | "medium" | "hard",
  "marks": number,
  "board": "CBSE" | "ICSE" | "IGCSE" | "IB" | "State Board" | "NTA" | null,
  "className": "9" | "10" | "11" | "12" | null,
  "exam": "JEE Main" | "JEE Advanced" | "NEET" | "CBSE Board" | "ICSE Board" | "Olympiad" | "KVPY" | "Practice" | null,
  "year": "2024" or whatever year, or null
}

Rules:
- Convert ALL mathematical expressions to proper LaTeX
- Include options (A), (B), (C), (D) if present
- Preserve question numbering
- Detect subject, board, class, exam, year from context
- Set hasDiagram to true if the question references a figure/diagram
- Return ONLY the JSON array, no other text`;

    async function parseQuestionsFromText(text: string, context: string, userId: string): Promise<any[]> {
      const response = await getAi().models.generateContent({
        model: SYSTEM_SETTINGS.extractionModel,
        contents: [{
          role: "user",
          parts: [{ text: `Context: ${context}\n\nContent:\n${text.slice(0, 30000)}` }],
        }],
        config: {
          systemInstruction: SCRAPE_Q_PROMPT,
        }
      });

      if (response.usageMetadata) {
        const cost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.candidatesTokenCount || 0, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.cachedContentTokenCount || 0);
        if (cost > 0) await storage.incrementUserCost(userId, cost);
      }

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        let cleaned = jsonMatch[0].replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
        if (!cleaned.endsWith("]")) cleaned += "]";
        try { return JSON.parse(cleaned); } catch { return []; }
      }
    }

    async function saveExtractedQuestions(questions: any[], sourceName: string): Promise<number> {
      let saved = 0;
      for (const q of questions) {
        if (!q.latexContent || q.latexContent.length < 10) continue;
        try {
          await storage.createMasterQuestion({
            subject: q.subject || "Unknown",
            chapter: q.chapter || null,
            topic: q.topic || "Unknown",
            latexContent: q.latexContent,
            hasDiagram: q.hasDiagram || false,
            latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
            difficulty: q.difficulty || "medium",
            marks: q.marks || 4,
            source: sourceName.slice(0, 200),
            addedBy: "scraper",
            board: q.board || null,
            className: q.className || null,
            exam: q.exam || null,
            year: q.year || null,
          });
          saved++;
        } catch (err) { console.warn("Failed to insert parsed question:", err); }
      }
      return saved;
    }

    async function extractQuestionsFromPDFBuffer(pdfBuffer: Buffer, context: string, userId: string): Promise<any[]> {
      const base64 = pdfBuffer.toString("base64");
      const response = await getAi().models.generateContent({
        model: SYSTEM_SETTINGS.extractionModel,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64 } },
            { text: `Context: ${context}` },
          ],
        }],
        config: {
          systemInstruction: SCRAPE_Q_PROMPT,
        }
      });

      if (response.usageMetadata) {
        const cost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.candidatesTokenCount || 0, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.cachedContentTokenCount || 0);
        if (cost > 0) await storage.incrementUserCost(userId, cost);
      }

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        let cleaned = jsonMatch[0].replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
        if (!cleaned.endsWith("]")) cleaned += "]";
        try { return JSON.parse(cleaned); } catch { return []; }
      }
    }

    if (customUrl) {
      const results: { paper: string; questionsFound: number; saved: number; error?: string }[] = [];
      try {
        const pageRes = await fetch(customUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        if (!pageRes.ok) {
          return res.json({ totalFound: 0, totalSaved: 0, results: [{ paper: customUrl, questionsFound: 0, saved: 0, error: `HTTP ${pageRes.status}` }] });
        }

        const contentType = pageRes.headers.get("content-type") || "";

        if (contentType.includes("application/pdf")) {
          const pdfBuffer = Buffer.from(await pageRes.arrayBuffer());
          const pdfName = customUrl.split("/").pop() || "PDF";
          const questions = await extractQuestionsFromPDFBuffer(pdfBuffer, `PDF: ${pdfName}, URL: ${customUrl}`, req.user.id);
          const saved = await saveExtractedQuestions(questions, `${pdfName} (scraped)`);
          results.push({ paper: pdfName, questionsFound: questions.length, saved });
        } else {
          const html = await pageRes.text();
          const cheerio = await import("cheerio");
          const $ = cheerio.load(html);
          const pageTitle = $("title").text().trim() || customUrl;

          const pdfLinks: { href: string; text: string }[] = [];
          $("a[href]").each((_, el) => {
            const href = $(el).attr("href") || "";
            if (href.match(/\.pdf(\?|$)/i)) {
              let fullUrl = href;
              if (href.startsWith("/") || !href.startsWith("http")) {
                const base = new URL(customUrl);
                fullUrl = href.startsWith("/") ? `${base.origin}${href}` : `${base.origin}/${base.pathname.split("/").slice(0, -1).join("/")}/${href}`.replace(/\/\//g, "/").replace(":/", "://");
              }
              const linkText = $(el).text().trim() || href.split("/").pop() || "PDF";
              pdfLinks.push({ href: fullUrl, text: linkText });
            }
          });

          if (pdfLinks.length > 0) {
            const pdfLimit = Math.min(pdfLinks.length, maxPapers || 5);
            console.log(`Found ${pdfLinks.length} PDF links, processing ${pdfLimit}`);

            for (let i = 0; i < pdfLimit; i++) {
              const pdf = pdfLinks[i];
              try {
                console.log(`  Downloading PDF: ${pdf.href}`);
                const pdfRes = await fetch(pdf.href, {
                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                });
                if (!pdfRes.ok) {
                  results.push({ paper: pdf.text, questionsFound: 0, saved: 0, error: `HTTP ${pdfRes.status}` });
                  continue;
                }
                const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

                const pdfName = pdf.href.split("/").pop()?.replace(".pdf", "") || pdf.text;
                const questions = await extractQuestionsFromPDFBuffer(pdfBuffer, `PDF: ${pdfName}, from page: ${pageTitle}, URL: ${customUrl}`, req.user.id);
                const saved = await saveExtractedQuestions(questions, `${pageTitle} - ${pdfName}`);
                results.push({ paper: pdfName, questionsFound: questions.length, saved });

                await new Promise(r => setTimeout(r, 1500));
              } catch (e: any) {
                results.push({ paper: pdf.text, questionsFound: 0, saved: 0, error: e.message?.slice(0, 150) });
              }
            }

            if (pdfLinks.length > pdfLimit) {
              results.push({ paper: `... and ${pdfLinks.length - pdfLimit} more PDFs (increase max papers to process more)`, questionsFound: 0, saved: 0 });
            }
          } else {
            $("script, style, nav, footer, header, .sidebar, .ad").remove();
            const textContent = $("body").text().replace(/\s+/g, " ").trim();

            if (textContent.length < 50) {
              return res.json({ totalFound: 0, totalSaved: 0, results: [{ paper: customUrl, questionsFound: 0, saved: 0, error: "No questions or PDF links found on page" }] });
            }

            const questions = await parseQuestionsFromText(textContent, `Page: ${pageTitle}, URL: ${customUrl}`, req.user.id);
            const saved = await saveExtractedQuestions(questions, pageTitle);
            results.push({ paper: pageTitle, questionsFound: questions.length, saved });
          }
        }

        const totalFound = results.reduce((s, r) => s + r.questionsFound, 0);
        const totalSaved = results.reduce((s, r) => s + r.saved, 0);
        return res.json({ totalFound, totalSaved, results });
      } catch (e: any) {
        return res.json({ totalFound: 0, totalSaved: 0, results: [{ paper: customUrl, questionsFound: 0, saved: 0, error: e.message?.slice(0, 200) }] });
      }
    }

    const SCRAPE_SOURCES = [
      {
        name: "JEE Advanced",
        papers: [
          { title: "JEE Advanced 2024 - Physics", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2024", exam: "JEE Advanced", subject: "Physics", board: "NTA", className: "12" },
          { title: "JEE Advanced 2024 - Chemistry", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2024", exam: "JEE Advanced", subject: "Chemistry", board: "NTA", className: "12" },
          { title: "JEE Advanced 2024 - Mathematics", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2024", exam: "JEE Advanced", subject: "Mathematics", board: "NTA", className: "12" },
          { title: "JEE Advanced 2023 - Physics", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2023", exam: "JEE Advanced", subject: "Physics", board: "NTA", className: "12" },
          { title: "JEE Advanced 2023 - Chemistry", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2023", exam: "JEE Advanced", subject: "Chemistry", board: "NTA", className: "12" },
          { title: "JEE Advanced 2023 - Mathematics", url: "https://www.embibe.com/exams/jee-advanced-question-paper/", year: "2023", exam: "JEE Advanced", subject: "Mathematics", board: "NTA", className: "12" },
        ],
      },
      {
        name: "JEE Main",
        papers: [
          { title: "JEE Main 2024 - Physics", url: "https://www.embibe.com/exams/jee-main-question-paper/", year: "2024", exam: "JEE Main", subject: "Physics", board: "NTA", className: "12" },
          { title: "JEE Main 2024 - Chemistry", url: "https://www.embibe.com/exams/jee-main-question-paper/", year: "2024", exam: "JEE Main", subject: "Chemistry", board: "NTA", className: "12" },
          { title: "JEE Main 2024 - Mathematics", url: "https://www.embibe.com/exams/jee-main-question-paper/", year: "2024", exam: "JEE Main", subject: "Mathematics", board: "NTA", className: "12" },
        ],
      },
      {
        name: "CBSE",
        papers: [
          { title: "CBSE Class 12 Physics 2024-25", url: "https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html", year: "2025", exam: "CBSE Board", subject: "Physics", board: "CBSE", className: "12" },
          { title: "CBSE Class 12 Chemistry 2024-25", url: "https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html", year: "2025", exam: "CBSE Board", subject: "Chemistry", board: "CBSE", className: "12" },
          { title: "CBSE Class 12 Mathematics 2024-25", url: "https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html", year: "2025", exam: "CBSE Board", subject: "Mathematics", board: "CBSE", className: "12" },
          { title: "CBSE Class 12 Biology 2024-25", url: "https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html", year: "2025", exam: "CBSE Board", subject: "Biology", board: "CBSE", className: "12" },
        ],
      },
    ];

    const SCRAPE_PROMPT = `You are a question paper analyzer. Extract ALL questions from the given website content.

For EACH question found, return a JSON array where each element has:
{
  "subject": "Physics" | "Chemistry" | "Mathematics" | "Biology",
  "chapter": "chapter name",
  "topic": "specific topic",
  "latexContent": "the full question text with LaTeX math notation using $...$ for inline and $$...$$ for display",
  "hasDiagram": true/false,
  "difficulty": "easy" | "medium" | "hard",
  "marks": number
}

Rules:
- Convert ALL mathematical expressions to proper LaTeX
- Include options (A), (B), (C), (D) if present
- Preserve question numbering
- Set hasDiagram to true if the question references a figure/diagram
- Return ONLY the JSON array, no other text`;

    const results: { paper: string; questionsFound: number; saved: number; error?: string }[] = [];

    try {
      for (const src of SCRAPE_SOURCES) {
        if (sourceFilter && !src.name.toLowerCase().includes(sourceFilter.toLowerCase())) continue;

        const toProcess = src.papers.slice(0, maxPapers);
        for (const paper of toProcess) {
          try {
            const pageRes = await fetch(paper.url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            });
            if (!pageRes.ok) {
              results.push({ paper: paper.title, questionsFound: 0, saved: 0, error: `HTTP ${pageRes.status}` });
              continue;
            }
            const html = await pageRes.text();

            const cheerio = await import("cheerio");
            const $ = cheerio.load(html);
            $("script, style, nav, footer, header, .sidebar, .ad").remove();
            const textContent = $("body").text().replace(/\s+/g, " ").trim();

            if (textContent.length < 100) {
              results.push({ paper: paper.title, questionsFound: 0, saved: 0, error: "Not enough content" });
              continue;
            }

            const response = await getAi().models.generateContent({
              model: SYSTEM_SETTINGS.extractionModel,
              contents: [{
                role: "user",
                parts: [{
                  text: `${SCRAPE_PROMPT}\n\nSubject: ${paper.subject}\nExam: ${paper.exam}, Year: ${paper.year}\n\nWebsite content:\n${textContent.slice(0, 30000)}`
                }],
              }],
            });

            if (response.usageMetadata) {
              const cost = calculateAiCost(SYSTEM_SETTINGS.extractionModel, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.candidatesTokenCount || 0, response.usageMetadata.promptTokenCount || 0, response.usageMetadata.cachedContentTokenCount || 0);
              if (cost > 0) await storage.incrementUserCost(req.user.id, cost);
            }

            const responseText = response.text || "";
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            let questions: any[] = [];
            if (jsonMatch) {
              try {
                questions = JSON.parse(jsonMatch[0]);
              } catch {
                let cleaned = jsonMatch[0].replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
                if (!cleaned.endsWith("]")) cleaned += "]";
                try { questions = JSON.parse(cleaned); } catch (err) { console.warn("Failed to parse cleaned JSON:", err); }
              }
            }

            let savedCount = 0;
            for (const q of questions) {
              if (!q.latexContent || q.latexContent.length < 10) continue;
              try {
                await storage.createMasterQuestion({
                  subject: paper.subject || q.subject || "Unknown",
                  chapter: q.chapter || null,
                  topic: q.topic || "Unknown",
                  latexContent: q.latexContent,
                  hasDiagram: q.hasDiagram || false,
                  latexGenerabilityScore: Number(q.latexGenerabilityScore) || 0,
                  difficulty: q.difficulty || "medium",
                  marks: q.marks || 4,
                  source: `${paper.exam} ${paper.year} (scraped)`,
                  addedBy: "scraper",
                  board: paper.board || null,
                  className: paper.className || null,
                  exam: paper.exam || null,
                  year: paper.year || null,
                });
                savedCount++;
              } catch (err) { console.warn("Failed to insert master question:", err); }
            }

            results.push({ paper: paper.title, questionsFound: questions.length, saved: savedCount });

            await new Promise(r => setTimeout(r, 1500));
          } catch (e: any) {
            results.push({ paper: paper.title, questionsFound: 0, saved: 0, error: e.message?.slice(0, 200) });
          }
        }
      }

      const totalSaved = results.reduce((s, r) => s + r.saved, 0);
      const totalFound = results.reduce((s, r) => s + r.questionsFound, 0);
      res.json({ totalFound, totalSaved, results });
    } catch (error: any) {
      console.error("Error in AI integrations callback:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/generate-answer", isAuthenticated, async (req: any, res) => {
    try {
      const { latexContent, optionsLatex, diagramImageUrl, imageUrl, style, questionId, source, index, extractJobId } = req.body;
      if (!latexContent) {
        return res.status(400).json({ error: "Missing latexContent" });
      }

      const userId = req.user.id;
      const job = await createJob(userId, "generate_answer", 1, { questionId, source, index, extractJobId });
      res.json({ jobId: job.id, message: "Answer generation started in the background" });

      globalAiLimit(async () => {
        try {
          let styleInstruction = "";
          if (style === "very_concise") {
            styleInstruction = "VERY CONCISE: If it's a multiple choice question (MCQ), provide ONLY the correct option text and mention 'Option [Letter] - Answer' or a 1-line answer. For non-MCQ questions, provide ONLY a 1-line minimal answer. Do not elaborate.";
          } else if (style === "concise") {
            styleInstruction = "CONCISE: If it's a multiple choice question (MCQ), provide the correct option text and exactly 1 line of explanation. For non-MCQ questions, provide a 3-4 line concise answer.";
          } else if (style === "full") {
            styleInstruction = "FULL: Provide the full, detailed answer and step-by-step solution to this question. Try to keep it to the point and do not blabber.";
          } else {
            await updateJob(job.id, { status: "failed", error: "Invalid style parameter" });
            return;
          }

          const prompt = `You are an expert academic tutor. Generate the solution for the provided question.

LATEX & MATH FORMATTING RULES (CRITICAL FOR PARSING):
- DO NOT use any Markdown formatting (no **bold**, no *italics*, no \`code\`). The UI only supports LaTeX.
- Wrap ALL mathematical expressions in LaTeX delimiters: $...$ for inline, $$...$$ for display/block. You MUST ensure every opening $ has a closing $.
- BRACES ARE MANDATORY: ALL LaTeX commands that take arguments MUST use curly braces. Write \\text{AB}, NEVER \\text AB. Write x_{10}, NEVER x_10.
- Subscripts/superscripts MUST use braces if more than one character: $v_{0}$, $x^{2}$, $a_{rms}$, $e^{-x}$.
- Use proper LaTeX commands: \\frac{a}{b}, \\sqrt{x}, \\vec{F}, \\alpha, \\beta, \\theta, etc.
- TABLES: Tables MUST be formatted as valid LaTeX arrays \\begin{array}...\\end{array}. Ensure all \\multicolumn and \\multirow commands have properly bracketed arguments: \\multicolumn{cols}{align}{text}. Do NOT leave them unbracketed like \\multicolumn 6 |c|. Wrap text inside tables with \\text{...}.
- Operators: \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\approx, \\rightarrow, \\infty.
- Units: DO NOT use LaTeX for simple numbers and units with slashes (e.g., write 10 m/s, 38 N, 0.5 kg). ONLY use LaTeX for true math fractions (\\frac) or complex formulas.
- Chemical formulas: $\\text{H}_{2}\\text{O}$, $\\text{CO}_{2}$.
- Trigonometric: \\sin, \\cos, \\tan, \\log, \\ln.

STYLE INSTRUCTIONS:
${styleInstruction}

QUESTION:
${latexContent}

${optionsLatex ? `OPTIONS:\n${optionsLatex}\n` : ""}
`;

          const contents = [{ role: "user", parts: [] as any[] }];

          const targetImage = diagramImageUrl || imageUrl;
          if (targetImage) {
            try {
              const match = targetImage.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
              if (match) {
                contents[0].parts.push({
                  inlineData: { mimeType: match[1], data: match[2] }
                });
              }
            } catch (e) {
              console.warn("Failed to parse diagram image base64:", e);
            }
          }

          contents[0].parts.push({ text: prompt });

          const response = await getAi().models.generateContent({
            model: SYSTEM_SETTINGS.answerGenerationModel,
            contents,
          });

          let promptTokens = response.usageMetadata?.promptTokenCount || 0;
          let completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
          let cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
          let totalTokens = response.usageMetadata?.totalTokenCount || 0;
          let aiCost = calculateAiCost(SYSTEM_SETTINGS.answerGenerationModel, promptTokens, completionTokens, promptTokens, cachedTokens);

          await storage.incrementUserCost(userId, aiCost);

          const answerLatex = response.text || "";

          // Always read the latest job data in case it was updated (e.g. question was saved to library while generating)
          const currentJob = await getJob(job.id);
          const currentSource = currentJob?.data?.source || source;
          const currentQuestionId = currentJob?.data?.questionId || questionId;

          if (currentSource === 'library' && currentQuestionId) {
            const q = await storage.getQuestion(currentQuestionId, userId);
            if (q && q.userId === userId) {
              const dataToUpdate = {
                answerLatex,
                isSystemGeneratedAnswer: true,
                isAnswerEditedByUser: false,
                isAnswerExtractedFromImage: false,
                promptTokens: (q.promptTokens || 0) + promptTokens,
                completionTokens: (q.completionTokens || 0) + completionTokens,
                totalTokens: (q.totalTokens || 0) + totalTokens,
                aiCost: (q.aiCost || 0) + aiCost
              };
              const updated = await storage.updateQuestion(currentQuestionId, userId, dataToUpdate);
              if (q.masterQuestionId && updated) {
                await checkAndCreateException(userId, q.masterQuestionId, updated.id, dataToUpdate);
              }
            }
          }

          await updateJob(job.id, {
            progress: 1,
            status: "completed",
            result: { answerLatex, promptTokens, completionTokens, totalTokens, aiCost, questionId: currentQuestionId, source: currentSource, index }
          });
        } catch (err: any) {
          console.error("Background answer generation failed:", err);
          await updateJob(job.id, { status: "failed", error: err.message || "Background answer generation failed" });
        }
      }).catch((err: any) => {
        console.error("Queue error:", err);
      });

    } catch (error: any) {
      console.error("AI Generate Answer error:", error);
      res.status(500).json({ error: "Failed to start generate answer" });
    }
  });

  app.get("/api/proxy-image", async (req, res) => {
    try {
      const url = req.query.url;
      if (!url || typeof url !== "string") return res.status(400).end();
      const response = await fetch(url);
      if (!response.ok) return res.status(response.status).end();
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.send(Buffer.from(buffer));
    } catch (e) {
      console.error("Proxy error", e);
      res.status(500).end();
    }
  });

  app.post("/api/jobs/cleanup", isAuthenticated, async (req: any, res) => {
    try {
      await deleteCompletedJobs(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error cleaning up jobs:", error);
      res.status(500).json({ error: "Failed to clean up jobs" });
    }
  });

  return httpServer;
}