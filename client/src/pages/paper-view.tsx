import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Printer, Pencil, Eye, Key } from "lucide-react";
import type { Question, TeacherProfile, TestPaper } from "@shared/schema";
import LatexRenderer from "@/components/latex-renderer";
import { TestPaperHeader, getFontString } from "@/components/paper-header";
import { getOptionLabel, stripOptionLabel, parseOptions } from "@/lib/utils";
import { userQueryKey } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

type PaperViewData = {
  paper: TestPaper;
  questions: Question[];
  profile: TeacherProfile | null;
};

export default function PaperView() {
  const { user, authReady } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<Record<number, string>>({});
  const [editedOptions, setEditedOptions] = useState<Record<number, string>>({});
  const [editedDiagrams, setEditedDiagrams] = useState<Record<number, string>>({});
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedInstructions, setEditedInstructions] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery<PaperViewData>({
    queryKey: userQueryKey(user?.id, "/api/test-papers", params.id),
    enabled: !!user?.id && authReady && !!params.id,
  });

  useEffect(() => {
    if (data) {
      setEditedTitle(null);
      setEditedInstructions(null);
      setEditedQuestions({});
      setEditedOptions({});
      setEditedDiagrams({});
    }
  }, [data]);

  const handlePrint = () => {
    setEditing(false);
    setTimeout(() => {
      const originalTitle = document.title;
      let printTitle = title;
      if (paper.subject && paper.subject !== 'General') {
        printTitle += ` - ${paper.subject}`;
      }
      const tutorName = profile?.teacherName || profile?.coachingName;
      if (tutorName) {
        printTitle += ` - ${tutorName}`;
      }
      document.title = printTitle;
      
      window.print();
      
      document.title = originalTitle;
    }, 100);
  };

  const getQuestionContent = (q: Question) => {
    return editedQuestions[q.id] !== undefined ? editedQuestions[q.id] : q.latexContent;
  };

  const updateQuestion = (id: number, content: string) => {
    setEditedQuestions((prev) => ({ ...prev, [id]: content }));
  };

  const getOptionsContent = (q: Question) => {
    return editedOptions[q.id] !== undefined ? editedOptions[q.id] : (q.optionsLatex || "");
  };

  const updateOptions = (id: number, content: string) => {
    setEditedOptions((prev) => ({ ...prev, [id]: content }));
  };

  const getDiagramContent = (q: Question) => {
    return editedDiagrams[q.id] !== undefined ? editedDiagrams[q.id] : (q.diagramLatex || "");
  };

  const updateDiagram = (id: number, content: string) => {
    setEditedDiagrams((prev) => ({ ...prev, [id]: content }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Paper not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/papers")}>
          Back to Papers
        </Button>
      </div>
    );
  }

  const { paper, questions, profile } = data;

  const getNegativeMarksForQuestion = (q: Question) => {
    if (!paper.negativeMarking) return 0;

    // Check if the paper specifically tracks which questions have negative marking
    const appliesToQuestion = (paper as any).negativeMarkingQuestionIds?.length > 0
      ? (paper as any).negativeMarkingQuestionIds.includes(q.id)
      : true;

    if (!appliesToQuestion) return 0;

    let penalty = 0;
    if (paper.negativeMarkingType === "50% of Original") penalty = (q.marks || 0) * 0.5;
    else if (paper.negativeMarkingType === "25% of Original") penalty = (q.marks || 0) * 0.25;
    else if (paper.negativeMarkingType === "Static -1") penalty = 1;
    else if (paper.negativeMarkingType === "Static -2") penalty = 2;

    return penalty;
  };

  const hasNegative = paper.negativeMarking && questions.some(q => getNegativeMarksForQuestion(q) > 0);
  const title = editedTitle !== null ? editedTitle : paper.title;
  const instructions = editedInstructions !== null ? editedInstructions : (paper.instructions || "");

  let formatOptions: any = {};
  let contactPhone = "";
  let contactEmail = "";
  if (profile) {
    try {
      formatOptions = JSON.parse(profile.headerFormat || '{}');
      if (formatOptions.style === "standard") formatOptions.style = "classic";
      contactPhone = formatOptions.contactPhone || "";
      contactEmail = formatOptions.contactEmail || "";
    } catch (err) {
      formatOptions.style = profile.headerFormat === "standard" ? "classic" : (profile.headerFormat || "classic");
    }
    if (!contactPhone && !contactEmail && profile.contactInfo) {
      contactPhone = profile.contactInfo;
    }
  }

  // Body Formatting
  const bodyFontFamily = formatOptions.bodyFontFamily || formatOptions.fontFamily || "century";
  const bodyFontSize = formatOptions.bodyFontSize || "medium";
  const bodyMargin = formatOptions.bodyMargin || formatOptions.pageMargin || "standard";
  const bodyAlignment = formatOptions.bodyAlignment || "alternate";

  // Number Formatting
  const questionNumbering = formatOptions.questionNumbering || "q-number";
  const optionNumbering = formatOptions.optionNumbering || "a-b-c-d";

  // Extra / Spacing / Borders
  const borderMargin = formatOptions.borderMargin || "none";
  const watermarkOpacity = formatOptions.watermarkOpacity || "3";
  const questionSpacing = formatOptions.questionSpacing || "tight";
  const optionSpacing = formatOptions.optionSpacing || "tight";
  const watermarkText = profile?.watermarkText || "";

  const bodySizeClass = bodyFontSize === 'small' ? 'text-[13px]' : bodyFontSize === 'large' ? 'text-[17px]' : 'text-[15px]';
  const bodySizeLgClass = bodyFontSize === 'small' ? 'text-sm' : bodyFontSize === 'large' ? 'text-lg' : 'text-base';

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/papers")} data-testid="button-back-paper-view">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold" data-testid="text-paper-view-title">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="border border-primary/40 bg-primary/20 text-foreground hover:bg-primary/40"
              onClick={() => navigate(`/papers/${paper.id}/answer-key`)}
            >
              <Key className="w-4 h-4 mr-1.5 text-primary" />
              Answer Key
            </Button>
            <Button
              variant="ghost"
              className={editing ? "border-primary/40 bg-primary/80" : "border-primary/40"}
              onClick={() => setEditing(!editing)}
              data-testid="button-toggle-edit-paper"
            >
              {editing ? (
                <>
                  <Eye className="w-4 h-4 mr-1.5" />
                  Preview
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4 mr-1.5 text-primary" />
                  Edit
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={handlePrint} className="border border-primary/40" data-testid="button-print">
              <Printer className="w-4 h-4 mr-1.5 text-primary" />
              Print / PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 pb-12 sm:pb-16 w-full print:p-0 print:overflow-visible relative">
        <Card className="print:shadow-none print:border-none max-w-5xl mx-auto">
          <CardContent className="p-0 print:p-0">
            <div
              className="bg-white text-black relative w-full overflow-hidden rounded-md print:rounded-none"
              style={{ fontFamily: getFontString(bodyFontFamily) }}
            >
              {/* Watermark */}
              {watermarkText && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
                  style={{
                    transform: 'rotate(-45deg)',
                    fontSize: 'clamp(4rem, 12vw, 8rem)',
                    fontWeight: 'bold',
                    color: 'black',
                    opacity: parseInt(watermarkOpacity) / 100,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {watermarkText}
                </div>
              )}

              {profile && (
                <TestPaperHeader
                  coachingName={profile.coachingName}
                  teacherName={profile.teacherName}
                  contactPhone={contactPhone}
                  contactEmail={contactEmail}
                  logoUrl={profile.logoUrl}
                  accentColor={profile.accentColor}
                  secondaryAccentColor={formatOptions.secondaryAccentColor || "#6b7280"}
                  headerStyle={formatOptions.style || "classic"}
                  logoPosition={formatOptions.logoPosition || "left"}
                  logoSize={formatOptions.logoSize || "medium"}
                  headerFontFamily={formatOptions.headerFontFamily || formatOptions.fontFamily || "century"}
                  headerFontSize={formatOptions.headerFontSize || formatOptions.textSize || "medium"}
                  subHeaderFontSize={formatOptions.subHeaderFontSize || "medium"}
                  headerPadding={formatOptions.headerPadding || formatOptions.paddingSize || "small"}
                  headerAlignment={formatOptions.headerAlignment || formatOptions.alignment || "left"}
                  showBorder={formatOptions.showBorder ?? true}
                  borderThickness={formatOptions.borderThickness || "2"}
                />
              )}

              <div
                className={`max-w-4xl mx-auto paper-content relative z-10 ${bodyMargin === 'narrow' ? 'px-6 sm:px-8 pb-8' : bodyMargin === 'wide' ? 'px-12 sm:px-16 pb-16' : 'px-8 sm:px-10 pb-12'} ${bodySizeClass}`}
                style={{
                  paddingTop: borderMargin === 'none' ? '16px' : borderMargin === 'small' ? '32px' : borderMargin === 'large' ? '64px' : '48px'
                }}
              >
                <div className="text-center mb-8">
                  {editing ? (
                    <Input
                      value={title}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-lg font-bold uppercase tracking-wide text-center border-dashed bg-transparent"
                      data-testid="input-edit-paper-title"
                    />
                  ) : (
                    <h2 className="text-lg font-bold uppercase tracking-wide" data-testid="text-paper-title-header">{title}</h2>
                  )}
                  <div className={`flex items-center justify-center gap-4 mt-2 ${bodySizeLgClass} flex-wrap opacity-90`}>
                    <span>Subject: {paper.subject}</span>
                    <span>Total Marks: {paper.totalMarks}</span>
                    <span>Time: {paper.duration} min</span>
                    {paper.testDate && (
                      <span>Date: {new Date(paper.testDate).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {(instructions || editing) && (
                  <div className="mb-8 p-5 rounded-lg border-2 border-foreground/10 bg-muted/5 print:bg-transparent print:border-foreground/20 print:border">
                    <h3 className={`${bodySizeLgClass} font-semibold mb-2`}>General Instructions:</h3>
                    {editing ? (
                      <Textarea
                        value={instructions}
                        onChange={(e) => setEditedInstructions(e.target.value)}
                        className="text-sm border-dashed min-h-[80px] bg-transparent"
                        placeholder="Add instructions for the test..."
                        data-testid="textarea-edit-instructions"
                      />
                    ) : (
                      <div className={`${bodySizeLgClass} whitespace-pre-line opacity-90`}>{instructions}</div>
                    )}
                  </div>
                )}

                <div className={questionSpacing === 'tight' ? 'space-y-4' : questionSpacing === 'relaxed' ? 'space-y-12' : 'space-y-8'}>
                  {questions.map((q, index) => (
                    <div
                      key={q.id}
                      className="question-block"
                      data-testid={`text-paper-question-${q.id}`}
                      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
                    >
                      <div className="flex gap-2 items-start">
                        <span className={`${bodySizeLgClass} font-bold flex-shrink-0 min-w-[2rem] text-right mt-1`}>
                          {questionNumbering === 'number-dot' ? `${index + 1}.` : questionNumbering === 'q-number' ? `Q${index + 1}.` : questionNumbering === 'q-dot-number' ? `Q.${index + 1}` : `(${index + 1})`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">

                              {editing ? (
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Question Text</span>
                                    <Textarea
                                      value={getQuestionContent(q)}
                                      onChange={(e) => updateQuestion(q.id, e.target.value)}
                                      className="text-sm font-mono border-dashed min-h-[80px] bg-transparent"
                                      data-testid={`textarea-edit-question-${q.id}`}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Options</span>
                                    <Textarea
                                      value={getOptionsContent(q)}
                                      onChange={(e) => updateOptions(q.id, e.target.value)}
                                      className="text-sm font-mono border-dashed min-h-[60px] bg-transparent"
                                      data-testid={`textarea-edit-options-${q.id}`}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Diagram</span>
                                    <Textarea
                                      value={getDiagramContent(q)}
                                      onChange={(e) => updateDiagram(q.id, e.target.value)}
                                      className="text-sm font-mono border-dashed min-h-[60px] bg-transparent"
                                      data-testid={`textarea-edit-diagram-${q.id}`}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                    <LatexRenderer
                                      content={getQuestionContent(q)}
                                      diagramLatex={q.isDiagramHidden ? null : getDiagramContent(q)}
                                      imageUrl={(q.isDiagramHidden || (!q.hasDiagram && !q.diagramBounds)) ? null : q.imageUrl}
                                      diagramBounds={q.diagramBounds}
                                      diagramType={(q as any).diagramType}
                                      className={bodySizeLgClass}
                                      alignment={bodyAlignment}
                                    isAlternateRight={index % 2 !== 0}
                                    forceLightMode={true}
                                    optionsNode={
                                      paper.includeOptions &&
                                        ((paper as any).optionsQuestionIds?.length > 0
                                          ? (paper as any).optionsQuestionIds.includes(q.id)
                                          : true) &&
                                        getOptionsContent(q) ? (
                                        <div className={`${optionSpacing === 'tight' ? 'space-y-1' : optionSpacing === 'relaxed' ? 'space-y-4' : 'space-y-2'}`}>
                                          <div className={`grid grid-cols-1 ${parseOptions(getOptionsContent(q)).some((opt: string) => opt.length > 80) ? '' : 'sm:grid-cols-2'} gap-x-6 gap-y-2`}>
                                            {parseOptions(getOptionsContent(q)).map((opt: string, i: number) => (
                                              <div key={i} className="flex gap-2 items-center break-inside-avoid">
                                                <span className={`font-semibold shrink-0 ${bodySizeLgClass}`}>
                                                  {getOptionLabel(i, optionNumbering)}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                  <LatexRenderer content={stripOptionLabel(opt)} className={bodySizeLgClass} forceLightMode={true} />
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : undefined
                                    }
                                  />
                                </div>
                              )}

                            </div>

                            {/* Marks */}
                            <div className={`${bodySizeLgClass} font-medium flex-shrink-0 pt-0.5 text-right whitespace-nowrap ml-4`}>
                              {hasNegative && getNegativeMarksForQuestion(q) > 0 ? (
                                <span>[+{q.marks}, -{getNegativeMarksForQuestion(q)}]</span>
                              ) : (
                                <span>[{q.marks}]</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 pt-4 border-t text-center text-xs text-muted-foreground print:border-foreground/20">
                  --- End of Paper ---
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print CSS injected inline so it works without a separate stylesheet */}
      <style>{`
        .latex-options-tight li { margin-bottom: 0.25rem !important; }
        .latex-options-standard li { margin-bottom: 0.75rem !important; }
        .latex-options-relaxed li { margin-bottom: 1.5rem !important; }
        .latex-options-tight .latex-content > * { margin-bottom: 0 !important; }
        @page { margin: 0; }
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .question-block {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 20px;
          }
          .question-block img {
            max-width: 100% !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .paper-content {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
