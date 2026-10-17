import { db } from "./db";
import { jobs } from "@shared/schema";
import { eq, desc, and, lt } from "drizzle-orm";

export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type JobType = "bulk_extract" | "regenerate_figure" | "generate_answer" | "bulk_save" | "score_exception" | "score_master_question";

export interface Job {
    id: string;
    userId: string;
    type: JobType;
    status: JobStatus;
    progress: number;
    total: number;
    data?: any;
    result?: any;
    error?: string;
    createdAt: number;
    updatedAt: number;
}

export async function createJob(userId: string, type: JobType, total: number, data?: any): Promise<Job> {
    const id = Math.random().toString(36).substring(2, 15);
    const jobData = {
        id,
        userId,
        type,
        status: "pending",
        progress: 0,
        total,
        data: data ? JSON.stringify(data) : null,
    };
    const [inserted] = await db.insert(jobs).values(jobData).returning();

    return {
        ...inserted,
        progress: inserted.progress || 0,
        total: inserted.total || 1,
        type: inserted.type as JobType,
        status: inserted.status as JobStatus,
        data: inserted.data ? JSON.parse(inserted.data) : undefined,
        result: inserted.result ? JSON.parse(inserted.result) : undefined,
        error: inserted.error || undefined,
        createdAt: inserted.createdAt?.getTime() || Date.now(),
        updatedAt: inserted.updatedAt?.getTime() || Date.now()
    };
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<void> {
    const dbUpdates: any = { updatedAt: new Date() };
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
    if (updates.total !== undefined) dbUpdates.total = updates.total;
    if (updates.data) dbUpdates.data = JSON.stringify(updates.data);
    if (updates.result) dbUpdates.result = JSON.stringify(updates.result);
    if (updates.error) dbUpdates.error = updates.error;

    await db.update(jobs).set(dbUpdates).where(eq(jobs.id, id));
}

export async function getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return undefined;

    return {
        id: job.id,
        userId: job.userId,
        type: job.type as JobType,
        status: job.status as JobStatus,
        progress: job.progress || 0,
        total: job.total || 1,
        data: job.data ? JSON.parse(job.data) : undefined,
        result: job.result ? JSON.parse(job.result) : undefined,
        error: job.error || undefined,
        createdAt: job.createdAt?.getTime() || Date.now(),
        updatedAt: job.updatedAt?.getTime() || Date.now()
    };
}

export async function getUserJobs(userId: string): Promise<Job[]> {
    // Auto-fail any "processing" jobs older than 15 minutes to prevent infinite polling
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
    await db.update(jobs)
      .set({ status: 'failed', error: 'Job timed out or server restarted' })
      .where(and(eq(jobs.userId, userId), eq(jobs.status, 'processing'), lt(jobs.createdAt, fifteenMinsAgo)));

    const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt));
    return userJobs.map(job => {
        let result = job.result ? JSON.parse(job.result) : undefined;
        let data = job.data ? JSON.parse(job.data) : undefined;
        
        // Don't send huge base64 arrays in the jobs listing
        if (job.type === 'bulk_extract' && result && result.questions) {
            result = { ...result, questions: [] };
        }

        return {
            id: job.id,
            userId: job.userId,
            type: job.type as JobType,
            status: job.status as JobStatus,
            progress: job.progress || 0,
            total: job.total || 1,
            data,
            result,
            error: job.error || undefined,
            createdAt: job.createdAt?.getTime() || Date.now(),
            updatedAt: job.updatedAt?.getTime() || Date.now()
        };
    });
}

export async function deleteJob(id: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
}

export async function deleteCompletedJobs(userId: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.status, "completed"));
}
