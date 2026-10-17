import type { Express, RequestHandler } from "express";
import { noStoreMiddleware } from "./cache";
import { db } from "./db";
import { users } from "@shared/models/auth";
import {
  questions, testPapers, jobs, teacherProfiles,
  masterQuestionExceptions, masterQuestions,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://your-supabase-url.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "your-supabase-anon-key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) return null;
  return phone.replace(/\s+/g, "");
}

async function reconcileUserIdInDb(oldId: string, newId: string): Promise<void> {
  if (oldId === newId) return;

  const [existingNew] = await db.select().from(users).where(eq(users.id, newId));

  await db.transaction(async (tx) => {
    await tx.update(questions).set({ userId: newId }).where(eq(questions.userId, oldId));
    await tx.update(questions).set({ submittedBy: newId }).where(eq(questions.submittedBy, oldId));
    await tx.update(testPapers).set({ userId: newId }).where(eq(testPapers.userId, oldId));
    await tx.update(jobs).set({ userId: newId }).where(eq(jobs.userId, oldId));
    await tx.update(teacherProfiles).set({ userId: newId }).where(eq(teacherProfiles.userId, oldId));
    await tx.update(masterQuestionExceptions).set({ userId: newId }).where(eq(masterQuestionExceptions.userId, oldId));
    await tx.update(masterQuestions).set({ addedBy: newId }).where(eq(masterQuestions.addedBy, oldId));
    await tx.update(masterQuestions).set({ submittedBy: newId }).where(eq(masterQuestions.submittedBy, oldId));

    if (existingNew) {
      const [oldUser] = await tx.select().from(users).where(eq(users.id, oldId));
      if (oldUser) {
        const updates: Record<string, string | null> = {};
        if (!existingNew.firstName && oldUser.firstName) updates.firstName = oldUser.firstName;
        if (!existingNew.lastName && oldUser.lastName) updates.lastName = oldUser.lastName;
        if (!existingNew.profileImageUrl && oldUser.profileImageUrl) updates.profileImageUrl = oldUser.profileImageUrl;
        if (!existingNew.phone && oldUser.phone) updates.phone = oldUser.phone;
        if (!existingNew.email && oldUser.email) updates.email = oldUser.email;
        if (Object.keys(updates).length > 0) {
          await tx.update(users).set(updates).where(eq(users.id, newId));
        }
      }
      await tx.delete(users).where(eq(users.id, oldId));
    } else {
      await tx.update(users).set({ id: newId }).where(eq(users.id, oldId));
    }
  });

  clearAuthCache(oldId);
  clearAuthCache(newId);
}

async function reconcileUserId(oldId: string, newId: string): Promise<void> {
  try {
    await db.execute(sql`SELECT public.sync_user_id_to_auth(${oldId}, ${newId})`);
    clearAuthCache(oldId);
    clearAuthCache(newId);
  } catch (err: unknown) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("sync_user_id_to_auth") || msg.includes("does not exist")) {
      console.warn("sync_user_id_to_auth unavailable, using inline reconciliation");
      await reconcileUserIdInDb(oldId, newId);
    } else {
      throw err;
    }
  }
}

export function setupAuth(_app: Express) {
  // Passport and Session setup removed for stateless JWT architecture
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, noStoreMiddleware(), async (req: any, res) => {
    res.json(req.user);
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      googleEnabled: true,
      phoneEnabled: true,
      supabaseEnabled: true
    });
  });
}

const authCache = new Map<string, { user: any, expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authCache.entries()) {
    if (value.expiresAt < now) {
      authCache.delete(key);
    }
  }
}, 60 * 1000);

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Missing auth header for", req.path, authHeader);
    return res.status(401).json({ message: "Unauthorized - Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }

  const { data: { user: sbUser }, error } = await supabase.auth.getUser(token);

  if (error || !sbUser) {
    console.error("Supabase Auth Error:", error?.message);
    return res.status(401).json({ message: "Unauthorized - Invalid token" });
  }

  try {
    let [localUser] = await db.select().from(users).where(eq(users.id, sbUser.id));

    if (!localUser && sbUser.email) {
      [localUser] = await db.select().from(users).where(eq(users.email, sbUser.email));
    }

    const normalizedPhone = normalizePhone(sbUser.phone);
    if (!localUser && normalizedPhone) {
      [localUser] = await db.select().from(users).where(
        sql`regexp_replace(${users.phone}, '\\s', '', 'g') = ${normalizedPhone}`
      );
    }

    if (localUser && localUser.id !== sbUser.id) {
      await reconcileUserId(localUser.id, sbUser.id);
      [localUser] = await db.select().from(users).where(eq(users.id, sbUser.id));
    }

    if (!localUser) {
      const insertData: any = { id: sbUser.id };
      if (sbUser.email) insertData.email = sbUser.email;
      if (normalizedPhone) insertData.phone = normalizedPhone;

      const meta = sbUser.user_metadata || {};
      if (meta.full_name) {
        const names = meta.full_name.split(' ');
        insertData.firstName = names[0] || null;
        insertData.lastName = names.slice(1).join(' ') || null;
      }
      if (meta.avatar_url) insertData.profileImageUrl = meta.avatar_url;

      [localUser] = await db.insert(users).values(insertData).returning();
    } else {
      const meta = sbUser.user_metadata || {};
      const updates: any = {};
      let needsUpdate = false;

      if (!localUser.firstName && meta.full_name) {
        const names = meta.full_name.split(' ');
        updates.firstName = names[0] || null;
        updates.lastName = names.slice(1).join(' ') || null;
        needsUpdate = true;
      }

      if (!localUser.profileImageUrl && meta.avatar_url) {
        updates.profileImageUrl = meta.avatar_url;
        needsUpdate = true;
      }

      if (needsUpdate) {
        [localUser] = await db.update(users).set(updates).where(eq(users.id, localUser.id)).returning();
      }
    }

    authCache.set(token, {
      user: localUser,
      expiresAt: Date.now() + CACHE_TTL
    });

    req.user = localUser;
    next();
  } catch (err) {
    console.error("Error syncing user profile:", err);
    return res.status(500).json({ error: "Failed to sync user profile" });
  }
};

export const clearAuthCache = (userId: string) => {
  for (const [key, value] of authCache.entries()) {
    if (value.user && value.user.id === userId) {
      authCache.delete(key);
    }
  }
};
