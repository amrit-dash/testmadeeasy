import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth, userQueryKey } from "@/lib/queryClient";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

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

const NOTIFIED_JOBS_KEY = "notifiedJobs";

export function getNotifiedJobs(): Set<string> {
  try {
    const stored = localStorage.getItem(NOTIFIED_JOBS_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch (e) {
    console.error("Failed to parse notifiedJobs from localStorage", e);
  }
  return new Set<string>();
}

export function addNotifiedJob(id: string) {
  const set = getNotifiedJobs();
  set.add(id);
  localStorage.setItem(NOTIFIED_JOBS_KEY, JSON.stringify(Array.from(set)));
}

function shouldNotifyCompletedJob(job: Job): boolean {
  if (job.type === "bulk_save") return true;
  if (job.type === "bulk_extract") return true;
  if (job.type === "regenerate_figure") return !!job.result?.diagramLatex;
  if (job.type === "generate_answer") return !!job.result?.answerLatex;
  return false;
}

function isNonCriticalBackgroundJob(job: Job): boolean {
  return job.type === "score_exception" || job.type === "score_master_question";
}

function shouldNotifyFailedJob(job: Job): boolean {
  return !isNonCriticalBackgroundJob(job);
}

function getCompletedJobToastTitle(job: Job): string {
  switch (job.type) {
    case "bulk_extract":
      return "Extraction Complete";
    case "generate_answer":
      return "Answer Generated";
    case "regenerate_figure":
      return "Figure Regenerated";
    default:
      return "Task Complete";
  }
}

function getReviewUploadUrl(job: Job): string {
  if (job.type === "bulk_extract") {
    return `/upload?jobId=${job.id}`;
  }

  if ((job.type === "regenerate_figure" || job.type === "generate_answer") && job.data?.source === "upload") {
    const extractJobId = job.data?.extractJobId;
    if (extractJobId) {
      return `/upload?jobId=${extractJobId}&applyJobId=${job.id}`;
    }
    return `/upload?applyJobId=${job.id}`;
  }

  return `/upload?jobId=${job.id}`;
}

export function useJobs() {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const jobsQueryKey = userQueryKey(user?.id, "/api/jobs");

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: jobsQueryKey,
    enabled: !!user?.id && authReady,
    queryFn: async () => {
      const res = await fetchWithAuth("/api/jobs");
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const hasActiveJobs = data.some(j => j.status === "pending" || j.status === "processing");
      return hasActiveJobs ? 5000 : false;
    },
  });

  useEffect(() => {
    const notifiedJobs = getNotifiedJobs();
    jobs.forEach(job => {
      if (job.status === "completed" && !notifiedJobs.has(job.id)) {
        if (!shouldNotifyCompletedJob(job)) {
          addNotifiedJob(job.id);
          if (isNonCriticalBackgroundJob(job) || job.type === "regenerate_figure" || job.type === "generate_answer") {
            fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(console.error);
          }
          return;
        }

        addNotifiedJob(job.id);

        if (job.result?.source === "library") {
          queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
        }

        if (job.type === "bulk_save") {
          queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
          toast({
            title: job.result?.failed && job.result.failed > 0 ? `${job.result.saved} saved, ${job.result.failed} failed` : "Questions Saved",
            description: "Questions have been added to your library.",
            duration: 10000,
          });
          const extractJobId = job.data?.extractJobId;
          if (extractJobId && job.result?.failed === 0) {
            localStorage.removeItem(`extract_job_${extractJobId}`);
          }
          fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(console.error);
        } else {
          toast({
            title: getCompletedJobToastTitle(job),
            description: "Click to review the results.",
            action: (
              <button
                onClick={async () => {
                  if (job.result?.source === "library" && job.result?.questionId) {
                    navigate(`/library?expand=${job.result.questionId}`);
                    window.dispatchEvent(new CustomEvent("expand-question", { detail: job.result.questionId }));
                    await fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" });
                  } else {
                    const url = getReviewUploadUrl(job);
                    navigate(url);
                    const loadId = job.type === "bulk_extract"
                      ? job.id
                      : (job.data?.extractJobId || job.id);
                    window.dispatchEvent(new CustomEvent("load-job", { detail: loadId }));
                  }
                }}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Review
              </button>
            ),
            duration: 10000,
          });
        }
      } else if (job.status === "failed" && !notifiedJobs.has(job.id)) {
        addNotifiedJob(job.id);
        if (!shouldNotifyFailedJob(job)) {
          fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(console.error);
          return;
        }
        toast({
          title: "Background Task Failed",
          description: job.error || "An error occurred during processing.",
          variant: "destructive",
        });
      }
    });
  }, [jobs, toast, navigate, user?.id, queryClient]);

  return { jobs };
}
