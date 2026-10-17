import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Search, Trash2, Image, ArrowLeft, Filter, Eye, Edit2, Save, X, CheckCheckIcon, ListCheckIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, userQueryKey } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState, useMemo, useEffect } from "react";
import type { Question } from "@shared/schema";
import LatexRenderer from "@/components/latex-renderer";
import { stripLatex, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { QuestionCard } from "@/components/question-card";

export default function Library() {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterChapter, setFilterChapter] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const scrollToQuestion = (id: number) => {
    setTimeout(() => {
      const element = document.querySelector(`[data-testid="card-library-question-${id}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const expandId = params.get("expand");
    if (expandId) {
      const parsedId = parseInt(expandId, 10);
      setExpandedId(parsedId);
      scrollToQuestion(parsedId);
      // Clean up URL
      navigate("/library", { replace: true });
    }

    const handleExpandEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const parsedId = parseInt(customEvent.detail, 10);
        setExpandedId(parsedId);
        scrollToQuestion(parsedId);
      }
    };

    window.addEventListener('expand-question', handleExpandEvent);
    return () => window.removeEventListener('expand-question', handleExpandEvent);
  }, [navigate]);

  const { data: questions, isLoading, isFetching, isError, refetch } = useQuery<Question[]>({
    queryKey: userQueryKey(user?.id, "/api/questions"),
    enabled: !!user?.id && authReady,
  });

  const loadingQuestions = !authReady || !user?.id || isLoading || isFetching;

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
      toast({ title: "Question deleted" });
    },
  });

  const subjects = useMemo(() => {
    if (!questions) return [];
    return [...Array.from(new Set(questions.map(q => q.subject)))].sort();
  }, [questions]);

  const chapters = useMemo(() => {
    if (!questions) return [];
    const filtered = filterSubject === "all" ? questions : questions.filter(q => q.subject === filterSubject);
    return [...Array.from(new Set(filtered.map(q => q.chapter).filter(Boolean)))].sort();
  }, [questions, filterSubject]);

  const filtered = questions?.filter((q) => {
    const matchSearch = search === "" ||
      q.latexContent.toLowerCase().includes(search.toLowerCase()) ||
      q.topic.toLowerCase().includes(search.toLowerCase()) ||
      q.subject.toLowerCase().includes(search.toLowerCase()) ||
      (q.chapter?.toLowerCase() || "").includes(search.toLowerCase());
    const matchSubject = filterSubject === "all" || q.subject === filterSubject;
    const matchChapter = filterChapter === "all" || q.chapter === filterChapter;
    const matchDifficulty = filterDifficulty === "all" || q.difficulty === filterDifficulty;
    return matchSearch && matchSubject && matchChapter && matchDifficulty;
  }) || [];

  const difficultyColor = (d: string | null) => {
    switch (d) {
      case "easy": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "medium": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      case "hard": return "bg-red-500/10 text-red-600 dark:text-red-400";
      default: return "";
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map(q => q.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedIds.size} questions?`)) {
      try {
        await apiRequest("POST", `/api/questions/batch-delete`, { ids: Array.from(selectedIds) });
        queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/questions") });
        toast({ title: `${selectedIds.size} questions deleted` });
        setSelectedIds(new Set());
      } catch (err) {
        toast({ title: "Failed to delete some questions", variant: "destructive" });
      }
    }
  };

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-library">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-library-title">My Questions</h1>
            <p className="text-sm text-muted-foreground">{questions?.length ?? 0} questions saved</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
                data-testid="input-search"
              />
            </div>

            {/* Mobile Filters Toggle */}
            <div className="sm:hidden shrink-0">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 h-10 w-10">
                    <Filter className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-xl pb-8">
                  <SheetHeader>
                    <SheetTitle>
                      Select Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 mt-6">
                    <Select value={filterSubject} onValueChange={(val) => { setFilterSubject(val); setFilterChapter("all"); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subjects</SelectItem>
                        {subjects.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {chapters.length > 0 && (
                      <Select value={filterChapter} onValueChange={setFilterChapter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chapter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Chapters</SelectItem>
                          {chapters.map(c => (
                            <SelectItem key={c as string} value={c as string}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Desktop Filters */}
          <div className="hidden sm:flex items-center gap-3">
            <Select value={filterSubject} onValueChange={(val) => { setFilterSubject(val); setFilterChapter("all"); }}>
              <SelectTrigger className="w-40" data-testid="select-filter-subject">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chapters.length > 0 && (
              <Select value={filterChapter} onValueChange={setFilterChapter}>
                <SelectTrigger className="w-full sm:w-44" data-testid="select-filter-chapter">
                  <SelectValue placeholder="Chapter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chapters</SelectItem>
                  {chapters.map(c => (
                    <SelectItem key={c as string} value={c as string}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="w-36" data-testid="select-filter-difficulty">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 pb-12 sm:pb-16 w-full">
        {isError ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
            <h3 className="font-medium mb-1">Could not load your questions</h3>
            <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
            <Button onClick={() => refetch()} data-testid="button-retry-library">Retry</Button>
          </div>
        ) : loadingQuestions ? (
          <div className="grid gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-medium mb-1">{questions?.length === 0 ? "No questions added yet" : "No matches found"}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {questions?.length === 0 ? "Start by uploading a photo of your questions" : "Try adjusting your filters"}
            </p>
            {questions?.length === 0 && (
              <Button onClick={() => navigate("/upload")} data-testid="button-upload-from-library">
                Upload Question
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                isExpanded={expandedId === q.id}
                onToggleExpand={() => setExpandedId(expandedId === q.id ? null : q.id)}
                isSelected={selectedIds.has(q.id)}
                onToggleSelect={(checked) => toggleSelect(q.id, checked)}
                onDelete={() => deleteMutation.mutate(q.id)}
                difficultyColor={difficultyColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 sm:left-[16rem] right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border z-50 flex items-center justify-between shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-full pb-6 sm:pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => toggleSelectAll(selectedIds.size !== filtered.length)}
              className={selectedIds.size === filtered.length ? "text-primary border-primary bg-primary/10" : "text-muted-foreground"}
              title="Select All"
            >
              <ListCheckIcon className="w-5 h-5 mr-2 text-primary" />
              {selectedIds.size === filtered.length ? "Select None" : "Select All"}
            </Button>
            <span className="text-sm font-semibold tracking-tight">{selectedIds.size} selected</span>
          </div>
          <Button
            variant="ghost"
            onClick={handleBulkDelete}
            className="shadow-sm text-red-500 border-red-500/40 bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
