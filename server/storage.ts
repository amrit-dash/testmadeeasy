import { db } from "./db";
import { eq, and, desc, sql, count, getTableColumns, inArray, isNull } from "drizzle-orm";
import {
  questions, teacherProfiles, testPapers, masterQuestions, masterQuestionExceptions, aiPricing, systemSettings,
  type Question, type InsertQuestion,
  type MasterQuestion, type InsertMasterQuestion,
  type MasterQuestionException, type InsertMasterQuestionException,
  type TeacherProfile, type InsertTeacherProfile,
  type TestPaper, type InsertTestPaper,
} from "@shared/schema";
import { users, type User } from "@shared/models/auth";

export interface IStorage {
  createQuestion(data: InsertQuestion): Promise<Question>;
  getQuestion(id: number, userId?: string): Promise<Question | undefined>;
  getQuestionImage(id: number, userId: string): Promise<{ image: string | null } | undefined>;
  getQuestionsByUser(userId: string): Promise<Question[]>;
  getQuestionsByIds(ids: number[], userId: string): Promise<Question[]>;
  getQuestionsWithoutMasterId(): Promise<Question[]>;
  updateQuestionMasterId(id: number, masterQuestionId: number): Promise<void>;
  updateQuestion(id: number, userId: string, data: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: number, userId: string): Promise<void>;
  deleteQuestions(ids: number[], userId: string): Promise<void>;

  createMasterQuestion(data: InsertMasterQuestion): Promise<MasterQuestion>;
  getAllMasterQuestions(): Promise<MasterQuestion[]>;
  getMasterQuestionsBySubject(subject: string): Promise<MasterQuestion[]>;
  getPossibleDuplicateMasterQuestions(subject: string, topic?: string, chapter?: string): Promise<Partial<MasterQuestion>[]>;
  getMasterQuestion(id: number): Promise<MasterQuestion | undefined>;
  getMasterQuestionImage(id: number): Promise<{ image: string | null } | undefined>;
  updateMasterQuestion(id: number, data: Partial<MasterQuestion>): Promise<MasterQuestion>;
  deleteMasterQuestion(id: number): Promise<void>;

  createMasterQuestionException(data: InsertMasterQuestionException): Promise<MasterQuestionException>;
  getPendingExceptionsWithDetails(): Promise<any[]>;
  getExceptionWithDetails(id: number): Promise<any>;
  getOtherPendingExceptionsForMaster(masterId: number, exceptId: number): Promise<MasterQuestionException[]>;
  getPendingExceptionsCount(): Promise<number>;
  updateMasterQuestionExceptionStatus(id: number, status: string): Promise<void>;
  updateMasterQuestionExceptionScore(id: number, score: number, aiCost?: number): Promise<void>;
  deleteProcessedExceptions(): Promise<{ count: number }>;

  getTeacherProfile(userId: string): Promise<TeacherProfile | undefined>;
  upsertTeacherProfile(data: InsertTeacherProfile): Promise<TeacherProfile>;

  createTestPaper(data: InsertTestPaper): Promise<TestPaper>;
  getTestPaper(id: number, userId?: string): Promise<TestPaper | undefined>;
  getTestPapersByUser(userId: string): Promise<TestPaper[]>;
  deleteTestPaper(id: number, userId: string): Promise<void>;

  updateUserRole(userId: string, role: string): Promise<void>;
  updateUserTheme(userId: string, theme: string, colorPreset: string): Promise<void>;
  updateUserCurrency(userId: string, currency: string): Promise<void>;
  updateUserProfile(userId: string, data: { firstName?: string, lastName?: string, email?: string, phone?: string, profileImageUrl?: string }): Promise<void>;
  incrementUserCost(userId: string, additionalCost: number): Promise<void>;
  incrementSavedCost(userId: string, additionalCost: number): Promise<void>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getFirstAdminUser(): Promise<User | undefined>;
  getUserCount(): Promise<number>;
  getAllQuestions(): Promise<Question[]>;
  getAllTestPapers(): Promise<TestPaper[]>;
  getAiPricingChart(): Promise<any>;
  upsertAiPricing(model: string, tiers: any): Promise<void>;
  getSystemSettings(): Promise<Record<string, any>>;
  upsertSystemSettings(key: string, value: any): Promise<void>;
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";

class DatabaseStorage implements IStorage {
  async createQuestion(data: InsertQuestion): Promise<Question> {
    const [question] = await db.insert(questions).values(data).returning();
    return question;
  }

  async getQuestionImage(id: number, userId: string): Promise<{ image: string | null } | undefined> {
    const [result] = await db.select({ image: questions.imageUrl }).from(questions).where(and(eq(questions.id, id), eq(questions.userId, userId)));
    return result;
  }

  async getQuestion(id: number, userId?: string): Promise<Question | undefined> {
    const conditions = [eq(questions.id, id)];
    if (userId) conditions.push(eq(questions.userId, userId));
    
    const [question] = await db.select({
      id: questions.id, userId: questions.userId, subject: questions.subject,
      chapter: questions.chapter, topic: questions.topic, latexContent: questions.latexContent,
      optionsLatex: questions.optionsLatex, answerLatex: questions.answerLatex,
      isSystemGeneratedAnswer: questions.isSystemGeneratedAnswer, diagramLatex: questions.diagramLatex,
      diagramType: questions.diagramType,
      isDiagramHidden: questions.isDiagramHidden,
      diagramBounds: questions.diagramBounds,
      questionBounds: questions.questionBounds,
      hasDiagram: questions.hasDiagram, latexGenerabilityScore: questions.latexGenerabilityScore,
      difficulty: questions.difficulty, marks: questions.marks,
      promptTokens: questions.promptTokens, completionTokens: questions.completionTokens,
      totalTokens: questions.totalTokens, aiCost: questions.aiCost, submittedBy: questions.submittedBy,
      createdAt: questions.createdAt,
      imageUrl: questions.imageUrl,
    }).from(questions).where(and(...conditions));
    
    if (!question) return undefined;

    return {
      ...question,
      imageUrl: question.imageUrl ? (question.imageUrl.startsWith("http") || question.imageUrl.startsWith("data:") ? question.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${question.imageUrl}`) : null
    } as unknown as Question;
  }

  async getQuestionsByUser(userId: string): Promise<Question[]> {
    const results = await db.select({
      id: questions.id, userId: questions.userId, subject: questions.subject,
      chapter: questions.chapter, topic: questions.topic, latexContent: questions.latexContent,
      optionsLatex: questions.optionsLatex, answerLatex: questions.answerLatex,
      isSystemGeneratedAnswer: questions.isSystemGeneratedAnswer, diagramLatex: questions.diagramLatex,
      diagramType: questions.diagramType,
      isDiagramHidden: questions.isDiagramHidden,
      diagramBounds: questions.diagramBounds,
      questionBounds: questions.questionBounds,
      hasDiagram: questions.hasDiagram, latexGenerabilityScore: questions.latexGenerabilityScore,
      difficulty: questions.difficulty, marks: questions.marks,
      promptTokens: questions.promptTokens, completionTokens: questions.completionTokens,
      totalTokens: questions.totalTokens, aiCost: questions.aiCost, submittedBy: questions.submittedBy,
      createdAt: questions.createdAt,
      imageUrl: questions.imageUrl,
    }).from(questions).where(eq(questions.userId, userId)).orderBy(desc(questions.createdAt));

    return results.map(q => ({
      ...q,
      imageUrl: q.imageUrl ? (q.imageUrl.startsWith("http") || q.imageUrl.startsWith("data:") ? q.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${q.imageUrl}`) : null
    })) as unknown as Question[];
  }

  async getQuestionsByIds(ids: number[], userId: string): Promise<Question[]> {
    if (ids.length === 0) return [];
    const results = await db.select({
      id: questions.id, userId: questions.userId, subject: questions.subject,
      chapter: questions.chapter, topic: questions.topic, latexContent: questions.latexContent,
      optionsLatex: questions.optionsLatex, answerLatex: questions.answerLatex,
      isSystemGeneratedAnswer: questions.isSystemGeneratedAnswer, diagramLatex: questions.diagramLatex,
      diagramType: questions.diagramType,
      isDiagramHidden: questions.isDiagramHidden,
      diagramBounds: questions.diagramBounds,
      questionBounds: questions.questionBounds,
      hasDiagram: questions.hasDiagram, latexGenerabilityScore: questions.latexGenerabilityScore,
      difficulty: questions.difficulty, marks: questions.marks,
      promptTokens: questions.promptTokens, completionTokens: questions.completionTokens,
      totalTokens: questions.totalTokens, aiCost: questions.aiCost, submittedBy: questions.submittedBy,
      createdAt: questions.createdAt,
      imageUrl: questions.imageUrl,
    }).from(questions).where(and(inArray(questions.id, ids), eq(questions.userId, userId)));

    return results.map(q => ({
      ...q,
      imageUrl: q.imageUrl ? (q.imageUrl.startsWith("http") || q.imageUrl.startsWith("data:") ? q.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${q.imageUrl}`) : null
    })) as unknown as Question[];
  }

  async getQuestionsWithoutMasterId(): Promise<Question[]> {
    return await db.select().from(questions).where(isNull(questions.masterQuestionId));
  }

  async updateQuestionMasterId(id: number, masterQuestionId: number): Promise<void> {
    await db.update(questions).set({ masterQuestionId }).where(eq(questions.id, id));
  }

  async updateQuestion(id: number, userId: string, data: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [updated] = await db
      .update(questions)
      .set(data)
      .where(and(eq(questions.id, id), eq(questions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteQuestion(id: number, userId: string): Promise<void> {
    await db.delete(questions).where(and(eq(questions.id, id), eq(questions.userId, userId)));
  }

  async deleteQuestions(ids: number[], userId: string): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(questions).where(and(inArray(questions.id, ids), eq(questions.userId, userId)));
  }

  async createMasterQuestion(data: InsertMasterQuestion): Promise<MasterQuestion> {
    const [question] = await db.insert(masterQuestions).values(data).returning();
    return question;
  }

    async getMasterQuestionsBySubject(subject: string): Promise<MasterQuestion[]> {
    const results = await db.select({
      id: masterQuestions.id, subject: masterQuestions.subject, chapter: masterQuestions.chapter,
      topic: masterQuestions.topic, latexContent: masterQuestions.latexContent,
      optionsLatex: masterQuestions.optionsLatex, answerLatex: masterQuestions.answerLatex,
      isSystemGeneratedAnswer: masterQuestions.isSystemGeneratedAnswer, diagramLatex: masterQuestions.diagramLatex,
      diagramType: masterQuestions.diagramType,
      isDiagramHidden: masterQuestions.isDiagramHidden,
      diagramBounds: masterQuestions.diagramBounds,
      questionBounds: masterQuestions.questionBounds,
      hasDiagram: masterQuestions.hasDiagram, latexGenerabilityScore: masterQuestions.latexGenerabilityScore,
      difficulty: masterQuestions.difficulty, marks: masterQuestions.marks,
      promptTokens: masterQuestions.promptTokens, completionTokens: masterQuestions.completionTokens,
      totalTokens: masterQuestions.totalTokens, aiCost: masterQuestions.aiCost, submittedBy: masterQuestions.submittedBy,
      source: masterQuestions.source, addedBy: masterQuestions.addedBy, board: masterQuestions.board,
      className: masterQuestions.className, exam: masterQuestions.exam, year: masterQuestions.year,
      createdAt: masterQuestions.createdAt,
      imageUrl: masterQuestions.imageUrl,
    }).from(masterQuestions).where(eq(masterQuestions.subject, subject)).orderBy(desc(masterQuestions.createdAt));

    return results.map(q => ({
      ...q,
      imageUrl: q.imageUrl ? (q.imageUrl.startsWith("http") || q.imageUrl.startsWith("data:") ? q.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${q.imageUrl}`) : null
    })) as unknown as MasterQuestion[];
  }

  async getPossibleDuplicateMasterQuestions(subject: string, topic?: string, chapter?: string): Promise<Partial<MasterQuestion>[]> {
    let conditions = [eq(masterQuestions.subject, subject)];
    if (topic) {
      conditions.push(eq(masterQuestions.topic, topic));
    }
    if (chapter) {
      conditions.push(eq(masterQuestions.chapter, chapter));
    }

    const results = await db.select({
      id: masterQuestions.id,
      subject: masterQuestions.subject,
      chapter: masterQuestions.chapter,
      topic: masterQuestions.topic,
      latexContent: masterQuestions.latexContent,
      optionsLatex: masterQuestions.optionsLatex,
      answerLatex: masterQuestions.answerLatex,
    }).from(masterQuestions).where(and(...conditions));

    return results as Partial<MasterQuestion>[];
  }

  async getAllMasterQuestions(): Promise<MasterQuestion[]> {
    const results = await db.select({
      id: masterQuestions.id, subject: masterQuestions.subject, chapter: masterQuestions.chapter,
      topic: masterQuestions.topic, latexContent: masterQuestions.latexContent,
      optionsLatex: masterQuestions.optionsLatex, answerLatex: masterQuestions.answerLatex,
      isSystemGeneratedAnswer: masterQuestions.isSystemGeneratedAnswer, diagramLatex: masterQuestions.diagramLatex,
      diagramType: masterQuestions.diagramType,
      isDiagramHidden: masterQuestions.isDiagramHidden,
      diagramBounds: masterQuestions.diagramBounds,
      questionBounds: masterQuestions.questionBounds,
      hasDiagram: masterQuestions.hasDiagram, latexGenerabilityScore: masterQuestions.latexGenerabilityScore,
      difficulty: masterQuestions.difficulty, marks: masterQuestions.marks,
      promptTokens: masterQuestions.promptTokens, completionTokens: masterQuestions.completionTokens,
      totalTokens: masterQuestions.totalTokens, aiCost: masterQuestions.aiCost, submittedBy: masterQuestions.submittedBy,
      source: masterQuestions.source, addedBy: masterQuestions.addedBy, board: masterQuestions.board,
      className: masterQuestions.className, exam: masterQuestions.exam, year: masterQuestions.year,
      createdAt: masterQuestions.createdAt,
      imageUrl: masterQuestions.imageUrl,
    }).from(masterQuestions).orderBy(desc(masterQuestions.createdAt));

    return results.map(q => ({
      ...q,
      imageUrl: q.imageUrl ? (q.imageUrl.startsWith("http") || q.imageUrl.startsWith("data:") ? q.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${q.imageUrl}`) : null
    })) as unknown as MasterQuestion[];
  }

  async getMasterQuestionImage(id: number): Promise<{ image: string | null } | undefined> {
    const [result] = await db.select({ image: masterQuestions.imageUrl }).from(masterQuestions).where(eq(masterQuestions.id, id));
    return result;
  }

  async getMasterQuestion(id: number): Promise<MasterQuestion | undefined> {
    const [question] = await db.select({
      id: masterQuestions.id, subject: masterQuestions.subject, chapter: masterQuestions.chapter,
      topic: masterQuestions.topic, latexContent: masterQuestions.latexContent,
      optionsLatex: masterQuestions.optionsLatex, answerLatex: masterQuestions.answerLatex,
      isSystemGeneratedAnswer: masterQuestions.isSystemGeneratedAnswer, diagramLatex: masterQuestions.diagramLatex,
      diagramType: masterQuestions.diagramType,
      isDiagramHidden: masterQuestions.isDiagramHidden,
      diagramBounds: masterQuestions.diagramBounds,
      questionBounds: masterQuestions.questionBounds,
      hasDiagram: masterQuestions.hasDiagram, latexGenerabilityScore: masterQuestions.latexGenerabilityScore,
      difficulty: masterQuestions.difficulty, marks: masterQuestions.marks,
      promptTokens: masterQuestions.promptTokens, completionTokens: masterQuestions.completionTokens,
      totalTokens: masterQuestions.totalTokens, aiCost: masterQuestions.aiCost, submittedBy: masterQuestions.submittedBy,
      source: masterQuestions.source, addedBy: masterQuestions.addedBy, board: masterQuestions.board,
      className: masterQuestions.className, exam: masterQuestions.exam, year: masterQuestions.year,
      createdAt: masterQuestions.createdAt,
      imageUrl: masterQuestions.imageUrl,
    }).from(masterQuestions).where(eq(masterQuestions.id, id));

    if (!question) return undefined;

    return {
      ...question,
      imageUrl: question.imageUrl ? (question.imageUrl.startsWith("http") || question.imageUrl.startsWith("data:") ? question.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${question.imageUrl}`) : null
    } as unknown as MasterQuestion;
  }

  async updateMasterQuestion(id: number, data: Partial<MasterQuestion>): Promise<MasterQuestion> {
    const [question] = await db.update(masterQuestions)
      .set(data)
      .where(eq(masterQuestions.id, id))
      .returning();
    return question;
  }

  async deleteMasterQuestion(id: number): Promise<void> {
    await db.delete(masterQuestions).where(eq(masterQuestions.id, id));
  }

  async createMasterQuestionException(data: InsertMasterQuestionException): Promise<MasterQuestionException> {
    const [exception] = await db.insert(masterQuestionExceptions).values(data).returning();
    return exception;
  }

  async getPendingExceptionsWithDetails(): Promise<any[]> {
    const results = await db.select({
      exception: masterQuestionExceptions,
      master: masterQuestions,
      userQuestion: questions,
    })
    .from(masterQuestionExceptions)
    .innerJoin(masterQuestions, eq(masterQuestionExceptions.masterQuestionId, masterQuestions.id))
    .innerJoin(questions, eq(masterQuestionExceptions.userQuestionId, questions.id))
    .where(eq(masterQuestionExceptions.status, "pending"))
    .orderBy(desc(masterQuestionExceptions.createdAt));
    return results;
  }

  async getExceptionWithDetails(id: number): Promise<any> {
    const [result] = await db.select({
      exception: masterQuestionExceptions,
      master: masterQuestions,
      userQuestion: questions,
    })
    .from(masterQuestionExceptions)
    .innerJoin(masterQuestions, eq(masterQuestionExceptions.masterQuestionId, masterQuestions.id))
    .innerJoin(questions, eq(masterQuestionExceptions.userQuestionId, questions.id))
    .where(and(eq(masterQuestionExceptions.id, id), eq(masterQuestionExceptions.status, "pending")));
    return result;
  }

  async getOtherPendingExceptionsForMaster(masterId: number, exceptId: number): Promise<MasterQuestionException[]> {
    return db.select()
      .from(masterQuestionExceptions)
      .where(and(
        eq(masterQuestionExceptions.masterQuestionId, masterId),
        eq(masterQuestionExceptions.status, "pending"),
        sql`${masterQuestionExceptions.id} != ${exceptId}`
      ));
  }

  async getPendingExceptionsCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(masterQuestionExceptions).where(eq(masterQuestionExceptions.status, "pending"));
    return result?.count ?? 0;
  }

  async updateMasterQuestionExceptionStatus(id: number, status: string): Promise<void> {
    await db.update(masterQuestionExceptions)
      .set({ status })
      .where(eq(masterQuestionExceptions.id, id));
  }

  async updateMasterQuestionExceptionScore(id: number, score: number, aiCost?: number): Promise<void> {
    const updates: any = { aiScore: score };
    if (aiCost !== undefined) {
      updates.aiCost = sql`${masterQuestionExceptions.aiCost} + ${aiCost}`;
    }
    await db.update(masterQuestionExceptions)
      .set(updates)
      .where(eq(masterQuestionExceptions.id, id));
  }

  async deleteProcessedExceptions(): Promise<{ count: number }> {
    // Fetch specifically which rows we're going to process to avoid race conditions
    const toDelete = await db.select({
      id: masterQuestionExceptions.id,
      aiCost: masterQuestionExceptions.aiCost
    })
    .from(masterQuestionExceptions)
    .where(inArray(masterQuestionExceptions.status, ["approved", "rejected"]));

    if (toDelete.length === 0) return { count: 0 };

    let sum = 0;
    const ids: number[] = [];
    for (const row of toDelete) {
      if (row.aiCost) sum += Number(row.aiCost);
      ids.push(row.id);
    }

    return await db.transaction(async (tx) => {
      const deleted = await tx.delete(masterQuestionExceptions)
        .where(inArray(masterQuestionExceptions.id, ids))
        .returning({ id: masterQuestionExceptions.id });

      if (sum > 0) {
        const existing = await tx.select().from(systemSettings).where(eq(systemSettings.key, "clearedExceptionsCost"));
        if (existing.length > 0) {
          let current = 0;
          try {
            current = Number(JSON.parse(existing[0].value)) || 0;
          } catch(e) {}
          await tx.update(systemSettings)
            .set({ value: JSON.stringify(current + sum), updatedAt: new Date() })
            .where(eq(systemSettings.key, "clearedExceptionsCost"));
        } else {
          await tx.insert(systemSettings).values({ key: "clearedExceptionsCost", value: JSON.stringify(sum) });
        }
      }

      return { count: deleted.length };
    });
  }

  async getTeacherProfile(userId: string): Promise<TeacherProfile | undefined> {
    const [profile] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.userId, userId));
    return profile;
  }

  async upsertTeacherProfile(data: InsertTeacherProfile): Promise<TeacherProfile> {
    const [profile] = await db
      .insert(teacherProfiles)
      .values(data)
      .onConflictDoUpdate({
        target: teacherProfiles.userId,
        set: {
          coachingName: data.coachingName,
          teacherName: data.teacherName,
          contactInfo: data.contactInfo,
          logoUrl: data.logoUrl,
          headerFormat: data.headerFormat,
          watermarkText: data.watermarkText,
          accentColor: data.accentColor,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  }

  async createTestPaper(data: InsertTestPaper): Promise<TestPaper> {
    const [paper] = await db.insert(testPapers).values(data).returning();
    return paper;
  }

  async getTestPaper(id: number, userId?: string): Promise<TestPaper | undefined> {
    const conditions = [eq(testPapers.id, id)];
    if (userId) conditions.push(eq(testPapers.userId, userId));
    const [paper] = await db.select().from(testPapers).where(and(...conditions));
    return paper;
  }

  async getTestPapersByUser(userId: string): Promise<TestPaper[]> {
    return db.select().from(testPapers).where(eq(testPapers.userId, userId)).orderBy(desc(testPapers.createdAt));
  }

  async deleteTestPaper(id: number, userId: string): Promise<void> {
    await db.delete(testPapers).where(and(eq(testPapers.id, id), eq(testPapers.userId, userId)));
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  }

  async updateUserTheme(userId: string, theme: string, colorPreset: string): Promise<void> {
    await db.update(users).set({ theme, colorPreset }).where(eq(users.id, userId));
  }

  async updateUserCurrency(userId: string, currency: string): Promise<void> {
    await db.update(users).set({ currency }).where(eq(users.id, userId));
  }

  async updateUserProfile(userId: string, data: { firstName?: string, lastName?: string, email?: string, phone?: string, profileImageUrl?: string }): Promise<void> {
    await db.update(users).set(data).where(eq(users.id, userId));
  }

  async incrementUserCost(userId: string, additionalCost: number): Promise<void> {
    await db.update(users)
      .set({ totalAiCost: sql`${users.totalAiCost} + ${additionalCost}` })
      .where(eq(users.id, userId));
  }

  async incrementSavedCost(userId: string, additionalCost: number): Promise<void> {
    await db.update(users)
      .set({ savedAiCost: sql`${users.savedAiCost} + ${additionalCost}` })
      .where(eq(users.id, userId));
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getFirstAdminUser(): Promise<User | undefined> {
    const [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    return adminUser;
  }

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result?.count ?? 0;
  }

  async getAllQuestions(): Promise<Question[]> {
    const results = await db.select({
      id: questions.id, userId: questions.userId, subject: questions.subject,
      chapter: questions.chapter, topic: questions.topic, latexContent: questions.latexContent,
      optionsLatex: questions.optionsLatex, answerLatex: questions.answerLatex,
      isSystemGeneratedAnswer: questions.isSystemGeneratedAnswer, diagramLatex: questions.diagramLatex,
      diagramType: questions.diagramType,
      isDiagramHidden: questions.isDiagramHidden,
      diagramBounds: questions.diagramBounds,
      questionBounds: questions.questionBounds,
      hasDiagram: questions.hasDiagram, latexGenerabilityScore: questions.latexGenerabilityScore,
      difficulty: questions.difficulty, marks: questions.marks,
      promptTokens: questions.promptTokens, completionTokens: questions.completionTokens,
      totalTokens: questions.totalTokens, aiCost: questions.aiCost, submittedBy: questions.submittedBy,
      createdAt: questions.createdAt,
      imageUrl: questions.imageUrl,
    }).from(questions).orderBy(desc(questions.createdAt));

    return results.map(q => ({
      ...q,
      imageUrl: q.imageUrl ? (q.imageUrl.startsWith("http") || q.imageUrl.startsWith("data:") ? q.imageUrl : `${SUPABASE_URL}/storage/v1/object/authenticated/paprrr-images/${q.imageUrl}`) : null
    })) as unknown as Question[];
  }


  async getAiPricingChart(): Promise<any> {
    const results = await db.select().from(aiPricing);
    const chart: any = {};
    for (const row of results) {
      try {
        chart[row.model] = { tiers: JSON.parse(row.tiers) };
      } catch(e) {}
    }
    return chart;
  }

  async upsertAiPricing(model: string, tiers: any): Promise<void> {
    const tiersJson = JSON.stringify(tiers);
    const existing = await db.select().from(aiPricing).where(eq(aiPricing.model, model));
    if (existing.length > 0) {
      await db.update(aiPricing).set({ tiers: tiersJson, updatedAt: new Date() }).where(eq(aiPricing.model, model));
    } else {
      await db.insert(aiPricing).values({ model, tiers: tiersJson });
    }
  }

  async getSystemSettings(): Promise<Record<string, any>> {
    const results = await db.select().from(systemSettings);
    const settings: Record<string, any> = {};
    for (const row of results) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch(e) {}
    }
    return settings;
  }

  async upsertSystemSettings(key: string, value: any): Promise<void> {
    const valueJson = JSON.stringify(value);
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (existing.length > 0) {
      await db.update(systemSettings).set({ value: valueJson, updatedAt: new Date() }).where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value: valueJson });
    }
  }

  async getAllTestPapers(): Promise<TestPaper[]> {
    return db.select().from(testPapers).orderBy(desc(testPapers.createdAt));
  }
}

export const storage = new DatabaseStorage();
