import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, CheckSquare, Zap, Image as ImageIcon, Search, Columns, Rows, Filter, Edit, ChevronDown, ChevronUp, CalculatorIcon, BadgeCheck, Trophy, Bot, CheckSquare2, Keyboard, DraftingCompass } from "lucide-react";
import LatexRenderer from "@/components/latex-renderer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpandedImageDialog } from "@/components/expanded-image-dialog";
import { AuthImage } from "@/components/auth-image";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";

function ToggleableDiagram({ diagramLatex, imageUrl, diagramBounds, diagramType }: any) {
  const [show, setShow] = useState(false);

  if (!show) {
    return (
      <Button variant="outline" className="w-full mb-4 border-dashed" onClick={() => setShow(true)}>
        <ImageIcon className="w-4 h-4 mr-2" /> Load Diagram
      </Button>
    );
  }

  return (
    <div className="mb-4 p-4 border border-dashed rounded-lg bg-muted/5">
      <LatexRenderer
        content=""
        diagramLatex={diagramLatex}
        imageUrl={imageUrl}
        diagramBounds={diagramBounds}
        diagramType={diagramType}
      />
    </div>
  );
}

function EditProposedDialog({ open, onOpenChange, exceptionId, initialData, onSave }: any) {
  const [editedLatex, setEditedLatex] = useState("");
  const [editedOptions, setEditedOptions] = useState("");
  const [editedAnswer, setEditedAnswer] = useState("");
  const [editedDiagram, setEditedDiagram] = useState("");

  useEffect(() => {
    if (open && initialData) {
      setEditedLatex(initialData.latexContent || "");
      setEditedOptions(initialData.optionsLatex || "");
      setEditedAnswer(initialData.answerLatex || "");
      setEditedDiagram(initialData.diagramLatex || "");
    }
  }, [open, initialData]);

  const handleSave = () => {
    onSave(exceptionId, {
      latexContent: editedLatex,
      optionsLatex: editedOptions,
      answerLatex: editedAnswer,
      diagramLatex: editedDiagram,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Proposed Question (ID: {exceptionId})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Question Text (LaTeX)</label>
            <Textarea
              value={editedLatex}
              onChange={(e) => setEditedLatex(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Options (LaTeX)</label>
            <Textarea
              value={editedOptions}
              onChange={(e) => setEditedOptions(e.target.value)}
              className="min-h-[80px] font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Answer (LaTeX)</label>
            <Textarea
              value={editedAnswer}
              onChange={(e) => setEditedAnswer(e.target.value)}
              className="min-h-[80px] font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Diagram (TikZ/LaTeX)</label>
            <Textarea
              value={editedDiagram}
              onChange={(e) => setEditedDiagram(e.target.value)}
              className="min-h-[80px] font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Preview</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSnippet(latex: string) {
  if (!latex) return "";
  let clean = latex
    .replace(/(?<!\\)\$([\s\S]*?)(?<!\\)\$/g, ' $1 ')
    .replace(/\$\$[\s\S]*?(?:\$\$|$)/g, ' ')
    .replace(/\\\[[\s\S]*?(?:\\\]|$)/g, ' ')
    .replace(/\\begin\{[\s\S]*?\}[\s\S]*?(?:\\end\{[\s\S]*?\}|$)/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[\{\}\^_]/g, '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean.length > 150 ? clean.substring(0, 150) + "..." : clean;
}

function Snippet({ content }: { content: string }) {
  // First, check if the raw content looks like a known, self-contained error message.
  const isRawContentError = /^(KaTeX parse error|Missing .*? argument|Got an unexpected character|Invalid environment name)/i.test(content || "");

  if (isRawContentError) {
    return (
      <span className="text-amber-600 dark:text-amber-500 font-mono text-xs inline-flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate" title={content}>{content}</span>
      </span>
    );
  }

  // If not a raw error, generate a clean snippet.
  const snippet = getSnippet(content);

  return <>{snippet}</>;
}

function ProposedEditItem({ exception, userQuestion, localEdit, selectedId, toggleSelection, masterId, isFirst, isFocused }: any) {
  const [isExpanded, setIsExpanded] = useState(true);

  const activeQuestion = localEdit ? { ...userQuestion, ...localEdit } : userQuestion;

  return (
    <div
      id={`exception-container-${exception.id}`}
      className={`bg-background border rounded-xl p-0 shadow-sm transition-all duration-200 overflow-hidden ${isFocused && selectedId === exception.id
        ? 'ring-2 ring-primary border-primary shadow-md bg-primary/5'
        : isFocused
          ? 'ring-2 ring-blue-500/60 border-blue-500/60 shadow-md'
          : selectedId === exception.id
            ? 'ring-2 ring-primary border-primary'
            : 'hover:border-primary/40 hover:shadow-md'
        }`}
    >
      <div
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-3 border-b bg-muted/20 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-wrap items-center gap-3">
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          <div className="font-semibold text-base text-foreground/90 shrink-0 flex items-center gap-2">
            Edit #{activeQuestion.id}
            {localEdit && <Edit className="w-4 h-4 text-amber-500" />}
          </div>
          {exception.aiScore !== null && exception.aiScore !== undefined && (
            <Badge variant="secondary" className={`font-medium text-xs h-6 px-2 flex items-center shrink-0 ${exception.aiScore >= 95 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              exception.aiScore >= 80 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              }`}>
              {exception.aiScore}% Match
            </Badge>
          )}

          <div className="flex gap-1.5 shrink-0">
            {activeQuestion.hasDiagram && <Badge variant="outline" className="font-medium text-xs h-6 px-2 flex items-center bg-background">Diagram</Badge>}
            {activeQuestion.optionsLatex && <Badge variant="outline" className="font-medium text-xs h-6 px-2 flex items-center bg-background">Options</Badge>}
            {activeQuestion.answerLatex && <Badge variant="outline" className="font-medium text-xs h-6 px-2 flex items-center bg-background">Answer</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-3 self-end lg:self-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          {isExpanded && activeQuestion.imageUrl && activeQuestion.imageUrl.trim() !== "" && (
            <ExpandedImageDialog
              title={`User Edit Image #${activeQuestion.id}`}
              trigger={
                <Button variant="outline" size="icon" className="h-8 w-8 bg-background shadow-sm" title="Source Image">
                  <ImageIcon className="w-4 h-4 text-primary/70" />
                </Button>
              }
            >
              <AuthImage src={activeQuestion.imageUrl} alt="User Edit" className="max-w-full max-h-full object-contain" />
            </ExpandedImageDialog>
          )}

          <div className="flex items-center gap-2 lg:pl-4 lg:border-l border-border/50">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:inline">Select</span>
            <Checkbox
              id={`exception-${exception.id}`}
              checked={selectedId === exception.id}
              onCheckedChange={() => toggleSelection(masterId, exception.id)}
              className="w-5 h-5 rounded-sm mr-2"
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col border-t border-border/50">
          <div className="p-4 overflow-y-auto max-h-[50vh] xl:max-h-[60vh] bg-muted/5">
            <LatexRenderer
              content={activeQuestion.latexContent}
              diagramLatex=""
            />

            {activeQuestion.diagramLatex && activeQuestion.diagramLatex.trim() !== "" && (
              <div className="mt-4">
                <ToggleableDiagram
                  diagramLatex={activeQuestion.diagramLatex}
                  imageUrl={activeQuestion.imageUrl}
                  diagramBounds={activeQuestion.diagramBounds}
                  diagramType={activeQuestion.diagramType}
                />
              </div>
            )}

            {activeQuestion.optionsLatex && (
              <div className="mt-4 pt-3 border-t border-dashed">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Options</h4>
                <div className="text-sm">
                  <LatexRenderer content={activeQuestion.optionsLatex} />
                </div>
              </div>
            )}
            {activeQuestion.answerLatex && (
              <div className="mt-4 p-3 bg-emerald-500/5 rounded-lg text-sm border border-emerald-500/20">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <Check className="w-3.5 h-3.5" />
                  Proposed Answer
                </div>
                <LatexRenderer content={activeQuestion.answerLatex} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminExceptionsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEdits, setSelectedEdits] = useState<Record<number, number>>({});
  const [localEdits, setLocalEdits] = useState<Record<number, any>>({});
  const [editingExceptionId, setEditingExceptionId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"side-by-side" | "stacked">("side-by-side");
  const [autoApproveModalOpen, setAutoApproveModalOpen] = useState(false);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(100);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(-1);
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [expandedAccordions, setExpandedAccordions] = useState<string[]>([]);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [recalculatingIds, setRecalculatingIds] = useState<Set<number>>(new Set());
  const [isBatchRecalculating, setIsBatchRecalculating] = useState(false);

  // Filters
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterTopic, setFilterTopic] = useState("all");
  const [filterText, setFilterText] = useState("");

  const { data: groupedExceptions, isLoading } = useQuery({
    queryKey: ["/api/admin/master-questions/exceptions"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/master-questions/exceptions`);
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data?: any }) => {
      const res = await apiRequest("POST", `/api/admin/master-questions/exceptions/${id}/approve`, data || {});
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      setSelectedEdits(prev => {
        const next = { ...prev };
        const masterId = Object.keys(next).find(k => next[Number(k)] === variables.id);
        if (masterId) {
          delete next[Number(masterId)];
        }
        return next;
      });
      toast({ title: "Approved", description: "Master question updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve exception", variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/master-questions/exceptions/${id}/reject`);
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
      setSelectedEdits(prev => {
        const next = { ...prev };
        const masterId = Object.keys(next).find(k => next[Number(k)] === variables);
        if (masterId) {
          delete next[Number(masterId)];
        }
        return next;
      });
      toast({ title: "Rejected", description: "Exception rejected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject exception", variant: "destructive" });
    }
  });

  const batchApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", `/api/admin/master-questions/exceptions/batch-approve`, { ids });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      setSelectedEdits({});
      toast({ title: "Batch Approved", description: "Selected exceptions approved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to batch approve exceptions", variant: "destructive" });
    }
  });

  const autoApproveMutation = useMutation({
    mutationFn: async (threshold: number) => {
      const res = await apiRequest("POST", `/api/admin/master-questions/exceptions/auto-approve`, { threshold });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      toast({ title: "Auto-Approved", description: `Auto-approved ${data.count || 0} matches above threshold.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-approve matches", variant: "destructive" });
    }
  });

  const filteredExceptions = useMemo(() => {
    if (!groupedExceptions) return [];
    return groupedExceptions.filter((group: any) => {
      if (filterSubject !== "all" && group.master.subject !== filterSubject) return false;
      if (filterTopic !== "all" && group.master.topic !== filterTopic) return false;
      if (filterText && !group.master.latexContent?.toLowerCase().includes(filterText.toLowerCase())) return false;
      return true;
    }).map((group: any) => ({
      ...group,
      exceptions: group.exceptions.sort((a: any, b: any) => (b.exception.aiScore || 0) - (a.exception.aiScore || 0))
    })).sort((a: any, b: any) => {
      const maxA = Math.max(0, ...a.exceptions.map((e: any) => Number(e.exception.aiScore || 0)));
      const maxB = Math.max(0, ...b.exceptions.map((e: any) => Number(e.exception.aiScore || 0)));
      return maxB - maxA;
    });
  }, [groupedExceptions, filterSubject, filterTopic, filterText]);

  const handleFocusChange = useCallback((groupIdx: number, itemIdx: number) => {
    const group = filteredExceptions[groupIdx];
    if (group) {
      setExpandedAccordions(prev => {
        if (!prev.includes(group.master.id.toString())) {
          return [...prev, group.master.id.toString()];
        }
        return prev;
      });
      const item = group.exceptions[itemIdx];
      if (item) {
        setTimeout(() => {
          const el = document.getElementById(`exception-container-${item.exception.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }
    }
  }, [filteredExceptions]);

  const toggleSelection = (masterId: number, exceptionId: number) => {
    setSelectedEdits(prev => {
      const next = { ...prev };
      if (next[masterId] === exceptionId) {
        delete next[masterId];
      } else {
        next[masterId] = exceptionId;
      }
      return next;
    });

    // Update focus independent of state updater to avoid anti-pattern
    const gIdx = filteredExceptions.findIndex((g: any) => g.master.id === masterId);
    if (gIdx !== -1) {
      const iIdx = filteredExceptions[gIdx].exceptions.findIndex((e: any) => e.exception.id === exceptionId);
      if (iIdx !== -1) {
        setActiveGroupIndex(gIdx);
        setActiveItemIndex(iIdx);
      }
    }
  };

  const handleBatchApprove = () => {
    const idsToApprove = Object.values(selectedEdits);
    if (idsToApprove.length === 0) return;
    batchApproveMutation.mutate(idsToApprove);
  };

  const handleBatchRecalculate = async () => {
    const selectedMasterIds = Object.keys(selectedEdits).map(Number);
    if (selectedMasterIds.length === 0) return;

    setIsBatchRecalculating(true);
    let totalCount = 0;
    
    try {
      for (const masterId of selectedMasterIds) {
        setRecalculatingIds(prev => new Set(prev).add(masterId));
        try {
          const res = await apiRequest("POST", `/api/admin/master-questions/${masterId}/recalculate-similarity`);
          const data = await res.json();
          totalCount += data.count || 0;
          
          await queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
        } catch (err) {
          console.error(`Failed to recalculate for masterId ${masterId}`, err);
          toast({ title: "Error", description: `Failed to recalculate similarity for Master Question #${masterId}.`, variant: "destructive" });
        } finally {
          setRecalculatingIds(prev => {
            const next = new Set(prev);
            next.delete(masterId);
            return next;
          });
        }
      }
      toast({ title: "Recalculation Complete", description: `Recalculated similarity for ${totalCount} edits.` });
    } finally {
      setIsBatchRecalculating(false);
    }
  };

  const handleRecalculateSingle = async (masterId: number) => {
    setRecalculatingIds(prev => new Set(prev).add(masterId));
    try {
      const res = await apiRequest("POST", `/api/admin/master-questions/${masterId}/recalculate-similarity`);
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions/count"] });
      toast({ title: "Recalculation Complete", description: `Recalculated similarity for ${data.count || 0} edits.` });
    } catch (err) {
      toast({ title: "Error", description: "Failed to start similarity recalculation.", variant: "destructive" });
    } finally {
      setRecalculatingIds(prev => {
        const next = new Set(prev);
        next.delete(masterId);
        return next;
      });
    }
  };

  const editingExceptionInitialData = useMemo(() => {
    if (!editingExceptionId || !groupedExceptions) return null;
    for (const group of groupedExceptions) {
      const found = group.exceptions.find((e: any) => e.exception.id === editingExceptionId);
      if (found) {
        return localEdits[editingExceptionId]
          ? { ...found.userQuestion, ...localEdits[editingExceptionId] }
          : found.userQuestion;
      }
    }
    return null;
  }, [editingExceptionId, groupedExceptions, localEdits]);

  const handleLocalSave = (id: number, data: any) => {
    setLocalEdits(prev => ({ ...prev, [id]: data }));
    toast({ title: "Saved Preview", description: "Your changes have been saved locally. Click Approve to sync with master." });
  };

  const uniqueSubjects = useMemo(() => {
    if (!groupedExceptions) return [];
    const subjects = new Set<string>();
    groupedExceptions.forEach((g: any) => {
      if (g.master.subject) subjects.add(g.master.subject);
    });
    return Array.from(subjects).sort();
  }, [groupedExceptions]);

  const uniqueTopics = useMemo(() => {
    if (!groupedExceptions) return [];
    const topics = new Set<string>();
    groupedExceptions.forEach((g: any) => {
      if (g.master.topic) {
        if (filterSubject === "all" || g.master.subject === filterSubject) {
          topics.add(g.master.topic);
        }
      }
    });
    return Array.from(topics).sort();
  }, [groupedExceptions, filterSubject]);

  const isWorking = approveMutation.isPending || rejectMutation.isPending || batchApproveMutation.isPending || autoApproveMutation.isPending || isBatchRecalculating;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (editingExceptionId !== null || autoApproveModalOpen || keyboardHelpOpen) {
        return;
      }

      const activeGroup = filteredExceptions[activeGroupIndex];
      const activeException = activeGroup ? activeGroup.exceptions[activeItemIndex]?.exception : null;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        if (filteredExceptions.length === 0) return;
        setActiveGroupIndex(prev => {
          const next = Math.min(prev + 1, filteredExceptions.length - 1);
          if (next !== prev) {
            setActiveItemIndex(0);
            handleFocusChange(next, 0);
          }
          return next;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        if (filteredExceptions.length === 0) return;
        setActiveGroupIndex(prev => {
          const next = Math.max(prev - 1, 0);
          if (next !== prev) {
            setActiveItemIndex(0);
            handleFocusChange(next, 0);
          }
          return next;
        });
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        if (!activeGroup) return;
        setActiveItemIndex(prev => {
          const next = Math.min(prev + 1, activeGroup.exceptions.length - 1);
          if (next !== prev) handleFocusChange(activeGroupIndex, next);
          return next;
        });
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        if (!activeGroup) return;
        setActiveItemIndex(prev => {
          const next = Math.max(prev - 1, 0);
          if (next !== prev) handleFocusChange(activeGroupIndex, next);
          return next;
        });
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (activeException && activeGroup) {
          toggleSelection(activeGroup.master.id, activeException.id);
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (filteredExceptions.length > 0) {
          const newSelections: Record<number, number> = {};
          const newExpandedAccordions: string[] = [];
          filteredExceptions.forEach((group: any) => {
            if (group.exceptions && group.exceptions.length > 0) {
              newSelections[group.master.id] = group.exceptions[0].exception.id;
              newExpandedAccordions.push(group.master.id.toString());
            }
          });
          setSelectedEdits(prev => ({ ...prev, ...newSelections }));
          setExpandedAccordions(prev => {
            const combined = new Set([...prev, ...newExpandedAccordions]);
            return Array.from(combined);
          });
        }
      } else if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeException && !isWorking) {
          approveMutation.mutate({ id: activeException.id, data: localEdits[activeException.id] });
        }
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeException && !isWorking) {
          rejectMutation.mutate(activeException.id);
        }
      } else if (e.key === '?') {
        e.preventDefault();
        setKeyboardHelpOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredExceptions, activeGroupIndex, activeItemIndex, localEdits, editingExceptionId, autoApproveModalOpen, keyboardHelpOpen, isWorking, approveMutation, rejectMutation, handleFocusChange]);

  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
      {/* Top Bar with Filters and Auto-Approve */}
      <div className="flex-none flex flex-col xl:flex-row justify-between gap-4 bg-background p-4 px-8 border-b items-start xl:items-center">
        <div className="flex flex-wrap items-center gap-3 flex-1 w-full xl:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" /> :
          </div>

          <Select value={filterSubject} onValueChange={(val) => { setFilterSubject(val); setFilterTopic("all"); }}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {uniqueSubjects.map(sub => (
                <SelectItem key={sub} value={sub}>{sub}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterTopic} onValueChange={setFilterTopic} disabled={uniqueTopics.length === 0}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All Topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Topics</SelectItem>
              {uniqueTopics.map(top => (
                <SelectItem key={top} value={top}>{top}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto justify-between xl:justify-end border-t xl:border-t-0 pt-4 xl:pt-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setKeyboardHelpOpen(true)}
            className="h-8 w-8 text-muted-foreground"
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard className="text-primary/80" />
          </Button>

          <div className="flex items-center bg-muted/50 rounded-md p-1 border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("stacked")}
              className={`h-7 ${Object.keys(selectedEdits).length > 0 ? "px-2" : "px-2.5"} ${viewMode === "stacked" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
              title="Stacked View"
            >
              <Rows className={`w-4 h-4 ${Object.keys(selectedEdits).length > 0 ? "" : "mr-1.5"}`} />
              {Object.keys(selectedEdits).length === 0 && "Stacked"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("side-by-side")}
              className={`h-7 ${Object.keys(selectedEdits).length > 0 ? "px-2" : "px-2.5"} ${viewMode === "side-by-side" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
              title="Side-by-side View"
            >
              <Columns className={`w-4 h-4 ${Object.keys(selectedEdits).length > 0 ? "" : "mr-1.5"}`} />
              {Object.keys(selectedEdits).length === 0 && "Side-by-side"}
            </Button>
          </div>

          {Object.keys(selectedEdits).length > 0 && (
            <div className="flex items-center gap-3 bg-primary/10 pl-3 pr-2 py-1 rounded-full border border-primary/60 mr-2">
              <span className="text-xs font-medium text-primary shrink-0">
                {Object.keys(selectedEdits).length} selected
              </span>
              <Button
                onClick={handleBatchApprove}
                disabled={isWorking}
                size="sm"
                className="h-7 rounded-full shadow-sm text-xs px-3"
              >
                Approve All
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleBatchRecalculate}
                    disabled={isWorking}
                    size="sm"
                    variant="secondary"
                    className="h-7 border-white/40 rounded-full shadow-sm text-xs px-3 ml-1"
                  >
                    {isBatchRecalculating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <DraftingCompass className="w-3.5 h-3.5 text-primary" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Recalculate Similarity for Selected
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEdits({})}
                disabled={isWorking}
                className="h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <Button
            variant="secondary"
            onClick={() => setAutoApproveModalOpen(true)}
            disabled={isWorking}
            className="shrink-0 h-10 px-3 border-blue-500/60 hover:border-blue-500/80"
            title="Auto-Approve Matches"
          >
            <BadgeCheck className="w-5 h-5 text-blue-500" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!filteredExceptions || filteredExceptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border shadow-sm text-center px-4 m-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <CheckSquare className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">No pending exceptions match your current filters. Everything is reviewed and managed.</p>
          </div>
        ) : (
          <Accordion type="multiple" value={expandedAccordions} onValueChange={setExpandedAccordions} className="space-y-5 p-4">
            {filteredExceptions.map((group: any, groupIndex: number) => (
              <AccordionItem key={group.master.id} value={group.master.id.toString()} className="border rounded-xl bg-card overflow-hidden shadow-sm group">
                <AccordionTrigger className="px-5 sm:px-6 py-4 hover:bg-muted/50 transition-colors hover:no-underline [&[data-state=open]]:bg-muted/30">
                  <div className="flex items-center justify-between w-full pr-4 text-left gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col w-full gap-1.5">
                        <h2 className="font-semibold text-base sm:text-lg flex items-center gap-2 flex-wrap text-foreground/90">
                          Master Question #{group.master.id}
                          {group.master.aiScore !== null && group.master.aiScore !== undefined && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-medium">
                              AI Score: {group.master.aiScore}
                            </span>
                          )}
                          {(() => {
                            const exceptionsWithScore = group.exceptions.filter((e: any) => e.exception.aiScore !== null && e.exception.aiScore !== undefined);
                            if (exceptionsWithScore.length > 0) {
                              const topMatch = Math.max(...exceptionsWithScore.map((e: any) => Number(e.exception.aiScore)));
                              return (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-100 border border-purple-500/20 font-medium flex items-center gap-1">
                                  <Trophy className="w-3 h-3 text-purple-600 dark:text-purple-100" />
                                  Top Matching: {topMatch}%
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {(() => {
                            const totalCost = group.exceptions.reduce((sum: number, e: any) => sum + (e.exception.aiCost || 0), 0);
                            if (totalCost > 0) {
                              return (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-100 border border-emerald-500/20 font-medium flex items-center gap-1">
                                  <Bot className="w-3 h-3 text-emerald-600 dark:text-emerald-100" />
                                  AI Cost: ₹ {totalCost.toFixed(4)}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </h2>
                        <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <span className="text-primary/80">{group.master.subject}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                          <span>{group.master.topic}</span>
                        </div>
                      </div>
                      {/* Hide snippet when expanded using group-data-[state=open]:hidden */}
                      <div className="text-sm text-muted-foreground mt-2.5 line-clamp-1 opacity-80 overflow-hidden font-serif group-data-[state=open]:hidden">
                        <Snippet content={group.master.latexContent} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 group-data-[state=closed]:hidden" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 border border-primary/40 hover:border-primary/80"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRecalculateSingle(group.master.id);
                        }}
                        disabled={recalculatingIds.has(group.master.id)}
                        title="Recalculate Similarity"
                      >
                        {recalculatingIds.has(group.master.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DraftingCompass className="w-4 h-4 mr-2 text-primary" />}
                        Recalculate Similarity
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-0 pb-0 border-t bg-muted/10">
                  <div className={`${viewMode === "side-by-side" ? "grid grid-cols-1 xl:grid-cols-2 gap-0 divide-y xl:divide-y-0 xl:divide-x" : "flex flex-col"}`}>
                    {/* Master Question Detail */}
                    <div className={`${viewMode === "side-by-side" ? "p-4 sm:p-5" : "p-4 sm:p-5 border-b"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base text-foreground/80">Original Master Content</h3>
                          {group.master.diagramLatex && group.master.diagramLatex.trim() !== "" && (
                            <Badge variant="outline" className="text-xs font-medium h-6 px-2 bg-background">Diagram</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {group.master.imageUrl && group.master.imageUrl.trim() !== "" && (
                            <ExpandedImageDialog
                              title={`Master Image #${group.master.id}`}
                              trigger={
                                <Button variant="outline" size="icon" className="h-8 w-8 bg-background hover:bg-muted shadow-sm" title="Source Image">
                                  <ImageIcon className="w-4 h-4 text-primary/70" />
                                </Button>
                              }
                            >
                              <AuthImage src={group.master.imageUrl} alt="Master" className="max-w-full max-h-full object-contain" />
                            </ExpandedImageDialog>
                          )}
                        </div>
                      </div>

                      <div className="overflow-y-auto pr-2 bg-background p-4 rounded-xl border shadow-sm max-h-[60vh] xl:max-h-[70vh]">
                        <LatexRenderer
                          content={group.master.latexContent}
                          diagramLatex=""
                        />

                        {group.master.diagramLatex && group.master.diagramLatex.trim() !== "" && (
                          <div className="mt-4">
                            <ToggleableDiagram
                              diagramLatex={group.master.diagramLatex}
                              imageUrl={group.master.imageUrl}
                              diagramBounds={group.master.diagramBounds}
                              diagramType={group.master.diagramType}
                            />
                          </div>
                        )}

                        {group.master.optionsLatex && (
                          <div className="mt-4 pt-3 border-t border-dashed">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Options</h4>
                            <div className="text-sm">
                              <LatexRenderer content={group.master.optionsLatex} />
                            </div>
                          </div>
                        )}
                        {group.master.answerLatex && (
                          <div className="mt-4 p-3 bg-emerald-500/5 rounded-lg text-sm border border-emerald-500/20">
                            <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                              <Check className="w-3.5 h-3.5" />
                              Correct Answer
                            </div>
                            <LatexRenderer content={group.master.answerLatex} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* User Edits List */}
                    <div className="p-4 sm:p-5 bg-background/50 xl:bg-transparent">
                      <div className="flex items-center justify-between mb-4 border-b pb-3">
                        <h3 className="font-semibold text-base text-foreground/80 flex items-center gap-2">
                          Proposed Edits
                          <Badge variant="outline" className="font-normal bg-background shadow-sm">{group.exceptions.length}</Badge>
                        </h3>

                        {selectedEdits[group.master.id] ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 bg-background shadow-sm px-3"
                              onClick={() => setEditingExceptionId(selectedEdits[group.master.id])}
                              disabled={isWorking}
                              title="Edit"
                            >
                              <Edit className="w-4 h-4 mr-1.5" /> Edit
                            </Button>
                            <Button
                              size="icon"
                              variant="default"
                              className="h-8 w-8 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => approveMutation.mutate({ id: selectedEdits[group.master.id], data: localEdits[selectedEdits[group.master.id]] })}
                              disabled={isWorking}
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                              onClick={() => rejectMutation.mutate(selectedEdits[group.master.id])}
                              disabled={isWorking}
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center h-8 text-xs text-muted-foreground italic">Select an edit to approve</div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {group.exceptions
                          .map(({ exception, userQuestion }: any, itemIndex: number) => (
                            <ProposedEditItem
                              key={exception.id}
                              exception={exception}
                              userQuestion={userQuestion}
                              localEdit={localEdits[exception.id]}
                              selectedId={selectedEdits[group.master.id]}
                              toggleSelection={toggleSelection}
                              masterId={group.master.id}
                              isFirst={itemIndex === 0}
                              isFocused={activeGroupIndex === groupIndex && activeItemIndex === itemIndex}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
      <EditProposedDialog
        open={editingExceptionId !== null}
        onOpenChange={(open: boolean) => !open && setEditingExceptionId(null)}
        exceptionId={editingExceptionId}
        initialData={editingExceptionInitialData}
        onSave={handleLocalSave}
      />

      <Dialog open={autoApproveModalOpen} onOpenChange={setAutoApproveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Approve Exceptions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Threshold Percentage</label>
              <Input
                type="number"
                value={autoApproveThreshold}
                onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
                min={0} max={100}
              />
              <p className="text-xs text-muted-foreground">Exceptions with an AI matching score equal to or above this percentage will be automatically approved.</p>
            </div>
            {autoApproveThreshold < 75 && (
              <div className="p-3 bg-amber-500/10 text-amber-600 rounded-md text-sm border border-amber-500/20">
                <strong>Warning:</strong> Setting a threshold below 75% may result in incorrect or poorly matched questions being automatically approved into the master bank. Please proceed with caution.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoApproveModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                autoApproveMutation.mutate(autoApproveThreshold);
                setAutoApproveModalOpen(false);
              }}
              className={autoApproveThreshold < 75 ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-primary/80 dark:bg-primary/60 hover:bg-primary/70 text-white"}
            >
              <CheckSquare2 className="h-4 w-4 mr-1" />
              Auto-Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keyboardHelpOpen} onOpenChange={setKeyboardHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-sm">
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">↓</kbd>
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">j</kbd>
              </div>
              <span className="text-muted-foreground">Next Master Question</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">↑</kbd>
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">k</kbd>
              </div>
              <span className="text-muted-foreground">Previous Master Question</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">→</kbd>
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">l</kbd>
              </div>
              <span className="text-muted-foreground">Next Proposed Edit</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">←</kbd>
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium">h</kbd>
              </div>
              <span className="text-muted-foreground">Previous Proposed Edit</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium px-4">Space</kbd>
              </div>
              <span className="text-muted-foreground">Select / Deselect Edit</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium px-3">a</kbd>
              </div>
              <span className="text-muted-foreground">Approve Focused Edit</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium text-xs">⌘+A</kbd>
              </div>
              <span className="text-muted-foreground">Select Top Matches</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium px-3">r</kbd>
              </div>
              <span className="text-muted-foreground">Reject Focused Edit</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-muted rounded border font-mono font-medium px-3">?</kbd>
              </div>
              <span className="text-muted-foreground">Show this help dialog</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setKeyboardHelpOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
