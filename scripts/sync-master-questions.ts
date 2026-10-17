import { db } from "../server/db";
import { questions, masterQuestions } from "../shared/schema";
import { eq, isNull } from "drizzle-orm";
import { checkAndCreateException } from "../server/routes";

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

async function run() {
  console.log("Fetching questions...");
  const allUserQs = await db.select().from(questions).where(isNull(questions.masterQuestionId));
  console.log(`Found ${allUserQs.length} user questions without a masterQuestionId.`);

  const allMasterQs = await db.select().from(masterQuestions);
  console.log(`Loaded ${allMasterQs.length} master questions.`);

  let updatedCount = 0;

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

    // Using 0.85 as a safe minimum threshold for migration mapping
    if (bestMatchId && bestScore >= 0.85) { 
      console.log(`Matching user question ${q.id} to master question ${bestMatchId} (Score: ${bestScore.toFixed(2)})`);
      await db.update(questions).set({ masterQuestionId: bestMatchId }).where(eq(questions.id, q.id));
      
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
          console.log(`Triggering exception for user question ${q.id} vs master question ${bestMatchId}`);
          await checkAndCreateException(q.userId, master.id, q.id, q);
        }
      }

      updatedCount++;
    }
  }

  console.log(`Successfully synced ${updatedCount} user questions to master questions.`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
