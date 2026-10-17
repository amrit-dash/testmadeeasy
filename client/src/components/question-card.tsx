import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Trash2, Image, ImageOff, Eye, EyeOff, Edit2, UserPen, Save, X, Loader2, Code2, Crop, Sparkles, Maximize, ZoomIn, ZoomOut, RefreshCw, Target, CheckCircle2, TrophyIcon, BrainCircuitIcon, BotIcon, WandSparklesIcon, Database } from "lucide-react";
import LatexRenderer from "@/components/latex-renderer";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import CropModal from "@/components/crop-modal";
import { ExpandedImageDialog } from "@/components/expanded-image-dialog";
import { ImageFromCoordinates } from "@/components/image-from-coordinates";
import { stripLatex, formatCurrency, getOptionLabel, stripOptionLabel, parseOptions, getPublicImageUrl } from "@/lib/utils";
import type { Question, TeacherProfile } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest, fetchWithAuth, userQueryKey } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useJobs } from "@/hooks/use-jobs";

export function ImageWithLoader({ src, alt, className, imgClassName }: { src: string, alt: string, className?: string, imgClassName?: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const publicSrc = getPublicImageUrl(src);

  useEffect(() => {
    setIsLoading(true);
  }, [publicSrc]);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoading(false);
    }
  }, [publicSrc, isLoading]);

  return (
    <div className={className || "relative w-full flex items-center justify-center min-h-[200px]"}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-sm z-10 bg-primary/5">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      )}
      {publicSrc && (
        <img
          ref={imgRef}
          src={publicSrc}
          alt={alt}
          className={`${imgClassName || "w-full max-h-[80vh] object-contain rounded-sm"} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
        />
      )}
    </div>
  );
}

interface QuestionCardProps {
  q: Question;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onDelete: () => void;
  difficultyColor: (d: string | null) => string;
}

export function QuestionCard({ q, isExpanded, onToggleExpand, isSelected, onToggleSelect, onDelete, difficultyColor }: QuestionCardProps) {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isExpanded]);

  const { data: profile } = useQuery<TeacherProfile | null>({
    queryKey: userQueryKey(user?.id, "/api/profile"),
    enabled: !!user?.id && authReady,
  });

  const parsedQuestionBounds = useMemo(() => {
    try {
      return q.questionBounds ? (typeof q.questionBounds === 'string' ? JSON.parse(q.questionBounds) : q.questionBounds) : null;
    } catch {
      return null;
    }
  }, [q.questionBounds]);

  const parsedDiagramBounds = useMemo(() => {
    try {
      return q.diagramBounds ? (typeof q.diagramBounds === 'string' ? JSON.parse(q.diagramBounds) : q.diagramBounds) : null;
    } catch {
      return null;
    }
  }, [q.diagramBounds]);

  const optionFormat = useMemo(() => {
    if (!profile?.headerFormat) return "a-b-c-d";
    try {
      const parsed = JSON.parse(profile.headerFormat);
      return parsed.optionNumbering || "a-b-c-d";
    } catch {
      return "a-b-c-d";
    }
  }, [profile]);

  const [localDiagramType, setLocalDiagramType] = useState((q as any).diagramType || 'latex');

  useEffect(() => {
    setLocalDiagramType((q as any).diagramType || 'latex');
  }, [(q as any).diagramType]);

  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropMode, setCropMode] = useState<"edit" | "regenerate">("regenerate");
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isEditing && localDiagramType === 'latex' && !q.diagramLatex) {
      setLocalDiagramType('image');
    }
  }, [isEditing, q.diagramLatex]);
  const [editForm, setEditForm] = useState({
    isDiagramHidden: q.isDiagramHidden || false,
    latexContent: q.latexContent || "",
    diagramLatex: q.diagramLatex || "",
    optionsLatex: (q as any).optionsLatex || "",
    answerLatex: (q as any).answerLatex || "",
    isSystemGeneratedAnswer: (q as any).isSystemGeneratedAnswer || false,
    isAnswerExtractedFromImage: (q as any).isAnswerExtractedFromImage || false,
    isAnswerEditedByUser: (q as any).isAnswerEditedByUser || false
  });

  useEffect(() => {
    setEditForm({
      isDiagramHidden: q.isDiagramHidden || false,
      latexContent: q.latexContent || "",
      diagramLatex: q.diagramLatex || "",
      optionsLatex: (q as any).optionsLatex || "",
      answerLatex: (q as any).answerLatex || "",
      isSystemGeneratedAnswer: (q as any).isSystemGeneratedAnswer || false,
      isAnswerExtractedFromImage: (q as any).isAnswerExtractedFromImage || false,
      isAnswerEditedByUser: (q as any).isAnswerEditedByUser || false
    });
  }, [q]);

  const { jobs } = useJobs();
  const isRegenerating = jobs?.some(j => j.type === "regenerate_figure" && (j.status === "pending" || j.status === "processing") && j.data?.questionId === q.id && j.data?.source === "library");
  const isGeneratingAnswer = jobs?.some(j => j.type === "generate_answer" && (j.status === "pending" || j.status === "processing") && j.data?.questionId === q.id && j.data?.source === "library");

  useEffect(() => {
    const completedJob = jobs?.find(j => j.type === "regenerate_figure" && j.status === "completed" && j.data?.questionId === q.id && j.data?.source === "library");
    if (completedJob) {
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
      fetchWithAuth(`/api/jobs/${completedJob.id}`, { method: 'DELETE' }).then(() => {
        queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/jobs") });
      }).catch(console.error);
    }

    const completedAnswerJob = jobs?.find(j => j.type === "generate_answer" && j.status === "completed" && j.data?.questionId === q.id && j.data?.source === "library");
    if (completedAnswerJob) {
      if (completedAnswerJob.result?.answerLatex) {
        setEditForm(prev => ({ ...prev, answerLatex: completedAnswerJob.result.answerLatex, isSystemGeneratedAnswer: true, isAnswerEditedByUser: false, isAnswerExtractedFromImage: false }));
      }
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
      fetchWithAuth(`/api/jobs/${completedAnswerJob.id}`, { method: 'DELETE' }).then(() => {
        queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/jobs") });
      }).catch(console.error);
    }
  }, [jobs, q.id, queryClient, toast]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/questions/${q.id}`, data);
      return res.json();
    },
    onSuccess: (updatedData, variables) => {
      // Update the cache immediately with the server-returned data to avoid flickering
      queryClient.setQueryData(userQueryKey(user?.id, "/api/questions"), (old: any) => {
        if (!old) return old;
        return old.map((oldQ: any) => oldQ.id === q.id ? updatedData : oldQ);
      });

      if (variables.diagramType !== undefined && Object.keys(variables).length === 1) {
        toast({ title: "Diagram Preference Updated" });
      } else if (variables.isDiagramHidden !== undefined && Object.keys(variables).length === 1) {
        toast({ title: variables.isDiagramHidden ? "Diagram Disabled" : "Diagram Enabled" });
      } else if (variables.imageUrl !== undefined) {
        toast({ title: "Diagram Updated" });
      } else {
        toast({ title: "Question updated successfully" });
      }
    },
    onError: () => {
      toast({ title: "Failed to update question", variant: "destructive" });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async (data: { imageBase64: string }) => {
      const res = await apiRequest("POST", "/api/questions/regenerate-figure", {
        imageBase64: data.imageBase64,
        questionText: q.latexContent,
        questionId: q.id,
        source: "library",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setIsCropModalOpen(false);
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/jobs") });
      toast({ title: data.message || "Regeneration started" });
    },
    onError: () => {
      toast({ title: "Failed to start regeneration", variant: "destructive" });
    }
  });

  const generateAnswerMutation = useMutation({
    mutationFn: async (style: string) => {
      const res = await apiRequest("POST", "/api/generate-answer", {
        latexContent: editForm.latexContent,
        optionsLatex: editForm.optionsLatex,
        imageUrl: q.imageUrl,
        style,
        questionId: q.id,
        source: "library"
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/jobs") });
      toast({ title: data.message || "Answer generation started" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate(editForm);
    // Instant UI feedback to close edit mode;
    // the mutation will process in the background and update the query cache on success
    setIsEditing(false);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditForm({
      isDiagramHidden: q.isDiagramHidden || false,
      latexContent: q.latexContent || "",
      diagramLatex: q.diagramLatex || "",
      optionsLatex: (q as any).optionsLatex || "",
      answerLatex: (q as any).answerLatex || "",
      isSystemGeneratedAnswer: (q as any).isSystemGeneratedAnswer || false,
      isAnswerExtractedFromImage: (q as any).isAnswerExtractedFromImage || false,
      isAnswerEditedByUser: (q as any).isAnswerEditedByUser || false
    });
  };

  const submittedById = (q as any).submittedBy || q.userId;
  const { data: submitterUser } = useQuery({
    queryKey: ["/api/users", submittedById],
    queryFn: async () => {
      if (submittedById === user?.id) return user;
      const res = await fetch(`/api/users/${submittedById}/basic`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!submittedById && submittedById !== user?.id,
  });

  const displayUser = submittedById === user?.id ? user : submitterUser;
  const submitterName = displayUser?.firstName
    ? `${displayUser.firstName} ${displayUser.lastName || ''}`.trim()
    : (displayUser?.email || "Unknown Tutor");

  const naturallyHasDiagram = !!(q.hasDiagram || q.diagramLatex || (q.imageUrl && parsedDiagramBounds));

  const parsedOptions = useMemo(() => {
    const raw = isEditing ? editForm.optionsLatex : (q as any).optionsLatex;
    if (!raw) return [];
    if (isEditing) return [raw]; // keep as textarea if editing
    return parseOptions(raw);
  }, [isEditing, editForm.optionsLatex, (q as any).optionsLatex]);

  const actionIcons = (
    <>
      {isExpanded && !isEditing && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} title="Edit">
          <Edit2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
      {isEditing && (
        <>
          <Button variant="ghost" size="icon" onClick={handleSave} disabled={updateMutation.isPending} title="Save" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
            <Save className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleCancelEdit} title="Cancel" className="text-muted-foreground">
            <X className="w-4 h-4" />
          </Button>
        </>
      )}
      {!isEditing && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} title={isExpanded ? "Collapse" : "Expand"}>
          {isExpanded ? (
            <EyeOff className="w-4 h-4 text-amber-800" />
          ) : (
            <Eye className="w-4 h-4 text-primary/90" />
          )}
        </Button>
      )}
    </>
  );

  return (
    <Card
      ref={cardRef}
      className={`cursor-pointer transition-all relative w-full max-w-full overflow-hidden ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}
      onClick={() => { if (!isEditing) onToggleExpand(); }}
      data-testid={`card-library-question-${q.id}`}
    >
      <CardContent className="p-4 pt-4 relative">
        {/* Top left corner checkbox */}
        <div className="absolute top-[36px] left-4 -translate-y-1/2 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelect(checked as boolean)}
          />
        </div>

        {/* Action icons */}
        <div className="absolute top-[36px] right-4 -translate-y-1/2 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {actionIcons}
        </div>

        {/* Content area */}
        <div className={`pl-10 min-w-0 ${isExpanded ? 'pr-12' : 'pr-10'}`}>
          <div className={`flex flex-col mb-2 ${isExpanded ? 'pr-8' : 'pr-5'}`}>
            {q.chapter && (
              <span className="text-[10px] font-semibold tracking-wider text-primary/90 uppercase mb-0.5 break-words">
                {q.chapter}
              </span>
            )}

            {/* Desktop: topic and badges inline. Mobile: topic block, badges full width below. */}
            <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 sm:gap-0 mt-1 sm:mt-0">
              {/* Topic */}
              <span className="text-base font-bold sm:mr-3 w-full sm:w-auto pr-10 sm:pr-0">
                {q.topic}
              </span>

              {/* Badges container */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-[110%] sm:w-auto mt-1 sm:mt-0">
                <Badge variant="secondary" className="text-xs">{q.subject}</Badge>

                <Badge variant="outline" className={`text-xs ${difficultyColor(q.difficulty)}`}>
                  {q.difficulty}
                </Badge>

                <Badge variant="outline" className="text-xs bg-blue-700/10 text-blue-500 border-blue-700/20">
                  <TrophyIcon className="w-3 h-3 mr-1.5 text-foreground" />
                  {q.marks} Marks
                </Badge>

                {naturallyHasDiagram && !isEditing && !q.isDiagramHidden && (
                  <Badge variant="outline" className="text-xs">
                    <Image className="w-3 h-3 mr-1.5" />
                    Diagram
                  </Badge>
                )}
                {naturallyHasDiagram && isEditing && (
                  <Badge
                    variant="outline"
                    className={`text-xs cursor-pointer transition-colors ${q.isDiagramHidden ? 'border-primary text-primary hover:bg-primary/10' : 'border-destructive text-destructive hover:bg-destructive/10'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMutation.mutate({ isDiagramHidden: !q.isDiagramHidden });
                    }}
                    title={q.isDiagramHidden ? "Enable Diagram" : "Disable Diagram"}
                  >
                    {q.isDiagramHidden ? <Image className="w-3 h-3 mr-1.5" /> : <ImageOff className="w-3 h-3 mr-1.5" />}
                    {q.isDiagramHidden ? "Enable Diagram" : "Disable Diagram"}
                  </Badge>
                )}

                {/* Solved Badge */}
                {((q as any).answerLatex && (q as any).answerLatex.trim() !== '') && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${(q as any).isAnswerEditedByUser ? 'bg-orange-500/10 text-foreground border-orange-500/20' :
                      (!(q as any).isAnswerEditedByUser && (q as any).isAnswerExtractedFromImage) ? 'bg-teal-500/10 text-foreground border-teal-500/20' :
                        (!(q as any).isAnswerEditedByUser && !(q as any).isAnswerExtractedFromImage && (q as any).isSystemGeneratedAnswer) ? 'bg-violet-500/10 text-foreground border-violet-500/20' :
                          'bg-muted text-muted-foreground'} `}
                  >
                    {(q as any).isAnswerEditedByUser ? (
                      <UserPen className="w-3 h-3 mr-1.5 text-orange-500" />
                    ) : (!(q as any).isAnswerEditedByUser && (q as any).isAnswerExtractedFromImage) ? (
                      <Image className="w-3 h-3 mr-1.5 text-teal-500" />
                    ) : (!(q as any).isAnswerEditedByUser && !(q as any).isAnswerExtractedFromImage && (q as any).isSystemGeneratedAnswer) ? (
                      <Sparkles className="w-3 h-3 mr-1.5 text-violet-500" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 mr-1.5" />
                    )}
                    Solved
                  </Badge>
                )}

                {user?.role === "admin" && (q as any).aiCost !== undefined && (q as any).aiCost > 0 && (
                  <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 bg-emerald-500/5" title={`${(q as any).totalTokens} tokens`}>
                    {formatCurrency((q as any).aiCost, user?.currency || "USD")}
                  </Badge>
                )}

                {isRegenerating && (
                  <Badge variant="secondary" className="bg-transparent text-primary">
                    <Loader2 className="w-4 h-4 animate-spin ml-[-5px]" />
                  </Badge>
                )}
                {isGeneratingAnswer && (
                  <Badge variant="secondary" className="bg-transparent text-primary">
                    <Loader2 className="w-4 h-4 animate-spin ml-[-5px]" />
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {!isExpanded && (
            <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-1 mt-5 sm:mt-1">
              {stripLatex(q.latexContent).substring(0, 175)}...
            </p>
          )}
        </div>

        {isExpanded && (
          <div className="mt-6 sm:mt-4 pt-4 border-t border-border/50 space-y-4 cursor-default w-full max-w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* Top Row: Question and Diagram */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className={`flex-1 min-w-0 flex flex-col`}>
                <div className="p-4 rounded-md bg-muted/40 h-full">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Question</h3>
                  {isEditing ? (
                    <div className="max-w-full">
                      <Textarea
                        value={editForm.latexContent}
                        onChange={e => setEditForm({ ...editForm, latexContent: e.target.value })}
                        className="min-h-[150px] font-mono text-xs max-w-full"
                      />
                    </div>
                  ) : (
                    <div className="max-w-full overflow-x-auto overflow-y-hidden">
                      <LatexRenderer content={q.latexContent} />
                    </div>
                  )}
                </div>
              </div>

              {(isEditing || (!q.isDiagramHidden && (q.diagramLatex || editForm.diagramLatex || q.hasDiagram || (q.imageUrl && parsedDiagramBounds)))) && (
                <div className={`w-full shrink-0 flex flex-col ${isEditing ? 'md:w-2/5' : 'md:w-1/3 md:min-w-[280px] md:max-w-[40%]'}`}>
                  <div className="w-full rounded-md bg-muted/40 h-full p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagram</h3>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {isEditing ? (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-6 h-6 text-muted-foreground bg-background/80 backdrop-blur-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCropMode("edit");
                                setIsCropModalOpen(true);
                              }}
                              disabled={!q.imageUrl}
                              title="Set Crop Bounds"
                            >
                              <Crop className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-6 h-6 text-muted-foreground bg-background/80 backdrop-blur-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCropMode("regenerate");
                                setIsCropModalOpen(true);
                              }}
                              disabled={!q.imageUrl || isRegenerating}
                              title="Regenerate LaTeX"
                            >
                              {isRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparklesIcon className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-6 h-6 text-muted-foreground bg-background/80 backdrop-blur-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newType = localDiagramType === 'latex' ? 'image' : 'latex';
                                setLocalDiagramType(newType);
                              }}
                              title={localDiagramType === 'latex' ? "Switch to Image Mode" : "Switch to LaTeX Mode"}
                            >
                              {localDiagramType === 'latex' ? <Image className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                            </Button>
                          </>
                        ) : (
                          (q.diagramLatex || q.hasDiagram || (q.imageUrl && parsedDiagramBounds)) && (
                            <>
                              {((q.diagramLatex) && (q.hasDiagram || (q.imageUrl && parsedDiagramBounds))) && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="w-6 h-6 text-muted-foreground bg-background/80 backdrop-blur-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newType = localDiagramType === 'latex' ? 'image' : 'latex';
                                    setLocalDiagramType(newType);
                                    updateMutation.mutate({ diagramType: newType });
                                  }}
                                  title={localDiagramType === 'latex' ? "Show Image Diagram" : "Show LaTeX Diagram"}
                                >
                                  {localDiagramType === 'latex' ? <Image className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                className="w-6 h-6 text-muted-foreground bg-background/80 backdrop-blur-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsExpandedViewOpen(true);
                                }}
                                title="Expand Diagram"
                              >
                                <Maximize className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      (localDiagramType === 'latex' ? (
                        <>
                          <Textarea
                            value={editForm.diagramLatex}
                            onChange={e => setEditForm({ ...editForm, diagramLatex: e.target.value })}
                            className="min-h-[150px] font-mono text-xs mb-2 max-w-full"
                            placeholder="LaTeX/TikZ code for diagram..."
                          />
                          {editForm.diagramLatex && (
                            <div className="w-full flex items-center justify-center mt-2 border-t pt-2">
                              <span className="text-xs text-muted-foreground mb-1 block self-start w-full">Preview:</span>
                              <LatexRenderer content="" diagramLatex={editForm.diagramLatex} alignment="center" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-full flex-1 min-h-[150px] border rounded-md bg-muted/30 flex items-center justify-center p-2 relative flex-col overflow-hidden">
                          {(q.imageUrl && parsedDiagramBounds) ? (
                            <ImageFromCoordinates
                              src={q.imageUrl}
                              bounds={parsedDiagramBounds}
                              alt="Cropped Diagram"
                            />
                          ) : (q.hasDiagram && q.imageUrl) ? (
                            <ImageWithLoader
                              src={q.imageUrl}
                              alt="Diagram"
                              imgClassName="max-w-full max-h-[300px] object-contain rounded-sm"
                            />
                          ) : (
                            <div className="text-center py-4">
                              <ImageOff className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                              <span className="text-xs text-muted-foreground block">No diagram available.</span>
                              <span className="text-[10px] text-muted-foreground block mt-1">Click the crop button above to set bounds from the original image.</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="w-full flex items-center justify-center p-0 flex-1 pt-2">
                        <LatexRenderer
                          content=""
                          diagramLatex={q.diagramLatex}
                          imageUrl={(!q.hasDiagram && !parsedDiagramBounds) ? null : q.imageUrl}
                          diagramBounds={parsedDiagramBounds}
                          diagramType={localDiagramType}
                          alignment="center"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Row: Options and Solution */}
            <div className="flex flex-col md:flex-row gap-4">
              {/* Options Section */}
              {(isEditing || parsedOptions.length > 0) && (
                <div className={`flex-auto max-w-full transition-all duration-300 ${parsedOptions.join('').length < 20 ? 'md:min-w-[15%]' :
                  parsedOptions.join('').length < 50 ? 'md:min-w-[25%]' :
                    parsedOptions.join('').length < 100 ? 'md:min-w-[35%]' : 'md:min-w-[45%] md:max-w-full'
                  }`}>
                  <div className="p-4 rounded-md bg-muted/40 h-full">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Options</h3>
                    {isEditing ? (
                      <div className="max-w-full">
                        <Textarea
                          value={editForm.optionsLatex}
                          onChange={e => setEditForm({ ...editForm, optionsLatex: e.target.value })}
                          className="min-h-[100px] font-mono text-xs mb-2 max-w-full"
                          placeholder="A. Option 1 \n B. Option 2..."
                        />
                      </div>
                    ) : (
                      <div className={`grid grid-cols-1 ${parsedOptions.some((opt: string) => opt.length > 80) ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-2 mt-2 max-w-full`}>
                        {parsedOptions.map((opt: string, i: number) => (
                          <div key={i} className="flex gap-2 items-start overflow-x-auto overflow-y-hidden max-w-full">
                            <span className="font-semibold shrink-0 text-sm text-foreground pt-1">
                              {getOptionLabel(i, optionFormat)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <LatexRenderer content={stripOptionLabel(opt)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Answer/Solution Section */}
              {(isEditing || (q as any).answerLatex) && (
                <div className={`flex-auto max-w-full transition-all duration-300 ${((q as any).answerLatex || '').toString().length < 150 && parsedOptions.join('').length > 0
                  ? 'md:max-w-[40%] md:min-w-[20%]'
                  : (parsedOptions.join('').length < 50 && parsedOptions.join('').length > 0)
                    ? 'md:max-w-[85%] md:min-w-[40%]'
                    : 'md:max-w-full md:min-w-[40%]'
                  }`}>
                  <div className="p-4 rounded-md bg-muted/40 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Answer & Solution
                      </h3>
                      <div className="flex items-center gap-2">
                        {isEditing && (
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
                        )}
                        {(!isEditing && (q as any).isAnswerEditedByUser) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-help">
                                  <UserPen className="w-3.5 h-3.5" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edited by user</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {(!isEditing && !(q as any).isAnswerEditedByUser && (q as any).isAnswerExtractedFromImage) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center p-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-help">
                                  <Image className="w-3.5 h-3.5" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Answer extracted from image</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {(!isEditing && !(q as any).isAnswerEditedByUser && !(q as any).isAnswerExtractedFromImage && (q as any).isSystemGeneratedAnswer) && (
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
                        {(!isEditing && (q as any).masterQuestionId) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center p-1 rounded-md bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors cursor-help">
                                  <Database className="w-3.5 h-3.5" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Standardized from Master Library</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <Textarea
                        value={editForm.answerLatex}
                        onChange={e => setEditForm({ ...editForm, answerLatex: e.target.value, isAnswerEditedByUser: true, isSystemGeneratedAnswer: false, isAnswerExtractedFromImage: false })}
                        className="min-h-[100px] font-mono text-xs mb-2"
                        placeholder="Solution text..."
                      />
                    ) : (
                      <div className="break-words max-w-full overflow-x-auto overflow-y-hidden">
                        <LatexRenderer content={(q as any).answerLatex} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Expanded Diagram View Dialog */}
            {isExpandedViewOpen && (q.diagramLatex || q.hasDiagram || (q.imageUrl && parsedDiagramBounds)) && (
              <ExpandedImageDialog
                open={isExpandedViewOpen}
                onOpenChange={setIsExpandedViewOpen}
                title="Expanded Diagram View"
              >
                <LatexRenderer
                  content=""
                  diagramLatex={q.diagramLatex}
                  imageUrl={(!q.hasDiagram && !parsedDiagramBounds) ? null : q.imageUrl}
                  diagramBounds={parsedDiagramBounds}
                  diagramType={localDiagramType}
                  className="w-full flex items-center justify-center"
                  forceLightMode={true}
                />
              </ExpandedImageDialog>
            )}

            {/* Footer row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 pt-4 border-t">
              <div className="text-xs text-muted-foreground shrink-0">
                Submitted by: {submitterName}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {q.imageUrl && (
                  <TooltipProvider>
                    <Tooltip>
                      <ExpandedImageDialog
                        title="Source Image"
                        trigger={
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="text-xs h-8">
                              <Image className="w-3.5 h-3.5 text-primary" />
                            </Button>
                          </TooltipTrigger>
                        }
                      >
                        <ImageWithLoader src={q.imageUrl} alt="Source" />
                      </ExpandedImageDialog>
                      <TooltipContent>
                        <p>View Uploaded Source Image</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {q.imageUrl && parsedQuestionBounds && (
                  <ExpandedImageDialog
                    title="Cropped Question Image"
                    trigger={
                      <Button variant="outline" size="sm" className="text-xs h-8">
                        <Crop className="w-3.5 h-3.5 mr-1.5" />
                        Question Image
                      </Button>
                    }
                  >
                    <ImageFromCoordinates src={q.imageUrl} bounds={parsedQuestionBounds} alt="Cropped Question" />
                  </ExpandedImageDialog>
                )}
                {((q.imageUrl && parsedDiagramBounds) || (q.hasDiagram && q.imageUrl && !parsedDiagramBounds)) && (
                  <ExpandedImageDialog
                    title={parsedDiagramBounds ? "Cropped Diagram Image" : "Diagram Image"}
                    trigger={
                      <Button variant="outline" size="sm" className="text-xs h-8">
                        {parsedDiagramBounds ? <Crop className="w-3.5 h-3.5 mr-1.5" /> : <Image className="w-3.5 h-3.5 mr-1.5" />}
                        Diagram Image
                      </Button>
                    }
                  >
                    {parsedDiagramBounds ? (
                      <ImageFromCoordinates src={q.imageUrl} bounds={parsedDiagramBounds} alt="Diagram" />
                    ) : (
                      <ImageWithLoader src={q.imageUrl} alt="Diagram" imgClassName="max-w-full max-h-[80vh] object-contain rounded-sm" />
                    )}
                  </ExpandedImageDialog>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
        {
          isCropModalOpen && (q.imageUrl || q.imageUrl) && (
            <CropModal
              isOpen={isCropModalOpen}
              onClose={() => setIsCropModalOpen(false)}
              imageUrl={(q.imageUrl || q.imageUrl)!}
              initialCrop={parsedDiagramBounds || undefined}
              mode={cropMode}
              onConfirm={(base64Image, bounds) => {
                if (cropMode === "edit") {
                  updateMutation.mutate({ diagramBounds: bounds, hasDiagram: true, isDiagramHidden: false });
                  setIsCropModalOpen(false);
                } else {
                  regenerateMutation.mutate({ imageBase64: base64Image });
                }
              }}
              isLoading={updateMutation.isPending || regenerateMutation.isPending}
            />
          )
        }
      </CardContent >
    </Card >
  );
}
