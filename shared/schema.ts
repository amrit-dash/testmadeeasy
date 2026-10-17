import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  masterQuestionId: integer("master_question_id"),
  subject: varchar("subject", { length: 100 }).notNull(),
  chapter: varchar("chapter", { length: 200 }),
  topic: varchar("topic", { length: 200 }).notNull(),
  latexContent: text("latex_content").notNull(),
  optionsLatex: text("options_latex"),
  answerLatex: text("answer_latex"),
  isSystemGeneratedAnswer: boolean("is_system_generated_answer").default(false),
  isAnswerExtractedFromImage: boolean("is_answer_extracted_from_image").default(false),
  isAnswerEditedByUser: boolean("is_answer_edited_by_user").default(false),
  diagramLatex: text("diagram_latex"),
  imageUrl: text("image_url"),
  diagramType: varchar("diagram_type", { length: 20 }).default("latex"),
  isDiagramHidden: boolean("is_diagram_hidden").default(false),
  diagramBounds: text("diagram_bounds"), // stored as JSON string to support various dbs
  questionBounds: text("question_bounds"),
  hasDiagram: boolean("has_diagram").default(false),
  latexGenerabilityScore: integer("latex_generability_score").default(0),
  difficulty: varchar("difficulty", { length: 20 }).default("medium"),
  marks: integer("marks").default(4),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  aiCost: real("ai_cost").default(0),
  submittedBy: varchar("submitted_by", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("questions_user_id_idx").on(table.userId),
  masterQuestionIdIdx: index("questions_master_question_id_idx").on(table.masterQuestionId),
}));

export const masterQuestions = pgTable("master_questions", {
  id: serial("id").primaryKey(),
  subject: varchar("subject", { length: 100 }).notNull(),
  chapter: varchar("chapter", { length: 200 }),
  topic: varchar("topic", { length: 200 }).notNull(),
  latexContent: text("latex_content").notNull(),
  optionsLatex: text("options_latex"),
  answerLatex: text("answer_latex"),
  isSystemGeneratedAnswer: boolean("is_system_generated_answer").default(false),
  isAnswerExtractedFromImage: boolean("is_answer_extracted_from_image").default(false),
  isAnswerEditedByUser: boolean("is_answer_edited_by_user").default(false),
  diagramLatex: text("diagram_latex"),
  imageUrl: text("image_url"),
  diagramType: varchar("diagram_type", { length: 20 }).default("latex"),
  isDiagramHidden: boolean("is_diagram_hidden").default(false),
  diagramBounds: text("diagram_bounds"),
  questionBounds: text("question_bounds"),
  hasDiagram: boolean("has_diagram").default(false),
  latexGenerabilityScore: integer("latex_generability_score").default(0),
  difficulty: varchar("difficulty", { length: 20 }).default("medium"),
  marks: integer("marks").default(4),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  aiScore: integer("ai_score"),
  aiCost: real("ai_cost").default(0),
  submittedBy: varchar("submitted_by", { length: 200 }),
  source: varchar("source", { length: 200 }),
  addedBy: varchar("added_by"),
  board: varchar("board", { length: 100 }),
  className: varchar("class_name", { length: 50 }),
  exam: varchar("exam", { length: 100 }),
  year: varchar("year", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  subjectIdx: index("master_questions_subject_idx").on(table.subject),
  topicIdx: index("master_questions_topic_idx").on(table.topic),
  createdAtIdx: index("master_questions_created_at_idx").on(table.createdAt),
  imageUrlIdx: index("master_questions_image_url_idx").on(table.imageUrl),
  latexContentIdx: index("master_questions_latex_content_idx").on(table.latexContent),
}));

export const teacherProfiles = pgTable("teacher_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  coachingName: varchar("coaching_name", { length: 200 }),
  teacherName: varchar("teacher_name", { length: 200 }),
  contactInfo: varchar("contact_info", { length: 300 }),
  logoUrl: text("logo_url"),
  headerFormat: text("header_format").default('{"style":"classic"}'),
  watermarkText: varchar("watermark_text", { length: 200 }),
  accentColor: varchar("accent_color", { length: 50 }).default("#000000"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const testPapers = pgTable("test_papers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  questionIds: integer("question_ids").array().notNull(),
  totalMarks: integer("total_marks").default(0),
  negativeMarking: boolean("negative_marking").default(false),
  negativeMarkingType: varchar("negative_marking_type", { length: 50 }),
  negativeMarkingQuestionIds: integer("negative_marking_question_ids").array().default([]).notNull(),
  includeOptions: boolean("include_options").default(true),
  optionsQuestionIds: integer("options_question_ids").array().default([]).notNull(),
  duration: integer("duration").default(60),
  testDate: varchar("test_date", { length: 20 }),
  instructions: text("instructions"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("test_papers_user_id_idx").on(table.userId),
}));

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  progress: integer("progress").default(0),
  total: integer("total").default(1),
  data: text("data"),
  result: text("result"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lockedAt: timestamp("locked_at"),
}, (table) => ({
  userIdIdx: index("jobs_user_id_idx").on(table.userId),
  typeIdx: index("jobs_type_idx").on(table.type),
  createdAtIdx: index("jobs_created_at_idx").on(table.createdAt),
}));

export const masterQuestionExceptions = pgTable("master_question_exceptions", {
  id: serial("id").primaryKey(),
  masterQuestionId: integer("master_question_id").notNull(),
  userQuestionId: integer("user_question_id").notNull(),
  userId: varchar("user_id").notNull(),
  aiScore: integer("ai_score"),
  aiCost: real("ai_cost").default(0),
  status: varchar("status", { length: 20 }).default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  masterQuestionIdIdx: index("mqe_master_question_id_idx").on(table.masterQuestionId),
  userQuestionIdIdx: index("mqe_user_question_id_idx").on(table.userQuestionId),
  userIdIdx: index("mqe_user_id_idx").on(table.userId),
  statusIdx: index("mqe_status_idx").on(table.status),
}));

export const insertMasterQuestionExceptionSchema = createInsertSchema(masterQuestionExceptions).omit({
  id: true,
  createdAt: true,
});

export type MasterQuestionException = typeof masterQuestionExceptions.$inferSelect;
export type InsertMasterQuestionException = z.infer<typeof insertMasterQuestionExceptionSchema>;

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
  createdAt: true,
});

export const insertMasterQuestionSchema = createInsertSchema(masterQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertTeacherProfileSchema = createInsertSchema(teacherProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTestPaperSchema = createInsertSchema(testPapers).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  createdAt: true,
  updatedAt: true,
  lockedAt: true,
});

export type DbJob = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type MasterQuestion = typeof masterQuestions.$inferSelect;
export type InsertMasterQuestion = z.infer<typeof insertMasterQuestionSchema>;
export type TeacherProfile = typeof teacherProfiles.$inferSelect;
export type InsertTeacherProfile = z.infer<typeof insertTeacherProfileSchema>;
export type TestPaper = typeof testPapers.$inferSelect;
export type InsertTestPaper = z.infer<typeof insertTestPaperSchema>;

export const aiPricing = pgTable("ai_pricing", {
  id: serial("id").primaryKey(),
  model: varchar("model", { length: 100 }).notNull().unique(),
  tiers: text("tiers").notNull(), // stored as JSON string
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AiPricing = typeof aiPricing.$inferSelect;
export type InsertAiPricing = typeof aiPricing.$inferInsert;

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(), // stored as JSON string
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = typeof systemSettings.$inferInsert;
