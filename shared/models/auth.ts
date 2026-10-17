import { sql } from "drizzle-orm";
import { pgTable, timestamp, varchar, real } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  phone: varchar("phone").unique(),
  role: varchar("role", { length: 20 }).default("teacher"),
  theme: varchar("theme", { length: 20 }).default("light"),
  colorPreset: varchar("color_preset", { length: 50 }).default("default"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  totalAiCost: real("total_ai_cost").default(0),
  savedAiCost: real("saved_ai_cost").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
