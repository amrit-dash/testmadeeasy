import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, userQueryKey } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { ArrowLeft, FileText, Trash2, Clock, Award, Eye, Key } from "lucide-react";
import type { TestPaper } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function Papers() {
  const { toast } = useToast();
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: papers, isLoading } = useQuery<TestPaper[]>({
    queryKey: userQueryKey(user?.id, "/api/test-papers"),
    enabled: !!user?.id && authReady,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/test-papers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKey(user?.id, "/api/test-papers") });
      toast({ title: "Paper deleted" });
    },
  });

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-papers">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-papers-title">Test Papers</h1>
              <p className="text-sm text-muted-foreground">{papers?.length ?? 0} papers created</p>
            </div>
          </div>
          <Button className="text-white" onClick={() => navigate("/create-paper")} data-testid="button-new-paper">
            Create New Paper
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 pb-12 sm:pb-16 space-y-6">
        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !papers || papers.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-medium mb-1">No papers made yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Start by adding questions first, then come here to build your paper</p>
            <Button className="text-white" onClick={() => navigate("/create-paper")} data-testid="button-create-first">
              Create Paper
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {papers.map((p) => (
              <Card
                key={p.id}
                data-testid={`card-paper-list-${p.id}`}
                className="cursor-pointer hover:border-secondary-foreground/20 transition-colors"
                onClick={() => navigate(`/papers/${p.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{p.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          {p.totalMarks} marks
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {p.duration} min
                        </span>
                        <span>{p.questionIds.length} questions</span>
                        <span>{new Date(p.createdAt!).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/papers/${p.id}/answer-key`}>
                        <Button variant="ghost" size="icon" className="text-primary hover:text-primary hover:bg-primary/10" title="Answer Key" data-testid={`button-answer-key-${p.id}`}>
                          <Key className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link href={`/papers/${p.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-paper-${p.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(p.id)}
                        data-testid={`button-delete-paper-${p.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
