import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, userQueryKey } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowLeft, FileText, Loader2, BookOpen, ChevronDown, ChevronUp, Trash2, Plus, ListChecks, MinusCircle, Calendar as CalendarIcon, Search } from "lucide-react";
import type { Question } from "@shared/schema";
import LatexRenderer from "@/components/latex-renderer";
import { stripLatex, cn, getOptionLabel, stripOptionLabel, parseOptions } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export default function CreatePaper() {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(60);
  const [testDate, setTestDate] = useState("");

  const [negativeMarking, setNegativeMarking] = useState(false);
  const [negativeMarkingType, setNegativeMarkingType] = useState("50% of Original");
  const [negativeMarkingQuestionIds, setNegativeMarkingQuestionIds] = useState<number[]>([]);

  const [enableOptions, setEnableOptions] = useState(false);
  const [optionsQuestionIds, setOptionsQuestionIds] = useState<number[]>([]);

  const [instructions, setInstructions] = useState<string[]>([
    "All questions are compulsory.",
    "Use of calculators is not permitted.",
    "Show all working clearly."
  ]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterChapter, setFilterChapter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: questions, isLoading } = useQuery<Question[]>({
    queryKey: userQueryKey(user?.id, "/api/questions"),
    enabled: !!user?.id && authReady,
  });

  const subjects = useMemo(() => {
    if (!questions) return [];
    return [...new Set(questions.map(q => q.subject))].sort();
  }, [questions]);

  const chapters = useMemo(() => {
    if (!questions) return [];
    const filtered = filterSubject === "all" ? questions : questions.filter(q => q.subject === filterSubject);
    return [...new Set(filtered.map(q => q.chapter).filter(Boolean))].sort();
  }, [questions, filterSubject]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedQuestions = questions?.filter(q => selectedIds.includes(q.id)) || [];
      const totalMarks = selectedQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);

      const formattedInstructions = instructions
        .filter(i => i.trim() !== "")
        .map((ins, idx) => `${idx + 1}. ${ins}`)
        .join("\n");

      const res = await apiRequest("POST", "/api/test-papers", {
        title,
        subject: subject || "General",
        questionIds: selectedIds,
        totalMarks,
        negativeMarking,
        negativeMarkingType: negativeMarking ? negativeMarkingType : null,
        negativeMarkingQuestionIds: negativeMarking ? negativeMarkingQuestionIds : [],
        includeOptions: optionsQuestionIds.length > 0,
        optionsQuestionIds,
        duration,
        testDate: testDate || null,
        instructions: formattedInstructions,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/test-papers") });
      toast({ title: "Paper created", description: "Your test paper has been created" });
      navigate(`/papers/${data.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create paper", variant: "destructive" });
    },
  });

  const toggleQuestion = (id: number) => {
    setSelectedIds(prev => {
      const isSelected = prev.includes(id);
      if (isSelected) {
        setOptionsQuestionIds(o => o.filter(x => x !== id));
        setNegativeMarkingQuestionIds(n => n.filter(x => x !== id));
        return prev.filter(x => x !== id);
      } else {
        const q = questions?.find(q => q.id === id);
        if (q) {
          if ((q as any).optionsLatex && enableOptions) setOptionsQuestionIds(o => [...o, id]);
          if (negativeMarking) setNegativeMarkingQuestionIds(n => [...n, id]);
        }
        return [...prev, id];
      }
    });
  };

  const toggleOptionId = (id: number) => {
    setOptionsQuestionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleNegativeMarkingId = (id: number) => {
    setNegativeMarkingQuestionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleEnableOptionsToggle = (checked: boolean) => {
    setEnableOptions(checked);
    if (checked) {
      const ids = selectedIds.filter(id => {
        const q = questions?.find(q => q.id === id);
        return q && (q as any).optionsLatex;
      });
      setOptionsQuestionIds(ids);
    } else {
      setOptionsQuestionIds([]);
    }
  };

  const handleNegativeMarkingToggle = (checked: boolean) => {
    setNegativeMarking(checked);
    if (checked) {
      // Auto-include all currently selected questions
      setNegativeMarkingQuestionIds(selectedIds);

      const hasNegativeInstruction = instructions.some(i => i.toLowerCase().includes("negative marking"));
      if (!hasNegativeInstruction) {
        setInstructions(prev => [
          ...prev,
          "There is negative marking in this examination.",
          `Incorrect answers will carry a penalty of ${negativeMarkingType}. Unanswered questions will receive zero marks.`,
          `Some questions will have negative marking and some will not. Questions with negative marking are indicated beside the total marks. (e.g., [+4, ${(negativeMarkingType === "50% of Original") ? -2 : -1}]).`
        ]);
      }
    } else {
      setNegativeMarkingQuestionIds([]);
      setInstructions(prev => prev.filter(i =>
        !i.toLowerCase().includes("negative marking") &&
        !i.toLowerCase().includes("penalty of") &&
        !i.toLowerCase().includes("negative marks")
      ));
    }
  };

  const handleAddInstruction = () => {
    setInstructions(prev => [...prev, ""]);
  };

  const handleUpdateInstruction = (index: number, value: string) => {
    const newInst = [...instructions];
    newInst[index] = value;
    setInstructions(newInst);
  };

  const handleRemoveInstruction = (index: number) => {
    setInstructions(prev => prev.filter((_, i) => i !== index));
  };

  const filtered = questions?.filter(q => {
    const matchSubject = filterSubject === "all" || q.subject === filterSubject;
    const matchChapter = filterChapter === "all" || q.chapter === filterChapter;
    const matchSearch = searchQuery === "" ||
      q.latexContent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.topic && q.topic.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchSubject && matchChapter && matchSearch;
  }) || [];

  const toggleAllFiltered = () => {
    if (filtered.length === 0) return;
    const allFilteredSelected = filtered.every(q => selectedIds.includes(q.id));

    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map(q => q.id));
      setSelectedIds(prev => prev.filter(id => !filteredIds.has(id)));
      setOptionsQuestionIds(o => o.filter(id => !filteredIds.has(id)));
      setNegativeMarkingQuestionIds(n => n.filter(id => !filteredIds.has(id)));
    } else {
      const newSelectedIds = new Set(selectedIds);
      const newOptionsIds = new Set(optionsQuestionIds);
      const newNegativeIds = new Set(negativeMarkingQuestionIds);

      filtered.forEach(q => {
        if (!newSelectedIds.has(q.id)) {
          newSelectedIds.add(q.id);
          if ((q as any).optionsLatex && enableOptions) newOptionsIds.add(q.id);
          if (negativeMarking) newNegativeIds.add(q.id);
        }
      });

      setSelectedIds(Array.from(newSelectedIds));
      setOptionsQuestionIds(Array.from(newOptionsIds));
      setNegativeMarkingQuestionIds(Array.from(newNegativeIds));
    }
  };

  const selectedQuestions = questions?.filter(q => selectedIds.includes(q.id)) || [];
  const totalMarks = selectedQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);

  const calculateNegativeMarks = () => {
    if (!negativeMarking) return 0;
    const negativeQuestions = selectedQuestions.filter(q => negativeMarkingQuestionIds.includes(q.id));
    return negativeQuestions.reduce((sum, q) => {
      let penalty = 0;
      if (negativeMarkingType === "50% of Original") penalty = (q.marks || 0) * 0.5;
      else if (negativeMarkingType === "25% of Original") penalty = (q.marks || 0) * 0.25;
      else if (negativeMarkingType === "Static -1") penalty = 1;
      else if (negativeMarkingType === "Static -2") penalty = 2;
      return sum + penalty;
    }, 0);
  };
  const totalNegative = calculateNegativeMarks();

  const difficultyColor = (d: string | null) => {
    switch (d) {
      case "easy": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "medium": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      case "hard": return "bg-red-500/10 text-red-600 dark:text-red-400";
      default: return "";
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col absolute inset-0 bg-background z-10">
        <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-create">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-create-title">Create Test Paper</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">Select questions and configure your paper</p>
              </div>
            </div>
            <Button
              disabled={selectedIds.length === 0 || !title || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-create-paper-header"
              className="shrink-0 text-white"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-white" />
              ) : (
                <FileText className="w-4 h-4 mr-2 text-white" />
              )}
              Create Paper
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-10">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <h2 className="font-semibold">Select Questions</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={filterSubject} onValueChange={(val) => { setFilterSubject(val); setFilterChapter("all"); }}>
                        <SelectTrigger className="w-36" data-testid="select-paper-filter-subject">
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
                          <SelectTrigger className="w-40" data-testid="select-paper-filter-chapter">
                            <SelectValue placeholder="Chapter" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Chapters</SelectItem>
                            {chapters.map(c => (
                              <SelectItem key={c!} value={c!}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search questions..."
                        className="pl-9 w-full bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={toggleAllFiltered}
                      disabled={filtered.length === 0}
                      className="shrink-0"
                    >
                      <ListChecks className="w-4 h-4 mr-2" />
                      {filtered.length > 0 && filtered.every(q => selectedIds.includes(q.id)) ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {questions?.length === 0 ? "Upload some questions first" : "No questions match this filter"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((q) => (
                        <div
                          key={q.id}
                          className={`p-3 rounded-md border cursor-pointer transition-colors ${selectedIds.includes(q.id)
                            ? "border-primary bg-primary/5"
                            : "border-transparent bg-muted/40"
                            }`}
                          onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                          data-testid={`card-select-question-${q.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <div onClick={(e) => e.stopPropagation()} className="mt-1">
                              <Checkbox
                                checked={selectedIds.includes(q.id)}
                                onCheckedChange={() => toggleQuestion(q.id)}
                                data-testid={`checkbox-question-${q.id}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-sm font-medium">{q.topic}</span>
                                <Badge variant="secondary" className="text-xs">{q.subject}</Badge>
                                {q.chapter && (
                                  <span className="text-xs text-muted-foreground">{q.chapter}</span>
                                )}
                                <Badge variant="secondary" className={`text-xs ${difficultyColor(q.difficulty)}`}>
                                  {q.difficulty}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  +{q.marks}m
                                </span>
                              </div>
                              {expandedId !== q.id && (
                                <p className="text-xs text-muted-foreground truncate">{stripLatex(q.latexContent).substring(0, 100)}...</p>
                              )}
                            </div>

                            {/* Compact Right Side Toggles & Expand Button */}
                            <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                              {selectedIds.includes(q.id) && (
                                <div className="flex items-center gap-1 mr-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => toggleOptionId(q.id)}
                                        disabled={!(q as any).optionsLatex}
                                        className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${optionsQuestionIds.includes(q.id)
                                          ? 'bg-primary/20 text-primary'
                                          : 'text-muted-foreground hover:bg-muted'
                                          } ${!(q as any).optionsLatex ? 'opacity-30 cursor-not-allowed' : ''}`}
                                      >
                                        <ListChecks className="w-4 h-4" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Include Options</p>
                                    </TooltipContent>
                                  </Tooltip>

                                  {negativeMarking && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => toggleNegativeMarkingId(q.id)}
                                          className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${negativeMarkingQuestionIds.includes(q.id)
                                            ? 'bg-destructive/20 text-destructive'
                                            : 'text-muted-foreground hover:bg-muted'
                                            }`}
                                        >
                                          <MinusCircle className="w-4 h-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs">Apply Negative Marking</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              )}

                              <button
                                className="flex-shrink-0 text-muted-foreground hover:bg-muted p-1.5 rounded-md transition-colors"
                                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                              >
                                {expandedId === q.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {expandedId === q.id && (
                            <div className="mt-3 space-y-3 cursor-default pl-7 pr-7" onClick={(e) => e.stopPropagation()}>
                              <div className="p-3 rounded-md bg-background border border-border flex flex-col gap-3">
                                <LatexRenderer
                                  content={q.latexContent}
                                  diagramLatex={q.isDiagramHidden ? null : q.diagramLatex}
                                  imageUrl={(q.isDiagramHidden || (!q.hasDiagram && !q.diagramBounds)) ? null : q.imageUrl}
                                  diagramBounds={q.diagramBounds}
                                  diagramType={(q as any).diagramType}
                                  optionsNode={
                                    (q as any).optionsLatex && (optionsQuestionIds.includes(q.id) || (enableOptions && !selectedIds.includes(q.id))) ? (
                                      <div className="pt-3 border-t border-border/50">
                                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Options</h3>
                                        <div className={`grid grid-cols-1 ${parseOptions((q as any).optionsLatex).some((opt: string) => opt.length > 80) ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-2 mt-2`}>
                                          {parseOptions((q as any).optionsLatex).map((opt: string, i: number) => (
                                            <div key={i} className="flex gap-2 items-center">
                                              <span className="font-semibold shrink-0 text-sm text-muted-foreground">
                                                {getOptionLabel(i, "a-b-c-d")}
                                              </span>
                                              <div className="min-w-0 flex-1">
                                                <LatexRenderer content={stripOptionLabel(opt)} className="text-xs" />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : undefined
                                  }
                                />
                                {negativeMarkingQuestionIds.includes(q.id) && (
                                  <div className="pt-2 border-t border-border/50 text-xs text-destructive font-medium">
                                    Negative marking enabled for this question.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 sticky top-0 self-start w-full">
              <Card>
                <CardHeader className="pb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Question Paper Details
                  </h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Paper Title</Label>
                    <Input
                      placeholder="e.g., Unit Test - Mechanics"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      data-testid="input-paper-title"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Subject</Label>
                    <Input
                      placeholder="e.g., Physics, Chemistry"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-paper-subject"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Duration (min)</Label>
                      <Input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                        min={15}
                        max={300}
                        data-testid="input-duration"
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-end">
                      <Label className="text-xs">Test Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal px-3 py-2 h-10 text-sm bg-background border-input hover:bg-background hover:text-foreground",
                              !testDate && "text-muted-foreground"
                            )}
                            data-testid="input-test-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {testDate ? format(new Date(testDate), "dd/MM/yyyy") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-popover text-popover-foreground border-border" align="start">
                          <Calendar
                            mode="single"
                            selected={testDate ? new Date(testDate) : undefined}
                            onSelect={(date) => {
                              setTestDate(date ? format(date, "yyyy-MM-dd") : "");
                            }}
                            initialFocus
                          />
                          <div className="flex items-center justify-between p-2 border-t border-border bg-muted/20">
                            <Button
                              variant="ghost"
                              className="text-xs h-7 px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setTestDate("")}
                            >
                              Clear
                            </Button>
                            <Button
                              variant="secondary"
                              className="text-xs h-7 px-3 bg-primary/10 text-primary hover:bg-primary/20"
                              onClick={() => {
                                setTestDate(format(new Date(), "yyyy-MM-dd"));
                              }}
                            >
                              Today
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 pb-1 border-t border-border/50">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Enable Options</Label>
                      <Switch
                        checked={enableOptions}
                        onCheckedChange={handleEnableOptionsToggle}
                      />
                    </div>
                    {enableOptions && (
                      <div className="flex items-center gap-2 pt-1 animate-in fade-in slide-in-from-top-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => {
                            const ids = selectedQuestions.filter(q => (q as any).optionsLatex).map(q => q.id);
                            setOptionsQuestionIds(ids);
                          }}
                          disabled={selectedQuestions.length === 0}
                        >
                          Include All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => {
                            setOptionsQuestionIds([]);
                          }}
                          disabled={selectedQuestions.length === 0}
                        >
                          Exclude All
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Negative Marking</Label>
                      <Switch
                        checked={negativeMarking}
                        onCheckedChange={handleNegativeMarkingToggle}
                        data-testid="switch-negative-marking"
                      />
                    </div>

                    {negativeMarking && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Penalty Value</Label>
                          <Select value={negativeMarkingType} onValueChange={(val) => {
                            setNegativeMarkingType(val);
                            setInstructions(prev => prev.map(inst => {
                              if (inst.includes("penalty of")) {
                                return `Incorrect answers will carry a penalty of ${val}. Unanswered questions will receive zero marks. Some questions will have negative marking and some will not. Questions with negative marking are indicated beside the total marks.`;
                              }
                              return inst;
                            }));
                          }}>
                            <SelectTrigger className="w-full text-xs h-8">
                              <SelectValue placeholder="Select penalty" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="50% of Original">50% of Original</SelectItem>
                              <SelectItem value="25% of Original">25% of Original</SelectItem>
                              <SelectItem value="Static -1">Static -1</SelectItem>
                              <SelectItem value="Static -2">Static -2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs h-8"
                            onClick={() => setNegativeMarkingQuestionIds(selectedQuestions.map(q => q.id))}
                            disabled={selectedQuestions.length === 0}
                          >
                            Include All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs h-8"
                            onClick={() => setNegativeMarkingQuestionIds([])}
                            disabled={selectedQuestions.length === 0}
                          >
                            Exclude All
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pb-4 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Instructions</Label>
                      <Button variant="ghost" size="sm" onClick={handleAddInstruction} className="h-6 px-2 text-xs">
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                      {instructions.map((inst, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="text-xs font-medium text-muted-foreground mt-2 w-4 shrink-0 text-right">{index + 1}.</span>
                          <Input
                            value={inst}
                            onChange={(e) => handleUpdateInstruction(index, e.target.value)}
                            className="text-xs h-8 flex-1"
                            placeholder="Enter instruction..."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveInstruction(index)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      {instructions.length === 0 && (
                        <div className="text-xs text-center text-muted-foreground py-2 border rounded border-dashed">
                          No instructions added
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-muted/40 space-y-1.5 mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Questions</span>
                      <span className="font-medium">{selectedIds.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Marks</span>
                      <span className="font-medium">{totalMarks}</span>
                    </div>
                    {negativeMarking && totalNegative > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Max Negative</span>
                        <span className="font-medium text-red-500">-{totalNegative}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{duration} min</span>
                    </div>
                    {testDate && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">{new Date(testDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
