import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, BookOpen, FileText, Settings, Plus, LogOut, Banknote, LucideMessageCircleQuestion, QuoteIcon, Earth, GraduationCap, FileQuestionIcon, MessageCircleQuestionIcon, ScrollText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import type { Question, TestPaper } from "@shared/schema";
import { stripLatex, formatCurrency } from "@/lib/utils";
import { userQueryKey } from "@/lib/queryClient";

export default function Dashboard() {
  const { user, logout, authReady } = useAuth();
  const [, navigate] = useLocation();

  const { data: questions, isLoading: loadingQ, isError: errorQ, refetch: refetchQ } = useQuery<Question[]>({
    queryKey: userQueryKey(user?.id, "/api/questions"),
    enabled: !!user?.id && authReady,
  });

  const { data: papers, isLoading: loadingP, isError: errorP, refetch: refetchP } = useQuery<TestPaper[]>({
    queryKey: userQueryKey(user?.id, "/api/test-papers"),
    enabled: !!user?.id && authReady,
  });

  const stats = [
    {
      label: "Questions",
      value: questions?.length ?? 0,
      icon: QuoteIcon,
      color: "text-blue-500 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Test Papers",
      value: papers?.length ?? 0,
      icon: FileText,
      color: "text-emerald-500 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Topics & Concepts",
      value: questions ? new Set(questions.map(q => q.topic)).size : 0,
      icon: Earth,
      color: "text-purple-500 dark:text-purple-400",
      bg: "bg-purple-500/10",
    },
    ...(user?.role === "admin" ? [{
      label: "Total AI Spend",
      value: formatCurrency(user?.totalAiCost ?? 0, user?.currency || "USD"),
      icon: Banknote,
      color: "text-amber-500 dark:text-amber-400",
      bg: "bg-amber-500/10",
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            Welcome{user?.firstName ? `, ` : ""}<span className="text-primary">{user?.firstName ? `${user.firstName}` : ""}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your question library and test papers
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0">
          <Button className="w-full sm:w-auto dark:text-white text-primary font-semibold bg-primary/25 border-primary/50" data-testid="button-upload-question" onClick={() => navigate("/upload")}>
            <Upload className="w-5 h-5 mr-1.5 text-primary" strokeWidth={3} />
            Add Questions
          </Button>
          <Button className="w-full sm:w-auto border-primary/40 font-semibold" data-testid="button-create-paper" variant="ghost" onClick={() => navigate("/create-paper")}>
            <Plus className="w-5 h-5 mr-1.5 text-primary" strokeWidth={3} />
            Create Test Paper
          </Button>
        </div>
      </div>

      {(errorQ || errorP) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
          <span>Could not load your questions or test papers. Please try again.</span>
          <Button variant="outline" size="sm" onClick={() => { refetchQ(); refetchP(); }}>
            Retry
          </Button>
        </div>
      )}

      <div className={`grid sm:grid-cols-2 ${stats.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  {loadingQ || loadingP ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold mt-1" data-testid={`text-stat-${stat.label.toLowerCase().replace(" ", "-")}`}>
                      {stat.value}
                    </p>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-md ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <h2 className="font-semibold">Recent Questions</h2>
            <Link href="/library">
              <Button variant="ghost" size="sm" data-testid="link-view-all-questions" className="text-primary">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingQ ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : questions && questions.length > 0 ? (
              <div className="space-y-2 max-w-full overflow-hidden">
                {questions.slice(0, 5).map((q) => (
                  <Link key={q.id} href={`/library?expand=${q.id}`} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 cursor-pointer hover-elevate" data-testid={`card-question-${q.id}`}>
                      <div className="w-8 h-8 rounded-md bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <MessageCircleQuestionIcon className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{q.topic}</p>
                        <p className="text-xs text-muted-foreground break-words whitespace-normal sm:truncate line-clamp-2 sm:line-clamp-none">
                          {stripLatex(q.latexContent).substring(0, 120)}{stripLatex(q.latexContent).length > 120 ? '...' : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No questions yet</p>
                <Button variant="ghost" size="sm" className="mt-3 text-primary border-primary/20" onClick={() => navigate("/upload")} data-testid="button-upload-first">
                  Upload your first question
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <h2 className="font-semibold">Recent Papers</h2>
            <Link href="/papers">
              <Button variant="ghost" size="sm" data-testid="link-view-all-papers" className="text-primary">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingP ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : papers && papers.length > 0 ? (
              <div className="space-y-2 max-w-full overflow-hidden">
                {papers.slice(0, 5).map((p) => (
                  <Link key={p.id} href={`/papers/${p.id}`} className="block">
                    <div className="flex items-start sm:items-center gap-3 p-3 rounded-md bg-muted/40 cursor-pointer hover-elevate" data-testid={`card-paper-${p.id}`}>
                      <div className="w-8 h-8 rounded-md bg-lime-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                        <ScrollText className="w-4 h-4 text-lime-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words whitespace-normal sm:truncate line-clamp-2 sm:line-clamp-none">{p.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                          {p.questionIds.length} questions · {p.totalMarks} marks
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No test papers yet</p>
                <Button variant="ghost" size="sm" className="mt-3 text-primary border-primary/20" onClick={() => navigate("/create-paper")} data-testid="button-create-first-paper">
                  Create your first paper
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
