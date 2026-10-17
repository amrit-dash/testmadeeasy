import { fetchWithAuth } from "@/lib/queryClient";
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { WandSparklesIcon } from "lucide-react";
import {
  FileUp, Loader2, ChevronLeft, ChevronRight, Check, X,
  Eye, Edit2, Save, Trash2, ArrowLeft, CheckCircle2, Crop, ImageIcon, RefreshCw, Maximize, Code2, ZoomIn, ZoomOut, AlertTriangle
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import LatexRenderer from "@/components/latex-renderer";
import CropModal from "@/components/crop-modal";
import { formatCurrency } from "@/lib/utils";
import { AuthImage } from "@/components/auth-image";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { useJobs } from "@/hooks/use-jobs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {

  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExtractedQuestion = {
  latexContent: string;
  optionsLatex?: string | null;
  answerLatex?: string | null;
  isSystemGeneratedAnswer?: boolean;
  isAnswerExtractedFromImage?: boolean;
  isAnswerEditedByUser?: boolean;
  subject: string;
  chapter: string | null;
  topic: string;
  hasDiagram: boolean;
  latexGenerabilityScore?: number;
  imageUrl: string | null;
  diagramLatex?: string | null;
  diagramType?: "latex" | "image";
  diagramBounds?: { x: number; y: number; width: number; height: number } | null;
  difficulty: string;
  marks: number;
  pageNumber: number;
  source: string;
  approved: boolean;
  editing: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  aiCost?: number;
  replaceMasterId?: number;
  duplicateMatch?: { id: number; similarity: number } | null;
};

type PdfStep = "upload" | "select-pages" | "extracting" | "review";

export default function PdfUploadPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<PdfStep>("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [pageThumbnails, setPageThumbnails] = useState<Map<number, string>>(new Map());
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0 });
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropMode, setCropMode] = useState<"edit" | "regenerate">("regenerate");
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);
  const [activeCropQuestionIndex, setActiveCropQuestionIndex] = useState(-1);
  const pdfDocRef = useRef<any>(null);

  const { jobs } = useJobs();

  const handleReviewJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetchWithAuth(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error("Failed to load job results");
      const job = await res.json();

      if (job.status === "completed") {
        if (job.type === "regenerate_figure" && typeof job.result?.index === "number") {
          const index = job.result.index;
          const q = extractedQuestions[index];
          if (q) {
            updateQuestion(index, "diagramLatex", job.result.diagramLatex);
            updateQuestion(index, "diagramType", "latex");
            toast({
              title: `Figure updated`,
              description: `LaTeX diagram for Q${index + 1} has been updated.`,
            });
          }
        } else if (job.type === "generate_answer" && typeof job.result?.index === "number") {
          const index = job.result.index;
          const q = extractedQuestions[index];
          if (q) {
            updateQuestion(index, "answerLatex", job.result.answerLatex);
            updateQuestion(index, "isSystemGeneratedAnswer", true);
            updateQuestion(index, "isAnswerEditedByUser", false);
            updateQuestion(index, "isAnswerExtractedFromImage", false);
            toast({
              title: `Answer generated`,
              description: `AI generated answer for Q${index + 1} has been updated.`,
            });
          }
        }
        await fetchWithAuth(`/api/jobs/${jobId}`, { method: "DELETE" });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      }
    } catch (err) {
      console.error("Error loading job:", err);
    }
  }, [extractedQuestions, queryClient, toast]);

  useEffect(() => {
    const handleLoadJobEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        handleReviewJob(customEvent.detail);
      }
    };
    window.addEventListener('load-job', handleLoadJobEvent);
    return () => window.removeEventListener('load-job', handleLoadJobEvent);
  }, [handleReviewJob]);

  const regenerateMutation = useMutation({
    mutationFn: async ({ imageBase64, questionText }: { imageBase64: string, questionText: string }) => {
      const res = await fetchWithAuth("/api/questions/regenerate-figure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, questionText, source: "pdf_upload", index: activeCropQuestionIndex }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Regeneration failed");
      return res.json() as Promise<{ jobId: string, message: string }>;
    },
    onSuccess: () => {
      setIsCropModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Regeneration started", description: "You will be notified when the new figure is ready." });
    },
    onError: () => {
      toast({ title: "Failed to regenerate figure", description: "Please try again", variant: "destructive" });
    },
  });

  const generateAnswerMutation = useMutation({
    mutationFn: async (args: { style: string, index: number }) => {
      const q = extractedQuestions[args.index];
      const res = await fetchWithAuth("/api/generate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latexContent: q.latexContent,
          optionsLatex: q.optionsLatex,
          imageUrl: q.imageUrl,
          style: args.style,
          source: "pdf_upload",
          index: args.index
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Generation failed");
      return res.json() as Promise<{ jobId: string, message: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Answer generation started", description: "You will be notified when the answer is ready." });
    },
    onError: () => {
      toast({ title: "Failed to generate answer", description: "Please try again", variant: "destructive" });
    },
  });

  const loadPdf = useCallback(async (file: File) => {
    setPdfFile(file);
    setThumbnailsLoading(true);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      const thumbs = new Map<number, string>();
      const batchSize = 10;
      for (let start = 1; start <= pdf.numPages; start += batchSize) {
        const end = Math.min(start + batchSize - 1, pdf.numPages);
        const promises = [];
        for (let i = start; i <= end; i++) {
          promises.push((async (pageNum: number) => {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
            return { pageNum, dataUrl: canvas.toDataURL("image/jpeg", 0.6) };
          })(i));
        }
        const results = await Promise.all(promises);
        for (const r of results) thumbs.set(r.pageNum, r.dataUrl);
        setPageThumbnails(new Map(thumbs));
      }
      setStep("select-pages");
    } catch (err) {
      console.error("Error loading PDF:", err);
      toast({ title: "Error", description: "Failed to load PDF. Make sure it's a valid PDF file.", variant: "destructive" });
    } finally {
      setThumbnailsLoading(false);
    }
  }, [toast]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      loadPdf(file);
    } else if (file) {
      toast({ title: "Invalid file", description: "Please select a PDF file", variant: "destructive" });
    }
  }, [loadPdf, toast]);

  const parsePageRange = useCallback((input: string): number[] => {
    const pages: Set<number> = new Set();
    const parts = input.split(",").map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
            pages.add(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [totalPages]);

  const applyPageRange = useCallback(() => {
    if (!pageRangeInput.trim()) return;
    const pages = parsePageRange(pageRangeInput);
    setSelectedPages(new Set(pages));
  }, [pageRangeInput, parsePageRange]);

  const togglePage = useCallback((pageNum: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  }, []);

  const selectAllPages = useCallback(() => {
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    setSelectedPages(all);
  }, [totalPages]);

  const clearSelection = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  const renderPageToImage = useCallback(async (pageNum: number): Promise<Blob> => {
    if (!pdfDocRef.current) {
      const pdfjsLib = await import("pdfjs-dist");
      const arrayBuffer = await pdfFile!.arrayBuffer();
      pdfDocRef.current = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    }
    const page = await pdfDocRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png", 0.95);
    });
  }, [pdfFile]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
      setExtractionProgress({ current: 0, total: sortedPages.length });
      setStep("extracting");

      const batchSize = 5;
      const allQuestions: ExtractedQuestion[] = [];

      for (let batchStart = 0; batchStart < sortedPages.length; batchStart += batchSize) {
        const batch = sortedPages.slice(batchStart, batchStart + batchSize);
        const formData = new FormData();

        for (let i = 0; i < batch.length; i++) {
          const blob = await renderPageToImage(batch[i]);
          formData.append("pages", blob, `page_${batch[i]}.png`);
          formData.append(`pageNum_${i}`, String(batch[i]));
        }
        formData.append("source", source || pdfFile?.name || "pdf_upload");

        const res = await fetchWithAuth("/api/admin/master-questions/pdf-extract", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) throw new Error("Extraction failed");
        const data = await res.json();

        for (const q of data.questions) {
          allQuestions.push({ ...q, approved: true, editing: false });
        }

        setExtractionProgress({ current: batchStart + batch.length, total: sortedPages.length });
        setExtractedQuestions([...allQuestions]);
      }

      return allQuestions;
    },
    onSuccess: (questions) => {
      setExtractedQuestions(questions);
      setStep("review");
      toast({
        title: "Extraction complete",
        description: `Found ${questions.length} questions from ${selectedPages.size} pages`,
      });
    },
    onError: () => {
      setStep("select-pages");
      toast({ title: "Extraction failed", description: "Something went wrong during extraction", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const approved = extractedQuestions.filter(q => q.approved);
      if (approved.length === 0) throw new Error("No questions approved");

      const res = await apiRequest("POST", "/api/admin/master-questions/bulk-save", {
        questions: approved,
        source: source || pdfFile?.name || "pdf_upload",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Saved to Master Bank",
        description: `${data.saved} questions saved, ${data.duplicates} duplicates skipped`,
      });
      setLocation("/admin");
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save questions", variant: "destructive" });
    },
  });

  const toggleQuestionApproval = useCallback((index: number) => {
    setExtractedQuestions(prev => prev.map((q, i) => i === index ? { ...q, approved: !q.approved } : q));
  }, []);

  const toggleQuestionEdit = useCallback((index: number) => {
    setExtractedQuestions(prev => prev.map((q, i) => i === index ? { ...q, editing: !q.editing } : q));
  }, []);

  const updateQuestion = useCallback((index: number, field: string, value: any) => {
    setExtractedQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }, []);

  const removeQuestion = useCallback((index: number) => {
    setExtractedQuestions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const approvedCount = extractedQuestions.filter(q => q.approved).length;

  useEffect(() => {
    if (pageRangeInput) {
      const pages = parsePageRange(pageRangeInput);
      setSelectedPages(new Set(pages));
    }
  }, [pageRangeInput, parsePageRange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")} data-testid="button-back-admin">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-pdf-title">PDF Upload to Master Bank</h1>
          <p className="text-sm text-muted-foreground">
            Upload a PDF, select pages, extract questions, review & save
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(["upload", "select-pages", "extracting", "review"] as PdfStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
              ${step === s ? "bg-primary text-primary-foreground" :
                (["upload", "select-pages", "extracting", "review"].indexOf(step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}`}
              data-testid={`step-indicator-${s}`}
            >
              {["upload", "select-pages", "extracting", "review"].indexOf(step) > i ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${step === s ? "font-semibold" : "text-muted-foreground"}`}>
              {s === "upload" ? "Upload" : s === "select-pages" ? "Select Pages" : s === "extracting" ? "Extracting" : "Review"}
            </span>
            {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileUp className="w-4 h-4" />
              Select PDF File
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-pdf"
            >
              <FileUp className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">Click to select a PDF file</p>
              <p className="text-xs text-muted-foreground mt-1">
                Textbooks, question papers, exercise sheets
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-pdf-file"
              />
            </div>
            {thumbnailsLoading && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading PDF pages...</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Source / Book Name (optional)</Label>
              <Input
                placeholder="e.g., HC Verma Vol 1, Irodov, NCERT Class 12 Physics"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                data-testid="input-pdf-source"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === "select-pages" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold">
                  Select Pages to Extract ({totalPages} pages total)
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllPages} data-testid="button-select-all">
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearSelection} data-testid="button-clear-selection">
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Page Range (e.g., 15-30, 45-60, 72)</Label>
                  <Input
                    placeholder="Enter page numbers or ranges..."
                    value={pageRangeInput}
                    onChange={(e) => setPageRangeInput(e.target.value)}
                    data-testid="input-page-range"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" data-testid="badge-selected-count">
                  {selectedPages.size} pages selected
                </Badge>
                {pdfFile && (
                  <span className="text-muted-foreground text-xs">
                    from {pdfFile.name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-h-[500px] overflow-auto p-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <div
                    key={pageNum}
                    className={`relative cursor-pointer rounded-md border-2 overflow-hidden transition-all hover:scale-105
                      ${selectedPages.has(pageNum) ? "border-primary ring-2 ring-primary/30" : "border-muted hover:border-primary/30"}`}
                    onClick={() => togglePage(pageNum)}
                    data-testid={`page-thumb-${pageNum}`}
                  >
                    {pageThumbnails.has(pageNum) && (
                      <img
                        src={pageThumbnails.get(pageNum)}
                        alt={`Page ${pageNum}`}
                        className="w-full aspect-[3/4] object-cover"
                      />
                    )}
                    <div className={`absolute inset-0 flex items-center justify-center
                      ${selectedPages.has(pageNum) ? "bg-primary/20" : "bg-transparent"}`}>
                      {selectedPages.has(pageNum) && (
                        <CheckCircle2 className="w-6 h-6 text-primary drop-shadow-md" />
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                      {pageNum}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setStep("upload"); setPdfFile(null); setPageThumbnails(new Map()); }}
              data-testid="button-back-upload">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button
              onClick={() => extractMutation.mutate()}
              disabled={selectedPages.size === 0}
              data-testid="button-extract-questions"
            >
              <Eye className="w-4 h-4 mr-1.5" />
              Extract Questions from {selectedPages.size} Pages
            </Button>
          </div>
        </>
      )}

      {step === "extracting" && (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-semibold text-lg">Extracting Questions...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Processing page {extractionProgress.current} of {extractionProgress.total}
              </p>
            </div>
            <div className="w-64 mx-auto bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${extractionProgress.total > 0 ? (extractionProgress.current / extractionProgress.total) * 100 : 0}%` }}
              />
            </div>
            {extractedQuestions.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {extractedQuestions.length} questions found so far...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold">
                  Review Extracted Questions ({extractedQuestions.length} found)
                </h2>
                <div className="flex items-center gap-2">
                  <Badge variant="default" data-testid="badge-approved-count">{approvedCount} approved</Badge>
                  <Badge variant="secondary">{extractedQuestions.length - approvedCount} rejected</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {extractedQuestions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p>No questions were found on the selected pages.</p>
                  <p className="text-xs mt-1">Try selecting different pages that contain exercises or problems.</p>
                  <Button variant="outline" className="mt-4" onClick={() => setStep("select-pages")}
                    data-testid="button-back-to-pages">
                    Back to Page Selection
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[700px] overflow-auto">
                  {extractedQuestions.map((q, index) => {
                    const isRegenerating = jobs?.some(j => j.type === "regenerate_figure" && (j.status === "pending" || j.status === "processing") && j.data?.index === index && j.data?.source === "pdf_upload");
                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border transition-colors ${q.approved ? "bg-card border-border" : "bg-muted/30 border-muted opacity-60"
                          }`}
                        data-testid={`review-question-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={q.approved}
                            onCheckedChange={() => toggleQuestionApproval(index)}
                            className="mt-1"
                            data-testid={`checkbox-approve-${index}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">{q.subject}</Badge>
                              {q.chapter && <Badge variant="secondary" className="text-xs">{q.chapter}</Badge>}
                              <Badge variant="secondary" className="text-xs">{q.topic}</Badge>
                              <Badge variant="secondary" className="text-xs">Page {q.pageNumber}</Badge>
                              <Badge variant="secondary" className="text-xs capitalize">{q.difficulty}</Badge>
                              <Badge variant="secondary" className="text-xs">{q.marks} marks</Badge>
                              {q.hasDiagram && q.latexGenerabilityScore !== undefined && (
                                <Badge variant="outline" className={`text-xs ${q.latexGenerabilityScore >= 70 ? "text-emerald-600 border-emerald-500/20 bg-emerald-500/10" : "text-amber-600 border-amber-500/20 bg-amber-500/10"}`} title="LaTeX Generability Score">
                                  LaTeX Score: {q.latexGenerabilityScore}%
                                </Badge>
                              )}
                              {q.aiCost !== undefined && q.aiCost > 0 && (
                                <Badge variant="outline" className="text-xs font-mono bg-emerald-500/10 text-emerald-600 border-emerald-500/20" title={`${q.totalTokens} tokens`}>
                                  {formatCurrency(q.aiCost, user?.currency || "USD")}
                                </Badge>
                              )}
                            </div>

                            {q.duplicateMatch && (
                              <div className="mt-2 mb-2 p-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
                                <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                      {q.duplicateMatch.similarity}% match found in Master Library
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      variant="ghost"
                                      className="text-red-700 border-red-500/10 bg-red-900/20"
                                      size="sm"
                                      onClick={() => updateQuestion(index, "duplicateMatch", null)}
                                    >
                                      Dismiss
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {q.editing ? (
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Question Content (LaTeX)</Label>
                                  <Textarea
                                    value={q.latexContent}
                                    onChange={(e) => updateQuestion(index, "latexContent", e.target.value)}
                                    rows={4}
                                    className="font-mono text-xs"
                                    data-testid={`textarea-edit-${index}`}
                                  />
                                </div>

                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <Label className="text-xs block text-muted-foreground">Diagram</Label>
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
                                                setActiveCropQuestionIndex(index);
                                                setCropMode("edit");
                                                setIsCropModalOpen(true);
                                              }}
                                              disabled={!q.imageUrl}
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
                                                setActiveCropQuestionIndex(index);
                                                setCropMode("regenerate");
                                                setIsCropModalOpen(true);
                                              }}
                                              disabled={isRegenerating || !q.imageUrl}
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
                                                const currentType = q.diagramType || (q.diagramLatex ? 'latex' : 'image');
                                                const newType = currentType === 'latex' ? 'image' : 'latex';
                                                updateQuestion(index, "diagramType", newType);
                                              }}
                                              title={(q.diagramType || (q.diagramLatex ? 'latex' : 'image')) === 'latex' ? "Switch to Image Mode" : "Switch to LaTeX Mode"}
                                            >
                                              {(q.diagramType || (q.diagramLatex ? 'latex' : 'image')) === 'latex' ? <ImageIcon className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{(q.diagramType || (q.diagramLatex ? 'latex' : 'image')) === 'latex' ? "Switch to Image Mode" : "Switch to LaTeX Mode"}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>

                                  {(q.diagramType || (q.diagramLatex ? 'latex' : 'image')) === 'latex' ? (
                                    <Textarea
                                      value={q.diagramLatex || ""}
                                      onChange={(e) => updateQuestion(index, "diagramLatex", e.target.value)}
                                      className="min-h-[100px] font-mono text-xs"
                                      placeholder="Enter TikZ code here..."
                                    />
                                  ) : (
                                    <div className="min-h-[100px] border rounded-md bg-muted/30 flex items-center justify-center p-2 relative">
                                      {q.imageUrl && q.diagramBounds ? (
                                        <div className="max-h-48 flex justify-center w-full relative">
                                          <LatexRenderer 
                                            content="" 
                                            imageUrl={q.imageUrl} 
                                            diagramBounds={q.diagramBounds} 
                                            className="w-full h-full object-contain"
                                          />
                                        </div>
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

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Subject</Label>
                                    <Input
                                      value={q.subject}
                                      onChange={(e) => updateQuestion(index, "subject", e.target.value)}
                                      className="h-8 text-xs"
                                      data-testid={`input-edit-subject-${index}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Chapter</Label>
                                    <Input
                                      value={q.chapter || ""}
                                      onChange={(e) => updateQuestion(index, "chapter", e.target.value)}
                                      className="h-8 text-xs"
                                      data-testid={`input-edit-chapter-${index}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Topic</Label>
                                    <Input
                                      value={q.topic}
                                      onChange={(e) => updateQuestion(index, "topic", e.target.value)}
                                      className="h-8 text-xs"
                                      data-testid={`input-edit-topic-${index}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Difficulty</Label>
                                    <Select
                                      value={q.difficulty}
                                      onValueChange={(val) => updateQuestion(index, "difficulty", val)}
                                    >
                                      <SelectTrigger className="h-8 text-xs" data-testid={`select-edit-difficulty-${index}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="easy">Easy</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="hard">Hard</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Marks</Label>
                                    <Input
                                      type="number"
                                      value={q.marks}
                                      onChange={(e) => updateQuestion(index, "marks", parseInt(e.target.value) || 1)}
                                      className="h-8 text-xs w-20"
                                      data-testid={`input-edit-marks-${index}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm">
                                <LatexRenderer content={q.latexContent} diagramLatex={q.diagramLatex} className="text-sm" />
                              </div>
                            )}

                            {q.hasDiagram && q.imageUrl && q.diagramBounds && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Diagram Source</h4>
                                  <div className="flex items-center gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10"
                                            onClick={() => {
                                              setActiveCropQuestionIndex(index);
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
                                            disabled={isRegenerating}
                                            onClick={() => {
                                              setActiveCropQuestionIndex(index);
                                              setCropMode("regenerate");
                                              setIsCropModalOpen(true);
                                            }}
                                          >
                                            {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Regenerate Figure</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>

                                    {(q.diagramLatex || (q.imageUrl && q.diagramBounds)) && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const newType = (q.diagramType || 'latex') === 'latex' ? 'image' : 'latex';
                                                updateQuestion(index, "diagramType", newType);
                                              }}
                                              disabled={!q.diagramLatex || !(q.imageUrl && q.diagramBounds)}
                                              title={(q.diagramType || 'latex') === 'latex' ? "Show Image Diagram" : "Show LaTeX Diagram"}
                                            >
                                              {(q.diagramType || 'latex') === 'latex' ? <ImageIcon className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{(q.diagramType || 'latex') === 'latex' ? "Show Image Diagram" : "Show LaTeX Diagram"}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}

                                    {q.diagramLatex && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => {
                                                setActiveCropQuestionIndex(index);
                                                setIsExpandedViewOpen(true);
                                              }}
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
                                {(q.diagramType || 'latex') === 'latex' && q.diagramLatex ? (
                                  <div className="text-sm">
                                    <LatexRenderer content="" diagramLatex={q.diagramLatex} />
                                  </div>
                                  ) : (q.imageUrl && q.diagramBounds) ? (
                                    <div className="max-h-40 rounded border flex justify-center overflow-hidden">
                                      <LatexRenderer content="" imageUrl={q.imageUrl} diagramBounds={q.diagramBounds} />
                                    </div>
                                ) : null}
                                {!q.diagramLatex && q.latexGenerabilityScore !== undefined && q.latexGenerabilityScore >= 80 && (
                                  <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="text-sm text-emerald-700">
                                      <span className="font-semibold">High LaTeX Score - ({q.latexGenerabilityScore}%)</span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="shrink-0 bg-white hover:bg-emerald-50 text-emerald-600 border-emerald-200"
                                      disabled={isRegenerating}
                                      onClick={() => {
                                        setActiveCropQuestionIndex(index);
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

                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleQuestionEdit(index)}
                              data-testid={`button-edit-${index}`}
                            >
                              {q.editing ? <Save className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeQuestion(index)}
                              data-testid={`button-remove-${index}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {extractedQuestions.length > 0 && (
            <div className="flex gap-3 justify-between items-center">
              <Button variant="outline" onClick={() => setStep("select-pages")} data-testid="button-back-to-pages-2">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Pages
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || approvedCount === 0}
                data-testid="button-save-to-master"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Save {approvedCount} Questions to Master Bank
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {activeCropQuestionIndex >= 0 && isCropModalOpen && extractedQuestions[activeCropQuestionIndex]?.imageUrl && (
        <CropModal
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          imageUrl={extractedQuestions[activeCropQuestionIndex].imageUrl!}
          initialCrop={extractedQuestions[activeCropQuestionIndex].diagramBounds}
          mode={cropMode}
          onConfirm={(base64Image, bounds) => {
            if (cropMode === "edit") {
              updateQuestion(activeCropQuestionIndex, "diagramBounds", bounds);
              setIsCropModalOpen(false);
              toast({ title: "Crop bounds updated successfully" });
            } else {
              updateQuestion(activeCropQuestionIndex, "diagramBounds", bounds);
              regenerateMutation.mutate({
                imageBase64: base64Image,
                questionText: extractedQuestions[activeCropQuestionIndex].latexContent
              });
            }
          }}
          isLoading={regenerateMutation.isPending}
        />
      )}

      {isExpandedViewOpen && activeCropQuestionIndex >= 0 && (extractedQuestions[activeCropQuestionIndex]?.diagramLatex || (extractedQuestions[activeCropQuestionIndex]?.imageUrl && extractedQuestions[activeCropQuestionIndex]?.diagramBounds)) && (
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
                                    diagramLatex={extractedQuestions[activeCropQuestionIndex].diagramLatex}
                                    imageUrl={extractedQuestions[activeCropQuestionIndex].imageUrl}
                                    diagramBounds={extractedQuestions[activeCropQuestionIndex].diagramBounds}
                                    diagramType={extractedQuestions[activeCropQuestionIndex].diagramType}
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
  );
}
