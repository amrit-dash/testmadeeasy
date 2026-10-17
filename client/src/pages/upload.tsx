import { fetchWithAuth, apiRequest, userQueryKey } from "@/lib/queryClient";
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, ImagePlus, Loader2, Check, Sparkles, ArrowLeft, AlertTriangle, Copy, X, Plus, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Save, Crop, ImageIcon, RefreshCw, Maximize, Code2, CropIcon, ZoomIn, ZoomOut, Edit2, Info, Bot, BotIcon, UserPen, WandSparklesIcon, UserPenIcon, BrainCircuitIcon, ListRestartIcon, GitPullRequestClosedIcon, Trash2Icon, SearchCheckIcon, CheckCheckIcon, Undo2Icon, Database, Lightbulb } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useLocation } from "wouter";
import LatexRenderer from "@/components/latex-renderer";
import CropModal from "@/components/crop-modal";
import { ExpandedImageDialog } from "@/components/expanded-image-dialog";
import { AuthImage } from "@/components/auth-image";
import { ImageFromCoordinates } from "@/components/image-from-coordinates";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useJobs, addNotifiedJob, getNotifiedJobs } from "@/hooks/use-jobs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { formatCurrency, getOptionLabel, stripOptionLabel, parseOptions } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";


type DuplicateMatch = {
  id: number;
  latexContent: string;
  optionsLatex?: string | null;
  answerLatex?: string | null;
  subject: string;
  chapter: string | null;
  topic: string;
  similarity: number;
  source: string;
};

type ExtractedQuestion = {
  isDiagramHidden?: boolean;
  latexContent: string;
  optionsLatex?: string | null;
  answerLatex?: string | null;
  isSystemGeneratedAnswer?: boolean;
  isAnswerExtractedFromImage?: boolean;
  isAnswerEditedByUser?: boolean;
  subject: string;
  chapter: string;
  topic: string;
  hasDiagram: boolean;
  latexGenerabilityScore?: number;
  difficulty: string;
  marks: number;
  imageUrl: string;
  diagramLatex: string | null;
  diagramType?: "latex" | "image";
  diagramBounds?: { x: number; y: number; width: number; height: number } | null;
  questionBounds?: { x: number; y: number; width: number; height: number } | null;
  duplicateMatch: DuplicateMatch | null;
  masterQuestionId?: number | null;
  originalExtractedData?: Partial<ExtractedQuestion>;
  isRevertedToExtracted?: boolean;
  isPreviewingDuplicate?: boolean;
  originalDataBeforePreview?: Partial<ExtractedQuestion>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  aiCost?: number;
  fileName: string;
  status: "success" | "failed";
  error?: string;
  selected: boolean;
  edited: boolean;
  originalIndex?: number;
};


const downscaleImage = (file: File, maxWidth: number = 1920): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file); // Don't downscale non-images
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth * height) / width;
          width = maxWidth;
        } else {
          resolve(file);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type || "image/jpeg" }));
          } else {
            resolve(file);
          }
        }, file.type || "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

export default function UploadPage() {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const jobsQueryKey = userQueryKey(user?.id, "/api/jobs");
  const [, navigate] = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(-1);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropMode, setCropMode] = useState<"edit" | "regenerate" | "edit_question" | "view_question">("regenerate");
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null);
  const [isStartingSave, setIsStartingSave] = useState(false);
  const isMobile = useIsMobile();

  const { jobs } = useJobs();
  const activeJobs = jobs.filter(j => j.type === "bulk_extract" && (j.status === "pending" || j.status === "processing"));
  const completedJobs = jobs.filter(j => j.type === "bulk_extract" && j.status === "completed" && (j.data?.successCount === undefined || j.data.successCount > 0));
  const failedJobs = jobs.filter(j => j.type === "bulk_extract" && (j.status === "failed" || (j.status === "completed" && j.data?.successCount === 0)));

  // Auto-apply background generation jobs (regenerate_figure and generate_answer) so UI updates instantly
  useEffect(() => {
    if (extractedQuestions.length === 0) return;

    const notifiedJobs = getNotifiedJobs();

    const completedRegenJob = jobs.find(j =>
      j.type === "regenerate_figure" &&
      j.status === "completed" &&
      j.data?.source === "upload" &&
      !notifiedJobs.has(j.id) &&
      !!j.result?.diagramLatex
    );
    if (completedRegenJob && typeof completedRegenJob.result?.index === "number") {
      const index = completedRegenJob.result.index;
      addNotifiedJob(completedRegenJob.id);
      setExtractedQuestions(prev => {
        const newQuestions = [...prev];
        if (newQuestions[index]) {
          newQuestions[index] = {
            ...newQuestions[index],
            diagramLatex: completedRegenJob.result.diagramLatex,
            diagramType: "latex",
            promptTokens: (newQuestions[index].promptTokens || 0) + completedRegenJob.result.promptTokens,
            completionTokens: (newQuestions[index].completionTokens || 0) + completedRegenJob.result.completionTokens,
            totalTokens: (newQuestions[index].totalTokens || 0) + completedRegenJob.result.totalTokens,
            aiCost: (newQuestions[index].aiCost || 0) + completedRegenJob.result.aiCost,
            edited: true
          };
        }
        return newQuestions;
      });
      toast({ title: "Figure updated", description: `LaTeX diagram for Q${index + 1} has been updated.` });
      fetchWithAuth(`/api/jobs/${completedRegenJob.id}`, { method: "DELETE" }).then(() => {
        queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      }).catch(console.error);
    }

    const completedAnswerJob = jobs.find(j =>
      j.type === "generate_answer" &&
      j.status === "completed" &&
      j.data?.source === "upload" &&
      !notifiedJobs.has(j.id) &&
      !!j.result?.answerLatex
    );
    if (completedAnswerJob && typeof completedAnswerJob.result?.index === "number") {
      const index = completedAnswerJob.result.index;
      addNotifiedJob(completedAnswerJob.id);
      setExtractedQuestions(prev => {
        const newQuestions = [...prev];
        if (newQuestions[index]) {
          newQuestions[index] = {
            ...newQuestions[index],
            answerLatex: completedAnswerJob.result.answerLatex,
            isSystemGeneratedAnswer: true,
            isAnswerEditedByUser: false,
            isAnswerExtractedFromImage: false,
            promptTokens: (newQuestions[index].promptTokens || 0) + completedAnswerJob.result.promptTokens,
            completionTokens: (newQuestions[index].completionTokens || 0) + completedAnswerJob.result.completionTokens,
            totalTokens: (newQuestions[index].totalTokens || 0) + completedAnswerJob.result.totalTokens,
            aiCost: (newQuestions[index].aiCost || 0) + completedAnswerJob.result.aiCost,
            edited: true
          };
        }
        return newQuestions;
      });
      toast({ title: "Answer generated", description: `AI generated answer for Q${index + 1} has been updated.` });
      fetchWithAuth(`/api/jobs/${completedAnswerJob.id}`, { method: "DELETE" }).then(() => {
        queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      }).catch(console.error);
    }

    // Handle completed save job for current extraction session
    const completedSaveJob = jobs.find(j => j.type === "bulk_save" && j.status === "completed" && j.data?.extractJobId === currentJobId);
    if (completedSaveJob) {
      const data = completedSaveJob.result;

      // Cleanup happens primarily on the backend and in useJobs now
      // Here we just ensure the UI updates if the user stays on the page
      if (data && data.failed > 0) {
        const savedOriginalIndices = data.results
          .filter((r: any) => r.status === "saved")
          .map((r: any) => r.originalIndex);

        setExtractedQuestions(prev => {
          const newQuestions = prev.filter((_, i) => !savedOriginalIndices.includes(i));
          return newQuestions;
        });
        setActiveIndex(0);
      } else if (data && data.failed === 0) {
        setExtractedQuestions([]);
        setCurrentJobId(null);
        setPreviewUrls(prev => { prev.forEach(url => URL.revokeObjectURL(url)); return []; });
        setSelectedFiles([]);
        setActiveIndex(0);
        setEditMode(false);
      }
    }
  }, [jobs, extractedQuestions.length, queryClient, toast, currentJobId]);

  const applyUploadJobResult = (job: any, questions: ExtractedQuestion[]): ExtractedQuestion[] => {
    if (job.type === "regenerate_figure" && typeof job.result?.index === "number" && job.result?.diagramLatex) {
      const index = job.result.index;
      const newQuestions = [...questions];
      if (newQuestions[index]) {
        newQuestions[index] = {
          ...newQuestions[index],
          diagramLatex: job.result.diagramLatex,
          diagramType: "latex",
          promptTokens: (newQuestions[index].promptTokens || 0) + (job.result.promptTokens || 0),
          completionTokens: (newQuestions[index].completionTokens || 0) + (job.result.completionTokens || 0),
          totalTokens: (newQuestions[index].totalTokens || 0) + (job.result.totalTokens || 0),
          aiCost: (newQuestions[index].aiCost || 0) + (job.result.aiCost || 0),
          edited: true,
        };
        setActiveIndex(index);
      }
      return newQuestions;
    }

    if (job.type === "generate_answer" && typeof job.result?.index === "number" && job.result?.answerLatex) {
      const index = job.result.index;
      const newQuestions = [...questions];
      if (newQuestions[index]) {
        newQuestions[index] = {
          ...newQuestions[index],
          answerLatex: job.result.answerLatex,
          isSystemGeneratedAnswer: true,
          isAnswerEditedByUser: false,
          isAnswerExtractedFromImage: false,
          promptTokens: (newQuestions[index].promptTokens || 0) + (job.result.promptTokens || 0),
          completionTokens: (newQuestions[index].completionTokens || 0) + (job.result.completionTokens || 0),
          totalTokens: (newQuestions[index].totalTokens || 0) + (job.result.totalTokens || 0),
          aiCost: (newQuestions[index].aiCost || 0) + (job.result.aiCost || 0),
          edited: true,
        };
        setActiveIndex(index);
      }
      return newQuestions;
    }

    return questions;
  };

  const handleReviewJob = async (jobId: string, applyJobId?: string | null) => {
    setReviewingJobId(jobId);
    try {
      const res = await fetchWithAuth(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error("Failed to load job results");
      const job = await res.json();

      if (job.status === "completed") {
        if (job.type === "bulk_extract" && job.result?.questions) {
          let questionsToUse = job.result.questions;
          let descriptionStr = "Restored your latest edits from the cloud";

          const savedLocalRaw = localStorage.getItem(`extract_job_${jobId}`);
          if (savedLocalRaw) {
            try {
              const savedLocal = JSON.parse(savedLocalRaw);
              const cloudLastEdited = job.result.lastEdited || 0;
              const localLastEdited = savedLocal.lastEdited || 0;

              if (localLastEdited > cloudLastEdited && savedLocal.questions) {
                questionsToUse = savedLocal.questions;
                descriptionStr = "Restored your most recent edits from this device";
              }
            } catch (e) {
              console.error("Failed to parse local job data", e);
            }
          }

          const questions: ExtractedQuestion[] = questionsToUse.map((q: any) => ({
            ...q,
            selected: q.selected !== undefined ? q.selected : q.status === "success",
            edited: q.edited !== undefined ? q.edited : false,
          }));

          setExtractedQuestions(questions);
          setCurrentJobId(jobId);
          setActiveIndex(0);
          const successCount = questions.filter((q: ExtractedQuestion) => q.status === "success").length;
          toast({
            title: `Loaded ${successCount} of ${questions.length} questions`,
            description: descriptionStr,
          });
        } else if (job.type === "regenerate_figure" || job.type === "generate_answer") {
          setExtractedQuestions(prev => applyUploadJobResult(job, prev));
          if (job.type === "regenerate_figure" && job.result?.diagramLatex) {
            toast({
              title: "Figure updated",
              description: `LaTeX diagram for Q${(job.result.index ?? 0) + 1} has been updated.`,
            });
          } else if (job.type === "generate_answer" && job.result?.answerLatex) {
            toast({
              title: "Answer generated",
              description: `AI generated answer for Q${(job.result.index ?? 0) + 1} has been updated.`,
            });
          }
        }

        if (applyJobId) {
          const applyRes = await fetchWithAuth(`/api/jobs/${applyJobId}`);
          if (applyRes.ok) {
            const applyJob = await applyRes.json();
            addNotifiedJob(applyJobId);
            setExtractedQuestions(prev => applyUploadJobResult(applyJob, prev));
            if (applyJob.type === "regenerate_figure" && applyJob.result?.diagramLatex) {
              toast({
                title: "Figure updated",
                description: `LaTeX diagram for Q${(applyJob.result.index ?? 0) + 1} has been updated.`,
              });
            } else if (applyJob.type === "generate_answer" && applyJob.result?.answerLatex) {
              toast({
                title: "Answer generated",
                description: `AI generated answer for Q${(applyJob.result.index ?? 0) + 1} has been updated.`,
              });
            }
            await fetchWithAuth(`/api/jobs/${applyJobId}`, { method: "DELETE" });
          }
        }

        if (job.type !== "bulk_extract") {
          await fetchWithAuth(`/api/jobs/${jobId}`, { method: "DELETE" });
        } else {
          setCurrentJobId(jobId);
        }
        queryClient.invalidateQueries({ queryKey: jobsQueryKey });

        navigate("/upload", { replace: true });
      }
    } catch (err) {
      console.error("Error loading job:", err);
      toast({ title: "Failed to load results", description: "The extraction job may have expired or failed.", variant: "destructive" });
    } finally {
      setReviewingJobId(null);
    }
  };

  // Save user modifications to localStorage and sync to DB cache
  useEffect(() => {
    if (currentJobId && extractedQuestions.length > 0) {


      const now = Date.now();
      localStorage.setItem(`extract_job_${currentJobId}`, JSON.stringify({ questions: extractedQuestions, lastEdited: now }));

      // Debounce DB sync to avoid spamming the server on rapid edits
      const timeoutId = setTimeout(() => {
        fetchWithAuth(`/api/jobs/${currentJobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: { questions: extractedQuestions, lastEdited: now } })
        }).catch(console.error);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [extractedQuestions, currentJobId]);

  // Parse jobId from URL query parameters if present
  useEffect(() => {
    if (!user || !authReady) return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("jobId");
    const applyJobId = params.get("applyJobId");

    if (jobId) {
      handleReviewJob(jobId, applyJobId);
    } else if (applyJobId) {
      (async () => {
        try {
          const res = await fetchWithAuth(`/api/jobs/${applyJobId}`);
          if (!res.ok) return;
          const applyJob = await res.json();
          const extractId = applyJob.data?.extractJobId;
          if (extractId) {
            handleReviewJob(extractId, applyJobId);
          }
        } catch (err) {
          console.error("Failed to load apply job:", err);
        }
      })();
    }

    const handleLoadJobEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const params = new URLSearchParams(window.location.search);
        handleReviewJob(customEvent.detail, params.get("applyJobId"));
      }
    };

    window.addEventListener("load-job", handleLoadJobEvent);
    return () => window.removeEventListener("load-job", handleLoadJobEvent);
  }, [navigate, user, authReady]);

  const regenerateMutation = useMutation({
    mutationFn: async ({ imageBase64, questionText }: { imageBase64: string, questionText: string }) => {
      const res = await fetchWithAuth("/api/questions/regenerate-figure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          questionText,
          source: "upload",
          index: activeIndex,
          extractJobId: currentJobId,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Regeneration failed");
      return res.json() as Promise<{ jobId: string, message: string }>;
    },
    onSuccess: (data) => {
      setIsCropModalOpen(false);
      queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      toast({ title: "Regeneration started", description: "You will be notified when the new figure is ready." });
    },
    onError: () => {
      toast({ title: "Failed to regenerate figure", description: "Please try again", variant: "destructive" });
    },
  });

  const generateAnswerMutation = useMutation({
    mutationFn: async (style: string) => {
      const q = extractedQuestions[activeIndex];
      const res = await fetchWithAuth("/api/generate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latexContent: q.latexContent,
          optionsLatex: q.optionsLatex,
          imageUrl: q.imageUrl,
          style,
          source: "upload",
          index: activeIndex,
          extractJobId: currentJobId,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Generation failed");
      return res.json() as Promise<{ jobId: string, message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      toast({ title: "Answer generation started", description: "You will be notified when the answer is ready." });
    },
    onError: () => {
      toast({ title: "Failed to generate answer", description: "Please try again", variant: "destructive" });
    },
  });

  const handleBatchGenerate = async (style: string) => {
    setIsBatchGenerating(true);
    let startedJobs = 0;

    try {
      const selectedQuestions = extractedQuestions.filter(q => q.selected && q.status === "success");

      for (const q of selectedQuestions) {
        // Find the index in the original array because that's what handleReviewJob and saveMutation expect
        const index = extractedQuestions.findIndex(eq => eq === q);
        if (index === -1) continue;

        const res = await fetchWithAuth("/api/generate-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latexContent: q.latexContent,
            optionsLatex: q.optionsLatex,
            imageUrl: q.imageUrl,
            style,
            source: "upload",
            index,
            extractJobId: currentJobId,
          }),
          credentials: "include",
        });

        if (res.ok) startedJobs++;
      }

      if (startedJobs > 0) {
        queryClient.invalidateQueries({ queryKey: jobsQueryKey });
        toast({
          title: "Batch generation started",
          description: `${startedJobs} answers are being generated in the background. You can save your questions or wait for them to finish.`
        });
      } else {
        toast({ title: "No jobs started", description: "Failed to start generation.", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Batch generation error", description: "An error occurred during batch generation.", variant: "destructive" });
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const extractMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      // Downscale images before uploading to save massive tokens
      const processedFiles = await Promise.all(files.map(f => downscaleImage(f, 1920)));
      processedFiles.forEach((file) => formData.append("images", file));
      const res = await fetchWithAuth("/api/questions/bulk-extract", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Extraction failed");
      return res.json() as Promise<{ jobId: string, message: string }>;
    },
    onSuccess: (data: any, variables) => {
      // Optimistically add the job to the UI
      queryClient.setQueryData(jobsQueryKey, (old: any) => {
        const newJob = {
          id: data.jobId,
          userId: "optimistic",
          type: "bulk_extract",
          status: "pending",
          progress: 0,
          total: variables.length,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return old ? [newJob, ...old] : [newJob];
      });
      queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      toast({
        title: "Extraction started",
        description: "Your images are being processed in the background. You will be notified when complete. You can safely leave this page.",
      });
      resetForm();
    },
    onError: () => {
      toast({ title: "Extraction failed", description: "Please try again with clearer images", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    onMutate: () => setIsStartingSave(true),
    mutationFn: async () => {
      const questionsToSave = extractedQuestions
        .map((q, index) => ({ ...q, originalIndex: q.originalIndex !== undefined ? q.originalIndex : index }))
        .filter(q => q.selected && q.status === "success")
        .map(q => ({
          subject: q.subject,
          chapter: q.chapter,
          topic: q.topic,
          latexContent: q.latexContent,
          optionsLatex: q.optionsLatex,
          answerLatex: q.answerLatex,
          isSystemGeneratedAnswer: q.isSystemGeneratedAnswer,
          isAnswerExtractedFromImage: q.isAnswerExtractedFromImage,
          isAnswerEditedByUser: q.isAnswerEditedByUser,
          imageUrl: q.imageUrl,
          diagramLatex: q.diagramLatex,
          diagramType: q.diagramType || (q.diagramLatex ? "latex" : "image"),
          isDiagramHidden: q.isDiagramHidden,
          hasDiagram: q.hasDiagram,
          diagramBounds: q.diagramBounds,
          questionBounds: q.questionBounds,
          latexGenerabilityScore: q.latexGenerabilityScore,
          difficulty: q.difficulty,
          marks: q.marks,
          promptTokens: q.promptTokens || 0,
          completionTokens: q.completionTokens || 0,
          totalTokens: q.totalTokens || 0,
          aiCost: q.aiCost || 0,
          masterQuestionId: q.masterQuestionId ?? (q.duplicateMatch?.source === "master" ? q.duplicateMatch.id : null),
          originalIndex: q.originalIndex,
        }));
      const res = await apiRequest("POST", "/api/questions/bulk-save", { questions: questionsToSave, extractJobId: currentJobId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
      toast({
        title: "Saving started",
        description: "Your selected questions are being saved in the background. You can leave this page or wait for completion.",
      });
    },
    onError: () => {
      setIsStartingSave(false);
      toast({ title: "Failed to save", description: "Please try again", variant: "destructive" });
    },
  });

  const handleRetryBatch = async () => {
    if (currentJobId) {
      localStorage.removeItem(`extract_job_${currentJobId}`);
      queryClient.setQueryData(jobsQueryKey, (old: any) => old?.filter((j: any) => j.id !== currentJobId));
      fetchWithAuth(`/api/jobs/${currentJobId}`, { method: "DELETE" }).catch(console.error);
    }

    if (selectedFiles.length > 0) {
      extractMutation.mutate(selectedFiles);
      return;
    }

    try {
      const files = await Promise.all(extractedQuestions.map(async (q, i) => {
        if (!q.imageUrl) throw new Error("Missing original image");
        const res = await fetch(q.imageUrl);
        const blob = await res.blob();
        return new File([blob], `retry-image-${i}.png`, { type: blob.type });
      }));
      extractMutation.mutate(files);
    } catch (err) {
      console.error(err);
      toast({ title: "Retry failed", description: "Could not fetch original images for retry", variant: "destructive" });
    }
  };

  const goBackToJobs = () => {
    setExtractedQuestions([]);
    setCurrentJobId(null);
    setReviewingJobId(null);
    setActiveIndex(0);
    setEditMode(false);
    navigate("/upload", { replace: true });
  };

  const resetForm = () => {
    if (currentJobId) {

      localStorage.removeItem(`extract_job_${currentJobId}`);
      queryClient.setQueryData(jobsQueryKey, (old: any) => old?.filter((j: any) => j.id !== currentJobId));
      fetchWithAuth(`/api/jobs/${currentJobId}`, { method: "DELETE" })
        .then(() => queryClient.invalidateQueries({ queryKey: jobsQueryKey }))
        .catch(console.error);
      setCurrentJobId(null);
    }
    setExtractedQuestions([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setSelectedFiles([]);
    setActiveIndex(0);
    setEditMode(false);
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter(f => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
      toast({ title: "Invalid files", description: "Please upload image files only", variant: "destructive" });
      return;
    }
    const total = selectedFiles.length + validFiles.length;
    if (total > 20) {
      toast({ title: "Too many images", description: "Maximum 20 images at a time", variant: "destructive" });
      return;
    }
    setSelectedFiles(prev => [...prev, ...validFiles]);
    setPreviewUrls(prev => [...prev, ...validFiles.map(f => URL.createObjectURL(f))]);
    setExtractedQuestions([]);
  }, [selectedFiles, toast]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.clipboardData && e.clipboardData.files.length > 0) {
        e.preventDefault();
        addFiles(e.clipboardData.files);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  const removeFile = useCallback((index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setExtractedQuestions([]);
  }, [previewUrls]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const updateQuestion = (index: number, updates: Partial<ExtractedQuestion>) => {
    setExtractedQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...updates, edited: true } : q));
  };

  const toggleSelect = (index: number) => {
    setExtractedQuestions(prev => prev.map((q, i) => i === index ? { ...q, selected: !q.selected } : q));
  };

  const activeQuestion = extractedQuestions[activeIndex];
  const selectedCount = extractedQuestions.filter(q => q.selected && q.status === "success").length;
  const successCount = extractedQuestions.filter(q => q.status === "success").length;
  const isRegenerating = jobs.some(j => j.type === "regenerate_figure" && (j.status === "pending" || j.status === "processing") && j.data?.index === activeIndex && j.data?.source === "upload");
  const isGeneratingAnswer = jobs.some(j => j.type === "generate_answer" && (j.status === "pending" || j.status === "processing") && j.data?.index === activeIndex && j.data?.source === "upload");
  const activeSaveJob = jobs.find(j => j.type === "bulk_save" && j.data?.extractJobId === currentJobId && (j.status === "pending" || j.status === "processing"));
  const isSaving = !!activeSaveJob;
  const savingProgressIndex = activeSaveJob ? activeSaveJob.progress : -1;
  const questionsToSaveList = extractedQuestions.filter(q => q.selected && q.status === "success");
  const currentlySavingQuestion = questionsToSaveList[savingProgressIndex];
  const savedQuestions = questionsToSaveList.slice(0, Math.max(0, savingProgressIndex));

  useEffect(() => {
    if (isSaving) {
      setIsStartingSave(false);
    }
  }, [isSaving]);

  useEffect(() => {
    if (extractedQuestions.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "ArrowLeft") {
        if (activeIndex > 0) {
          setActiveIndex(prev => prev - 1);
          setEditMode(false);
        }
      } else if (e.key === "ArrowRight") {
        if (activeIndex < extractedQuestions.length - 1) {
          setActiveIndex(prev => prev + 1);
          setEditMode(false);
        }
      } else if (e.key === "s" || e.key === "S" || e.key === " ") {
        e.preventDefault();
        toggleSelect(activeIndex);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [extractedQuestions.length, activeIndex]);

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="sticky top-0 z-30 flex-none bg-background/95 backdrop-blur pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => extractedQuestions.length > 0 ? goBackToJobs() : navigate("/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-upload-title">Add Questions</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">Take a photo of your questions and we'll read them for you</p>
          </div>
        </div>

        {extractedQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-500/20 text-sm gap-1.5 py-1" data-testid="badge-progress-extracted">
                  <ImagePlus className="w-3.5 h-3.5" />
                  {successCount} Extracted
                </Badge>
                <Badge className="bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-500/20 text-sm gap-1.5 py-1" data-testid="badge-progress-selected">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {selectedCount} Selected
                </Badge>
                {successCount > selectedCount && (
                  <Badge className="bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-500/20 text-sm gap-1.5 py-1">
                    <XCircle className="w-3.5 h-3.5" />
                    {successCount - selectedCount} Unsaved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={resetForm} data-testid="button-start-over">
                  <GitPullRequestClosedIcon className="w-4 h-4 mr-1 text-primary" />
                  Start Over
                </Button>
                {successCount === 0 && extractedQuestions.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryBatch}
                    disabled={extractMutation.isPending}
                  >
                    {extractMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin text-primary" />}
                    {!extractMutation.isPending && <ListRestartIcon className="w-4 h-4 mr-1 text-primary" />}
                    Retry Batch
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                      disabled={selectedCount === 0 || isBatchGenerating}
                    >
                      {isBatchGenerating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BrainCircuitIcon className="w-4 h-4 mr-1" />}
                      Generate {selectedCount > 0 ? selectedCount : 'X'} Answers
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleBatchGenerate("very_concise")} className="cursor-pointer">
                      Very Concise
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchGenerate("concise")} className="cursor-pointer">
                      Concise
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchGenerate("full")} className="cursor-pointer">
                      Full Solution
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  className="text-white bg-primary/80 dark:bg-primary hover:text-purple-900"
                  disabled={selectedCount === 0 || saveMutation.isPending || isStartingSave || isSaving}
                  onClick={() => saveMutation.mutate()}
                  data-testid="button-save-all"
                >
                  {saveMutation.isPending || isStartingSave || isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin text-purple-900" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1 text-purple-900" />
                      Save {selectedCount} Questions
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              ref={(el) => {
                if (el) {
                  el.onwheel = (e) => {
                    if (e.deltaY !== 0) {
                      e.preventDefault();
                      el.scrollLeft += e.deltaY;
                    }
                  };
                }
              }}
            >
              {extractedQuestions.map((q, index) => {
                const isThisSaved = activeSaveJob && savedQuestions.includes(q);
                const isThisSavingNow = activeSaveJob && currentlySavingQuestion === q;

                if (isThisSaved) return null;

                return (
                  <button
                    key={index}
                    onClick={() => { setActiveIndex(index); setEditMode(false); }}
                    className={`relative rounded-md overflow-hidden border-2 transition-all duration-500 ease-in-out ${isThisSaved
                      ? "w-0 h-16 opacity-0 border-0 p-0 m-0 !border-transparent scale-0"
                      : "flex-shrink-0 w-16 h-16 opacity-100 scale-100 " + (
                        index === activeIndex
                          ? "border-primary ring-2 ring-primary/20"
                          : q.selected ? "border-green-500/50" : "border-muted-foreground/20"
                      )
                      }`}
                    style={isThisSaved ? { marginRight: 0 } : {}}
                    data-testid={`button-question-thumb-${index}`}
                  >
                    {isThisSavingNow && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                    {q.edited && (
                      <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-primary rounded-full border border-white shadow-sm z-10" title="Edited" />
                    )}
                    {q.imageUrl ? (
                      <AuthImage src={q.imageUrl} alt={`Q${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">Q{index + 1}</div>
                    )}
                    <div className="absolute top-1 left-1">
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-medium bg-black/70 text-white rounded-sm px-1">{index + 1}</span>
                    </div>
                    <div className="absolute bottom-0.5 right-0.5">
                      {q.status === "failed" ? (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      ) : q.selected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className={`flex-1 p-4 sm:p-6 pb-12 sm:pb-16 overflow-y-auto space-y-6`}>

        {extractedQuestions.length === 0 ? (
          <>
            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  Upload Photos
                  {selectedFiles.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{selectedFiles.length}</Badge>
                  )}
                </h2>
              </CardHeader>
              <CardContent>
                {selectedFiles.length === 0 ? (
                  <>
                    <div
                      data-testid="dropzone-upload"
                      className={`border-2 border-dotted rounded-md p-8 text-center cursor-pointer transition-colors mb-4 flex flex-col items-center justify-center border-primary/30 ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                        }`}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById("file-input")?.click()}
                    >
                      <Upload className="w-12 h-12 text-muted-foreground/50 mb-3" />
                      <p className="text-base font-medium mb-1">Drop your photo here, or click to choose a file</p>
                      <p className="text-sm text-muted-foreground mb-6">You can upload up to 20 photos at once (PNG, JPG, or WEBP, max 10MB each)</p>

                      <input
                        id="file-input"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && addFiles(e.target.files)}
                        data-testid="input-file"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-4 text-primary dark:primary/80 text-sm font-semibold w-full">
                      <Info className="w-4 h-4 shrink-0" />
                      <p className="text-center">Tip: For best results, use photos with up to 6–7 questions. If you have more, split them into separate photos.</p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {previewUrls.map((url, index) => (
                        <div key={index} className="relative group rounded-md overflow-hidden bg-muted aspect-square">
                          <img
                            src={url}
                            alt={`Q${index + 1}`}
                            className="w-full h-full object-cover"
                            data-testid={`img-preview-${index}`}
                          />
                          <div className="absolute top-1 left-1">
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">Q{index + 1}</Badge>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-remove-image-${index}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {selectedFiles.length < 20 && (
                        <div
                          className="rounded-md border-2 border-dashed border-muted-foreground/25 aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => document.getElementById("file-input-add")?.click()}
                          data-testid="button-add-more-images"
                        >
                          <Plus className="w-6 h-6 text-muted-foreground/50 mb-1" />
                          <span className="text-xs text-muted-foreground">Add</span>
                          <input
                            id="file-input-add"
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => e.target.files && addFiles(e.target.files)}
                            data-testid="input-file-add"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        data-testid="button-extract-all"
                        onClick={() => extractMutation.mutate(selectedFiles)}
                        disabled={extractMutation.isPending}
                        size="lg"
                      >
                        {extractMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            Extracting {selectedFiles.length} questions...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            Extract Questions From {selectedFiles.length} Files
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={resetForm} data-testid="button-clear">
                        Clear All
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {activeJobs.length > 0 && (
              <Card className="border-primary/50 shadow-md">
                <CardHeader className="pb-3">
                  <h3 className="font-semibold flex items-center gap-2 text-primary">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Extractions in Progress
                  </h3>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {activeJobs.map((job, index) => (
                      <AccordionItem key={job.id} value={job.id} className={index === activeJobs.length - 1 ? "border-b-0" : ""}>
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-4 w-full pr-4">
                            <div className="flex-1 space-y-1 text-left">
                              <div className="text-sm font-medium">Extracting {job.total} images...</div>
                              <Progress value={(job.progress / job.total) * 100} className="h-2" />
                            </div>
                            <div className="text-sm font-semibold">{Math.round((job.progress / job.total) * 100)}%</div>
                          </div>
                        </AccordionTrigger>
                        {job.data?.thumbnails && (
                          <AccordionContent>
                            <div
                              className="flex gap-2 overflow-x-auto pb-2 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                              ref={(el) => {
                                if (el) {
                                  el.onwheel = (e) => {
                                    if (e.deltaY !== 0) {
                                      e.preventDefault();
                                      el.scrollLeft += e.deltaY;
                                    }
                                  };
                                }
                              }}
                            >
                              {job.data.thumbnails.map((t: string, i: number) => (
                                <img key={i} src={t} alt={`thumb-${i}`} className="w-12 h-12 object-cover rounded border bg-muted shrink-0" />
                              ))}
                            </div>
                          </AccordionContent>
                        )}
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}

            {completedJobs.length > 0 && (
              <Card className="border-green-500/50 shadow-md">
                <CardHeader className="pb-3">
                  <h3 className="font-semibold flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                    Extractions Ready for Review
                  </h3>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {completedJobs.map((job, index) => {
                      const isSavingThisJob = jobs.some(j => j.type === "bulk_save" && (j.status === "pending" || j.status === "processing") && j.data?.extractJobId === job.id);
                      return (
                        <AccordionItem key={job.id} value={job.id} className={index === completedJobs.length - 1 ? "border-b-0" : ""}>
                          <div className="flex items-center justify-between w-full pr-4">
                            <AccordionTrigger className="hover:no-underline py-3 flex-1 text-left justify-start">
                              <span className="text-sm font-medium pr-3">Extraction completed for {job.total} images</span>
                            </AccordionTrigger>
                            <div className="flex items-center gap-2 z-10 shrink-0">
                              <Button variant="outline" className="bg-emerald-500/20 hover:bg-emerald-500/30 border-green-500 font-bold" size="sm" disabled={reviewingJobId === job.id || isSavingThisJob} onClick={(e) => { e.stopPropagation(); handleReviewJob(job.id); }}>
                                {(reviewingJobId === job.id || isSavingThisJob) && <Loader2 className="w-4 h-4 mr-1 animate-spin font-bold" />}
                                {!(reviewingJobId === job.id || isSavingThisJob) && <SearchCheckIcon className="w-4 h-4 mr-1 text-lime-500/95 font-bold" />}
                                {isSavingThisJob ? "Saving..." : "Review Extract"}
                              </Button>
                              <Button size="sm" variant="outline" className="border-muted-foreground" onClick={(e) => {
                                e.stopPropagation();
                                queryClient.setQueryData(jobsQueryKey, (old: any) => old?.filter((j: any) => j.id !== job.id));
                                localStorage.removeItem(`extract_job_${job.id}`);
                                fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: jobsQueryKey }));
                              }}>
                                <Trash2Icon className="w-4 h-4 mr-1 text-red-500" />
                                Dismiss
                              </Button>
                            </div>
                          </div>
                          {job.data?.thumbnails && (
                            <AccordionContent>
                              <div
                                className="flex gap-2 overflow-x-auto pb-2 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                ref={(el) => {
                                  if (el) {
                                    el.onwheel = (e) => {
                                      if (e.deltaY !== 0) {
                                        e.preventDefault();
                                        el.scrollLeft += e.deltaY;
                                      }
                                    };
                                  }
                                }}
                              >
                                {job.data.thumbnails.map((t: string, i: number) => (
                                  <div key={i} className="relative w-12 h-12 shrink-0">
                                    <img src={t} alt={`thumb-${i}`} className="w-full h-full object-cover rounded border bg-muted" />
                                    <div className="absolute inset-0 border-2 border-green-500/50 rounded pointer-events-none" />
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          )}
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            )}

            {failedJobs.length > 0 && (
              <Card className="border-red-500/50 shadow-md">
                <CardHeader className="pb-3">
                  <h3 className="font-semibold flex items-center gap-2 text-red-600">
                    <XCircle className="w-5 h-5" />
                    Extractions Failed
                  </h3>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {failedJobs.map((job, index) => (
                      <AccordionItem key={job.id} value={job.id} className={index === failedJobs.length - 1 ? "border-b-0" : ""}>
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-4 flex-1">
                            <AccordionTrigger className="hover:no-underline py-3 flex-1 text-left justify-start">
                              <span className="text-sm font-medium">Extraction failed for {job.total} images</span>
                            </AccordionTrigger>
                            <span className="text-sm text-red-500 line-clamp-1 pr-4">{job.error || "Please try again with clearer images"}</span>
                          </div>
                          <div className="flex items-center gap-2 z-10 shrink-0">
                            <Button size="sm" variant="outline" disabled={reviewingJobId === job.id} onClick={(e) => { e.stopPropagation(); handleReviewJob(job.id); }}>
                              {reviewingJobId === job.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              Review
                            </Button>
                            <Button size="sm" variant="outline" className="border-red-500 text-red-500 hover:bg-red-50" onClick={(e) => {
                              e.stopPropagation();
                              queryClient.setQueryData(jobsQueryKey, (old: any) => old?.filter((j: any) => j.id !== job.id));
                              localStorage.removeItem(`extract_job_${job.id}`);
                              fetchWithAuth(`/api/jobs/${job.id}`, { method: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: jobsQueryKey }));
                            }}>
                              Dismiss
                            </Button>
                          </div>
                        </div>
                        {job.data?.thumbnails && (
                          <AccordionContent>
                            <div
                              className="flex gap-2 overflow-x-auto pb-2 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                              ref={(el) => {
                                if (el) {
                                  el.onwheel = (e) => {
                                    if (e.deltaY !== 0) {
                                      e.preventDefault();
                                      el.scrollLeft += e.deltaY;
                                    }
                                  };
                                }
                              }}
                            >
                              {job.data.thumbnails.map((t: string, i: number) => (
                                <div key={i} className="relative w-12 h-12 shrink-0">
                                  <img src={t} alt={`thumb-${i}`} className="w-full h-full object-cover rounded border bg-muted" />
                                  <div className="absolute inset-0 border-2 border-red-500/50 rounded pointer-events-none" />
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        )}
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}

          </>
        ) : (
          <>
            {activeQuestion && (
              <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-8 w-full relative">
                <div className="w-full lg:w-[40%] flex-shrink-0 sticky top-0 lg:self-start z-20">
                  <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                          QUESTION {activeIndex + 1}
                          {activeQuestion.status === "failed" && (
                            <Badge variant="destructive" className="ml-2">Failed</Badge>
                          )}
                        </h3>
                        {activeQuestion.questionBounds && activeQuestion.imageUrl && activeQuestion.status === "success" && (
                          <div className="flex items-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 text-primary hover:bg-primary/10 border-primary/20"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setCropMode("edit_question");
                                      setIsCropModalOpen(true);
                                    }}
                                  >
                                    <Crop className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Adjust Question Crop</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <ExpandedImageDialog
                                  title="Expanded Question View"
                                  trigger={
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 text-primary hover:bg-primary/10 border-primary/20"
                                      >
                                        <Maximize className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                  }
                                >
                                  <ImageFromCoordinates
                                    src={activeQuestion.imageUrl}
                                    bounds={activeQuestion.questionBounds}
                                    alt="Expanded Question"
                                  />
                                </ExpandedImageDialog>
                                <TooltipContent>
                                  <p>Expanded View</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </div>

                      {activeQuestion.questionBounds && activeQuestion.imageUrl && activeQuestion.status === "success" && (
                        <div className="mb-4 rounded-md overflow-hidden border bg-muted shadow-sm">
                          <ImageFromCoordinates
                            src={activeQuestion.imageUrl}
                            bounds={activeQuestion.questionBounds}
                            alt="Extracted Question"
                          />
                        </div>
                      )}

                      {activeQuestion.status === "success" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-muted/50 border rounded-md p-2 shadow-sm">
                            <div className="flex items-center gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant={activeQuestion.selected ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => toggleSelect(activeIndex)}
                                      data-testid="button-toggle-select"
                                    >
                                      {activeQuestion.selected ? (
                                        <>
                                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                          Selected
                                        </>
                                      ) : (
                                        <>
                                          <XCircle className="w-4 h-4 mr-1.5" />
                                          Excluded
                                        </>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p>Toggle (Space or S)</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            <div className="flex items-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 bg-background"
                                      disabled={activeIndex === 0}
                                      onClick={() => { setActiveIndex(activeIndex - 1); setEditMode(false); }}
                                      data-testid="button-prev-question"
                                    >
                                      <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p>Previous (←)</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <span className="text-sm font-medium text-muted-foreground min-w-[3rem] text-center">
                                {activeIndex + 1} / {extractedQuestions.length}
                              </span>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 bg-background"
                                      disabled={activeIndex === extractedQuestions.length - 1}
                                      onClick={() => { setActiveIndex(activeIndex + 1); setEditMode(false); }}
                                      data-testid="button-next-question"
                                    >
                                      <ChevronRight className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p>Next (→)</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>

                          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md border border-muted">
                            <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" />
                            <p>
                              {activeQuestion.selected
                                ? "This question is selected and will be saved to your library when you proceed."
                                : "Select this question if you want to save it to your library."}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="source-image" className="border rounded-md bg-background px-4">
                        <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">
                          Source Image
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-4">
                          {activeQuestion.imageUrl ? (
                            <div className="rounded-md overflow-hidden bg-muted mt-2 border border-border/50">
                              <img
                                src={activeQuestion.imageUrl}
                                alt={`Question ${activeIndex + 1}`}
                                className="w-full object-contain max-h-[calc(100vh-24rem)]"
                                data-testid="img-active-question"
                              />
                            </div>
                          ) : (
                            <div className="p-8 text-center text-muted-foreground text-sm border border-border/50 rounded-md mt-2">No image available</div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </div>
                <div className="flex-1 min-w-0 w-full space-y-4 pb-16">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold flex items-center gap-2">
                          Extracted Content
                        </h2>
                        {activeQuestion.status === "success" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditMode(!editMode)}
                            data-testid="button-toggle-edit"
                          >
                            {editMode ? "Preview" : "Edit"}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {activeQuestion.status === "failed" ? (
                        <div className="text-center py-8">
                          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">{activeQuestion.error || "Could not extract this question"}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {activeQuestion.originalExtractedData ? (
                            <div className={`p-3 rounded-md border border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-700`} data-testid="alert-auto-standardized">
                              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-2">
                                  <Lightbulb className="w-4 h-4 text-purple-600 flex-shrink-0" />
                                  <p className="text-purple-800 dark:text-purple-300 font-semibold text-sm">
                                    Help us improve :
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">

                                  <Button
                                    variant="ghost"
                                    className={`bg-white/50 hover:bg-white/80 border-purple-500/30 dark:bg-purple-900/10`}
                                    size="sm"
                                    onClick={() => {
                                      const currentIsReverted = activeQuestion.isRevertedToExtracted || false;
                                      const temp = {
                                        latexContent: activeQuestion.latexContent,
                                        optionsLatex: activeQuestion.optionsLatex,
                                        answerLatex: activeQuestion.answerLatex,
                                        hasDiagram: activeQuestion.hasDiagram
                                      };
                                      updateQuestion(activeIndex, {
                                        ...activeQuestion.originalExtractedData,
                                        originalExtractedData: temp,
                                        isRevertedToExtracted: !currentIsReverted,
                                      });
                                      if (!currentIsReverted) {
                                        toast({ title: "Applied Version 2" });
                                      } else {
                                        toast({ title: "Reverted to Version 1" });
                                      }
                                    }}
                                  >
                                    <>

                                      Go Back
                                    </>
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="text-black dark:text-white border-purple-500 hover:bg-purple-900/10 bg-primary/40"
                                    size="sm"
                                    onClick={() => {
                                      updateQuestion(activeIndex, {
                                        originalExtractedData: undefined,
                                        duplicateMatch: null,
                                        isRevertedToExtracted: false
                                      });
                                    }}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-white" />
                                    Accept {activeQuestion.isRevertedToExtracted ? "v2" : "v1"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {editMode ? (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-xs mb-1.5 block text-muted-foreground">Question LaTeX</Label>
                                <Textarea
                                  value={activeQuestion.latexContent}
                                  onChange={(e) => updateQuestion(activeIndex, { latexContent: e.target.value })}
                                  className="min-h-[100px] font-mono text-sm"
                                  data-testid="textarea-latex"
                                />
                              </div>
                              <div>
                                <Label className="text-xs mb-1.5 block text-muted-foreground">Options LaTeX</Label>
                                <Textarea
                                  value={activeQuestion.optionsLatex || ""}
                                  onChange={(e) => updateQuestion(activeIndex, { optionsLatex: e.target.value })}
                                  className="min-h-[60px] font-mono text-sm"
                                  placeholder="(A) ...&#10;(B) ..."
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <Label className="text-xs block text-muted-foreground">Answer / Solution LaTeX</Label>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary" disabled={generateAnswerMutation.isPending || isGeneratingAnswer}>
                                        {(generateAnswerMutation.isPending || isGeneratingAnswer) ? <Loader2 className="w-3 h-3 animate-spin" /> : <BrainCircuitIcon className="w-3 h-3" />}
                                        AI Generate
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem onClick={() => generateAnswerMutation.mutate("very_concise")} className="text-xs cursor-pointer">
                                        Very Concise
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => generateAnswerMutation.mutate("concise")} className="text-xs cursor-pointer">
                                        Concise
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => generateAnswerMutation.mutate("full")} className="text-xs cursor-pointer">
                                        Full Solution
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                <Textarea
                                  value={activeQuestion.answerLatex || ""}
                                  onChange={(e) => updateQuestion(activeIndex, { answerLatex: e.target.value, isAnswerEditedByUser: true })}
                                  className="min-h-[60px] font-mono text-sm"
                                  placeholder="Answer: (C)\nSol: ..."
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs block text-muted-foreground">Diagram</Label>
                                    {(activeQuestion.hasDiagram || activeQuestion.isDiagramHidden || activeQuestion.diagramLatex || (activeQuestion.imageUrl && activeQuestion.diagramBounds)) && (
                                      <div className="flex items-center space-x-2">
                                        <Switch
                                          id="hide-diagram"
                                          checked={!activeQuestion.isDiagramHidden}
                                          onCheckedChange={(checked) => updateQuestion(activeIndex, { isDiagramHidden: !checked })}
                                          className="scale-75"
                                        />
                                        <Label htmlFor="hide-diagram" className="text-[10px] font-normal cursor-pointer">Include Diagram</Label>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7 text-primary border-primary/20 hover:bg-primary/10"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              setCropMode("edit");
                                              setIsCropModalOpen(true);
                                            }}
                                            disabled={!activeQuestion.imageUrl}
                                            title="Set Crop Bounds"
                                          >
                                            <Crop className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Set Crop Bounds</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7 text-primary border-primary/20 hover:bg-primary/10"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              setCropMode("regenerate");
                                              setIsCropModalOpen(true);
                                            }}
                                            disabled={isRegenerating || !activeQuestion.imageUrl}
                                            title="Regenerate LaTeX"
                                          >
                                            {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparklesIcon className="h-3.5 w-3.5" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Regenerate LaTeX</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7 text-primary border-primary/20 hover:bg-primary/10"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              const currentType = activeQuestion.diagramType || (activeQuestion.diagramLatex ? 'latex' : 'image');
                                              const newType = currentType === 'latex' ? 'image' : 'latex';
                                              updateQuestion(activeIndex, { diagramType: newType });
                                            }}
                                            title={(activeQuestion.diagramType || (activeQuestion.diagramLatex ? 'latex' : 'image')) === 'latex' ? "Switch to Image Mode" : "Switch to LaTeX Mode"}
                                          >
                                            {(activeQuestion.diagramType || (activeQuestion.diagramLatex ? 'latex' : 'image')) === 'latex' ? <ImageIcon className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{(activeQuestion.diagramType || (activeQuestion.diagramLatex ? 'latex' : 'image')) === 'latex' ? "Switch to Image Mode" : "Switch to LaTeX Mode"}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </div>

                                {(activeQuestion.diagramType || (activeQuestion.diagramLatex ? 'latex' : 'image')) === 'latex' ? (
                                  <Textarea
                                    value={activeQuestion.diagramLatex || ""}
                                    onChange={(e) => updateQuestion(activeIndex, { diagramLatex: e.target.value })}
                                    className="min-h-[100px] font-mono text-sm"
                                    placeholder="Enter TikZ code here..."
                                    data-testid="textarea-diagram-latex"
                                  />
                                ) : (
                                  <div className="min-h-[100px] border rounded-md bg-muted/30 flex items-center justify-center p-2 relative">
                                    {activeQuestion.imageUrl && activeQuestion.diagramBounds ? (
                                      <ImageFromCoordinates src={activeQuestion.imageUrl} bounds={activeQuestion.diagramBounds} alt="Cropped Diagram" />
                                    ) : activeQuestion.imageUrl ? (
                                      <AuthImage src={activeQuestion.imageUrl} alt="Cropped Diagram" className="max-h-48 object-contain rounded" />
                                    ) : (
                                      <div className="text-center py-4">
                                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                                        <span className="text-xs text-muted-foreground block">No image crop selected.</span>
                                        <span className="text-[10px] text-muted-foreground block mt-1">Click the crop button above to set bounds from the original image.</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 rounded-md bg-muted/40 min-h-[100px] flex flex-col gap-4" data-testid="text-latex-preview">
                              <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Question</h3>
                                <LatexRenderer content={activeQuestion.latexContent} />
                              </div>

                              {activeQuestion.optionsLatex && (
                                <div className="mt-1 pt-3 border-t border-border/50">
                                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Options</h3>
                                  <div className={`grid grid-cols-1 ${parseOptions(activeQuestion.optionsLatex).some((opt: string) => opt.length > 80) ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-2 mt-2`}>
                                    {parseOptions(activeQuestion.optionsLatex).map((opt: string, i: number) => (
                                      <div key={i} className="flex gap-2 items-center">
                                        <span className="font-semibold shrink-0 text-sm text-muted-foreground">
                                          {getOptionLabel(i, "a-b-c-d")}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <LatexRenderer
                                            content={stripOptionLabel(opt)}
                                            className="text-xs"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {activeQuestion.answerLatex && (
                                <div className="mt-1 pt-3 border-t border-border/50">
                                  <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                      Answer & Solution
                                    </h3>
                                    {activeQuestion.isAnswerEditedByUser && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center justify-center p-1 rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-help">
                                              <UserPenIcon className="w-3.5 h-3.5" />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Edited by user</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {(!activeQuestion.isAnswerEditedByUser && activeQuestion.isAnswerExtractedFromImage) && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center justify-center p-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-help">
                                              <ImageIcon className="w-3.5 h-3.5" />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Answer extracted from image</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {(!activeQuestion.isAnswerEditedByUser && !activeQuestion.isAnswerExtractedFromImage && activeQuestion.isSystemGeneratedAnswer) && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center justify-center p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-help">
                                              <BotIcon className="w-3.5 h-3.5" />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Answer generated by AI</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                  <div className="break-words">
                                    <LatexRenderer content={activeQuestion.answerLatex} />
                                  </div>
                                </div>
                              )}

                              {((activeQuestion.hasDiagram || activeQuestion.diagramLatex || (activeQuestion.imageUrl && activeQuestion.diagramBounds)) && !activeQuestion.isDiagramHidden) && (
                                <div className="mt-1 pt-3 border-t border-border/50">
                                  <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagram</h3>
                                    <div className="flex items-center gap-1">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10"
                                              onClick={() => {
                                                setCropMode("edit");
                                                setIsCropModalOpen(true);
                                              }}
                                            >
                                              <Crop className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Edit Crop Bounds</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10"
                                              onClick={() => {
                                                setCropMode("regenerate");
                                                setIsCropModalOpen(true);
                                              }}
                                              disabled={isRegenerating}
                                            >
                                              {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Regenerate Figure</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {(activeQuestion.diagramLatex || activeQuestion.imageUrl) && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const newType = (activeQuestion.diagramType || 'latex') === 'latex' ? 'image' : 'latex';
                                                  updateQuestion(activeIndex, { diagramType: newType });
                                                }}
                                                disabled={!activeQuestion.diagramLatex || !activeQuestion.imageUrl}
                                                title={(activeQuestion.diagramType || 'latex') === 'latex' ? "Show Image Diagram" : "Show LaTeX Diagram"}
                                              >
                                                {(activeQuestion.diagramType || 'latex') === 'latex' ? <ImageIcon className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{(activeQuestion.diagramType || 'latex') === 'latex' ? "Show Image Diagram" : "Show LaTeX Diagram"}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}

                                      {(activeQuestion.diagramLatex || activeQuestion.imageUrl) && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setIsExpandedViewOpen(true)}
                                              >
                                                <Maximize className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Expand View</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  </div>
                                  {(activeQuestion.diagramType || 'latex') === 'latex' && activeQuestion.diagramLatex ? (
                                    <LatexRenderer content="" diagramLatex={activeQuestion.diagramLatex} />
                                  ) : activeQuestion.imageUrl && activeQuestion.diagramBounds ? (
                                    <div className="mt-2 flex justify-center bg-muted/30 p-2 rounded-md border">
                                      <ImageFromCoordinates src={activeQuestion.imageUrl} bounds={activeQuestion.diagramBounds} alt="Cropped Diagram" />
                                    </div>
                                  ) : activeQuestion.imageUrl ? (
                                    <div className="mt-2 flex justify-center bg-muted/30 p-2 rounded-md border">
                                      <AuthImage src={activeQuestion.imageUrl} alt="Cropped Diagram" className="max-h-48 object-contain rounded" />
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground border-l-2 border-amber-500 pl-2 mt-2">
                                      Diagram detected but no image or LaTeX/TikZ extracted.
                                    </div>
                                  )}
                                  {!activeQuestion.diagramLatex && activeQuestion.latexGenerabilityScore !== undefined && activeQuestion.latexGenerabilityScore >= 80 && (
                                    <div className="mt-2 mb-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                                      <div className="text-sm text-emerald-700">
                                        <span className="font-semibold">High LaTeX Score - ({activeQuestion.latexGenerabilityScore}%)</span>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 bg-white hover:bg-emerald-50 text-emerald-600 border-emerald-200"
                                        disabled={isRegenerating}
                                        onClick={() => {
                                          setCropMode("regenerate");
                                          setIsCropModalOpen(true);
                                        }}
                                      >
                                        {isRegenerating ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                                        {isRegenerating ? "Regenerating..." : "Try Regenerating In LaTeX"}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <Accordion type="single" collapsible defaultValue="metadata" className="w-full border rounded-md px-3 bg-muted/20">
                            <AccordionItem value="metadata" className="border-none">
                              <AccordionTrigger className="text-xs font-semibold py-3 text-muted-foreground hover:no-underline hover:text-foreground">
                                Question Metadata (Subject, Topic, Difficulty)
                              </AccordionTrigger>
                              <AccordionContent className="space-y-4 pb-4 pt-1">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Subject</Label>
                                  <Input
                                    placeholder="e.g., Physics"
                                    value={activeQuestion.subject}
                                    onChange={(e) => updateQuestion(activeIndex, { subject: e.target.value })}
                                    data-testid="input-subject"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Chapter</Label>
                                    <Input
                                      placeholder="e.g., Kinematics"
                                      value={activeQuestion.chapter}
                                      onChange={(e) => updateQuestion(activeIndex, { chapter: e.target.value })}
                                      data-testid="input-chapter"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Topic</Label>
                                    <Input
                                      placeholder="e.g., Projectile Motion"
                                      value={activeQuestion.topic}
                                      onChange={(e) => updateQuestion(activeIndex, { topic: e.target.value })}
                                      data-testid="input-topic"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Difficulty</Label>
                                    <Select
                                      value={activeQuestion.difficulty}
                                      onValueChange={(v) => updateQuestion(activeIndex, { difficulty: v })}
                                    >
                                      <SelectTrigger data-testid="select-difficulty">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="easy">Easy</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="hard">Hard</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Marks</Label>
                                    <Input
                                      type="number"
                                      value={activeQuestion.marks}
                                      onChange={(e) => updateQuestion(activeIndex, { marks: parseInt(e.target.value) || 0 })}
                                      min={1}
                                      max={20}
                                      data-testid="input-marks"
                                    />
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>

                          {(!activeQuestion.subject || !activeQuestion.topic || !activeQuestion.latexContent) && (
                            <div className="text-xs text-destructive flex items-center gap-1" data-testid="text-validation-warning">
                              <AlertTriangle className="w-3 h-3" />
                              Missing required fields: {[
                                !activeQuestion.subject && "Subject",
                                !activeQuestion.topic && "Topic",
                                !activeQuestion.latexContent && "Content",
                              ].filter(Boolean).join(", ")}
                            </div>
                          )}

                          <div className="flex gap-2">
                            {((activeQuestion.hasDiagram || activeQuestion.diagramLatex || (activeQuestion.imageUrl && activeQuestion.diagramBounds)) && !activeQuestion.isDiagramHidden) && (
                              <>
                                <Badge variant="secondary">Contains Diagram</Badge>
                                {activeQuestion.latexGenerabilityScore !== undefined && (
                                  <Badge variant="outline" className={activeQuestion.latexGenerabilityScore >= 70 ? "text-emerald-600 border-emerald-500/20 bg-emerald-500/10" : "text-amber-600 border-amber-500/20 bg-amber-500/10"} title="LaTeX Generability Score">
                                    LaTeX Score: {activeQuestion.latexGenerabilityScore}%
                                  </Badge>
                                )}
                              </>
                            )}
                            {user?.role === "admin" && activeQuestion.aiCost !== undefined && activeQuestion.aiCost > 0 && (
                              <Badge variant="outline" className="text-xs font-mono bg-emerald-500/10 text-emerald-600 border-emerald-500/20" title={`${activeQuestion.totalTokens} tokens`}>
                                {formatCurrency(activeQuestion.aiCost, user?.currency || "USD")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}

        {activeQuestion && isCropModalOpen && activeQuestion.imageUrl && (
          <CropModal
            isOpen={isCropModalOpen}
            onClose={() => setIsCropModalOpen(false)}
            imageUrl={activeQuestion.imageUrl}
            initialCrop={(cropMode === "edit_question" || cropMode === "view_question") ? activeQuestion.questionBounds : activeQuestion.diagramBounds}
            mode={cropMode}
            onConfirm={(base64Image, bounds) => {
              if (cropMode === "edit") {
                updateQuestion(activeIndex, { diagramBounds: bounds, hasDiagram: true, isDiagramHidden: false });
                setIsCropModalOpen(false);
                toast({ title: "Crop bounds updated successfully" });
              } else if (cropMode === "edit_question") {
                updateQuestion(activeIndex, { questionBounds: bounds });
                setIsCropModalOpen(false);
                toast({ title: "Question crop bounds updated successfully" });
              } else if (cropMode === "view_question") {
                setIsCropModalOpen(false);
              } else {
                updateQuestion(activeIndex, { diagramBounds: bounds, hasDiagram: true, isDiagramHidden: false });
                regenerateMutation.mutate({ imageBase64: base64Image, questionText: activeQuestion.latexContent });
              }
            }}
            isLoading={regenerateMutation.isPending}
          />
        )}

        {isExpandedViewOpen && activeQuestion && (activeQuestion.diagramLatex || activeQuestion.imageUrl) && (
          <Dialog open={isExpandedViewOpen} onOpenChange={setIsExpandedViewOpen}>
            <DialogContent className="w-[65vw] max-w-[65vw] h-[80vh] max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Expanded Diagram View</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-hidden rounded-md mt-4 border flex flex-col items-center justify-center relative bg-muted/30">
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={4}
                  centerOnInit
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <div className="w-full h-full flex flex-col items-center p-4 relative">
                      <div className="absolute bottom-4 right-4 z-50 flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => resetTransform()} className="bg-background/80 backdrop-blur-sm shadow-sm h-8 w-8" title="Reset View">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <div className="flex items-center border rounded-md bg-background/80 backdrop-blur-sm shadow-sm">
                          <Button variant="ghost" size="icon" onClick={() => zoomOut()} className="h-8 w-8 rounded-none rounded-l-md border-r hover:bg-muted/50" title="Zoom Out">
                            <ZoomOut className="w-4 h-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => zoomIn()} className="h-8 w-8 rounded-none rounded-r-md hover:bg-muted/50" title="Zoom In">
                            <ZoomIn className="w-4 h-4 text-primary" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden">
                        <TransformComponent wrapperClass="!w-full !h-full" contentClass="min-w-full min-h-full flex items-center justify-center">
                          <div className="bg-white p-2 sm:p-4 rounded-md shadow-sm pointer-events-none max-w-full flex items-center justify-center">
                            <LatexRenderer
                              content=""
                              diagramLatex={activeQuestion.diagramLatex}
                              imageUrl={activeQuestion.imageUrl}
                              diagramType={activeQuestion.diagramType}
                              className="w-full flex items-center justify-center"
                              forceLightMode={true}
                            />
                          </div>
                        </TransformComponent>
                      </div>
                    </div>
                  )}
                </TransformWrapper>
              </div>
              <div className="flex justify-end mt-4">
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div >
  );
}
