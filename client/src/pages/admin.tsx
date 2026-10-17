import { AdminExceptionsView } from "@/components/admin-exceptions-view";
import { fetchWithAuth } from "@/lib/queryClient";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload, Trash2, Loader2, Database, FileText, Search, ImagePlus, FileUp,
  Users, BookOpen, BarChart3, Phone, Mail, Calendar, Lock, Eye, EyeOff, ShieldCheck,
  Banknote, MoreVertical, Shield,
  HandCoinsIcon,
  WalletIcon,
  ScrollText,
  ScrollTextIcon,
  Quote,
  QuoteIcon,
  User,
  Settings,
  ChartLine,
  WrenchIcon,
  Bot
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import LatexRenderer from "@/components/latex-renderer";
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
import { formatCurrency } from "@/lib/utils";
import type { MasterQuestion } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

const AI_MODEL_OPTIONS = [
  { value: "gemma-4-31b-it", label: "Gemma 4 31B (open-weight)" },
  { value: "gemma-4-26b-a4b-it", label: "Gemma 4 26B A4B MoE (open-weight)" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
];


type BulkResult = {
  total: number;
  succeeded: number;
  duplicates: number;
  failed: number;
  results: { filename: string; status: string; error?: string }[];
};

type Stats = {
  total: number;
  subjects: Record<string, number>;
};

type UserStat = {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  createdAt: string;
  questionCount: number;
  paperCount: number;
  subjects: string[];
  totalAiCost?: number;
  savedAiCost?: number;
};

type DashboardData = {
  totalUsers: number;
  totalQuestions: number;
  totalPapers: number;
  totalMasterQuestions: number;
  totalExceptionsCost: number;
  masterSubjects: Record<string, number>;
  questionSubjects: Record<string, number>;
  users: UserStat[];
};

type AdminTab = "overview" | "master-bank" | "users" | "tools" | "exceptions";

export default function AdminPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterText, setFilterText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [source, setSource] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const [bulkSubject, setBulkSubject] = useState("auto");
  const [bulkBoard, setBulkBoard] = useState("none");
  const [bulkClass, setBulkClass] = useState("none");
  const [bulkExam, setBulkExam] = useState("none");
  const [bulkYear, setBulkYear] = useState("");
  const [scrapeSource, setScrapeSource] = useState("all");
  const [scrapeMax, setScrapeMax] = useState("2");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeResult, setScrapeResult] = useState<{ totalFound: number; totalSaved: number; results: { paper: string; questionsFound: number; saved: number; error?: string }[] } | null>(null);


  const { data: exceptionsCountData } = useQuery({
    queryKey: ["/api/admin/master-questions/exceptions/count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/master-questions/exceptions/count");
      return res.json();
    },
    refetchInterval: 30000,
  });
  const pendingExceptionsCount = exceptionsCountData?.count || 0;


  const { data: pricingChart, isLoading: loadingPricing } = useQuery({
    queryKey: ["/api/admin/pricing"],
    enabled: activeTab === "tools" && user?.role === "admin",
  });

  const { data: dashboard, isLoading: loadingDashboard } = useQuery<DashboardData>({
    queryKey: ["/api/admin/dashboard"],
    enabled: user?.role === "admin",
  });

  const { data: masterQuestions, isLoading } = useQuery<MasterQuestion[]>({
    queryKey: ["/api/admin/master-questions"],
    enabled: user?.role === "admin",
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/master-questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Deleted", description: "Question removed from master bank" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "teacher" }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Role Updated", description: "User permissions have been updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update role", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("images", f));
      if (source) formData.append("source", source);
      if (bulkSubject && bulkSubject !== "auto") formData.append("subject", bulkSubject);
      if (bulkBoard && bulkBoard !== "none") formData.append("board", bulkBoard);
      if (bulkClass && bulkClass !== "none") formData.append("className", bulkClass);
      if (bulkExam && bulkExam !== "none") formData.append("exam", bulkExam);
      if (bulkYear) formData.append("year", bulkYear);
      const res = await fetchWithAuth("/api/admin/master-questions/bulk-extract", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Bulk upload failed");
      return res.json() as Promise<BulkResult>;
    },
    onSuccess: (data) => {
      setBulkResult(data);
      setSelectedFiles(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({
        title: "Bulk upload complete",
        description: `${data.succeeded} added, ${data.duplicates} duplicates, ${data.failed} failed`,
      });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Bulk upload encountered an error", variant: "destructive" });
    },
  });


  const { data: systemSettings, isLoading: loadingSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
    enabled: activeTab === "tools" && user?.role === "admin",
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const res = await apiRequest("PATCH", "/api/admin/settings", settings);
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      if (variables.masterMatchThreshold !== undefined) {
        toast({ title: "Threshold Updated", description: "Master match threshold has been updated successfully." });
      } else {
        toast({ title: "Settings Updated", description: "Default models updated successfully." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Update Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/update-pricing");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      toast({ title: "Pricing Updated", description: "Successfully fetched and updated Gemini pricing chart." });
    },
    onError: (error: any) => {
      toast({ title: "Update Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        source: scrapeSource === "all" ? undefined : scrapeSource,
        maxPapers: parseInt(scrapeMax) || 2,
      };
      if (scrapeUrl.trim()) {
        body.customUrl = scrapeUrl.trim();
      }
      const res = await apiRequest("POST", "/api/admin/scrape", body);
      return res.json();
    },
    onSuccess: (data) => {
      setScrapeResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({
        title: "Scraping complete",
        description: `${data.totalSaved} questions saved from ${data.results.length} papers`,
      });
    },
    onError: () => {
      toast({ title: "Scraping failed", variant: "destructive" });
    },
  });

  const cleanupJobsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/cleanup");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cleanup Complete", description: "All completed jobs have been deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Cleanup Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const syncMasterQuestionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/master-questions/sync");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Sync Complete", description: `Successfully synced ${data.updatedCount} questions.` });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const clearExceptionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/master-questions/exceptions/clear-processed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-questions/exceptions"] });
      toast({ title: "Cleanup Complete", description: `Successfully deleted ${data.count} processed exceptions.` });
    },
    onError: (error: any) => {
      toast({ title: "Cleanup Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
      setBulkResult(null);
    }
  }, []);

  const filtered = (masterQuestions || []).filter((q) => {
    if (filterSubject && !q.subject.toLowerCase().includes(filterSubject.toLowerCase())) return false;
    if (filterText && !q.latexContent.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });

  const tabs = [
    { id: "overview" as AdminTab, label: "Overview", icon: BarChart3 },
    { id: "master-bank" as AdminTab, label: "Master Bank", icon: Database },
    { id: "users" as AdminTab, label: "Users", icon: Users },
    { id: "tools" as AdminTab, label: "Tools", icon: WrenchIcon },
    { id: "exceptions" as AdminTab, label: "Exceptions", icon: Bot },
  ];

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground">You do not have permission to view the admin portal.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="flex-none bg-background pt-4 pb-0 sm:pt-6 px-4 sm:px-6 shadow-sm border-b z-20 space-y-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform overview, master question bank, and user management</p>
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "exceptions" && pendingExceptionsCount > 0 && (
                <span className={`ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-colors ${activeTab === "exceptions" ? "bg-red-600 text-white shadow-sm" : "bg-muted text-muted-foreground"}`}>
                  {pendingExceptionsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-auto ${activeTab === 'exceptions' ? '' : 'p-4 sm:p-6 pb-12 sm:pb-16 space-y-6'}`}>
        {activeTab === "overview" && (
          <div className="space-y-6">
            {loadingDashboard ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-blue-500/10 flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-total-users">{dashboard?.totalUsers || 0}</p>
                          <p className="text-xs text-muted-foreground">Total Users</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                          <Database className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-total-master">{dashboard?.totalMasterQuestions || 0}</p>
                          <p className="text-xs text-muted-foreground">Master Bank</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
                          <QuoteIcon className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-total-questions">{dashboard?.totalQuestions || 0}</p>
                          <p className="text-xs text-muted-foreground">Teacher Questions</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-purple-500/10 flex items-center justify-center">
                          <ScrollTextIcon className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-total-papers">{dashboard?.totalPapers || 0}</p>
                          <p className="text-xs text-muted-foreground">Test Papers</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-primary/50 bg-primary/5 shadow-sm">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <WalletIcon className="text-2xl font-bold text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-3xl font-bold text-primary">
                          {formatCurrency(dashboard?.users?.reduce((acc, u) => acc + (u.totalAiCost || 0), 0) || 0, user?.currency || "USD")}
                        </p>
                        <p className="text-sm font-medium text-primary/80">Total Platform AI Spend</p>
                      </div>
                    </div>

                    {(() => {
                      const total = dashboard?.users?.reduce((acc, u) => acc + (u.totalAiCost || 0), 0) || 0;
                      const saved = dashboard?.users?.reduce((acc, u) => acc + (u.savedAiCost || 0), 0) || 0;
                      const exceptionsCost = dashboard?.totalExceptionsCost || 0;
                      const missed = Math.max(0, total - saved - exceptionsCost);

                      const savedPct = total > 0 ? (saved / total) * 100 : 0;
                      const exceptionsPct = total > 0 ? (exceptionsCost / total) * 100 : 0;
                      const missedPct = total > 0 ? (missed / total) * 100 : 0;

                      return (
                        <div className="space-y-3 mt-2 pt-4 border-t border-primary/10">
                          <div className="flex h-3 w-full rounded-full overflow-hidden bg-primary/10">
                            <div className="bg-emerald-600 dark:bg-emerald-500 transition-all duration-500" style={{ width: `${savedPct}%` }} title="Extracted and Saved" />
                            <div className="bg-blue-700 dark:bg-blue-600 transition-all duration-500" style={{ width: `${exceptionsPct}%` }} title="Exception Handling" />
                            <div className="bg-amber-500 dark:bg-amber-400 transition-all duration-500" style={{ width: `${missedPct}%` }} title="Extracted and Missed" />
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-medium">
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-600 shrink-0" />
                              <span>Extracted & Saved: {formatCurrency(saved, user?.currency || "USD")} ({savedPct.toFixed(1)}%)</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-700 dark:bg-blue-600 shrink-0" />
                              <span>Exceptions: {formatCurrency(exceptionsCost, user?.currency || "USD")} ({exceptionsPct.toFixed(1)}%)</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                              <div className="w-2.5 h-2.5 rounded-full bg-amber-600 dark:bg-amber-600 shrink-0" />
                              <span>Extracted & Missed: {formatCurrency(missed, user?.currency || "USD")} ({missedPct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </>
            )}

            {dashboard?.masterSubjects && Object.keys(dashboard.masterSubjects).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Master Bank by Subject
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(dashboard.masterSubjects)
                      .sort(([, a], [, b]) => b - a)
                      .map(([subject, count]) => (
                        <div key={subject} className="flex items-center gap-3">
                          <span className="text-sm w-32 truncate">{subject}</span>
                          <div className="flex-1 bg-muted rounded-full h-2.5">
                            <div
                              className="bg-primary h-2.5 rounded-full transition-all"
                              style={{ width: `${Math.max(4, (count / dashboard.totalMasterQuestions) * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-10 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {dashboard?.users && dashboard.users.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Recent Users
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboard.users.slice(0, 5).map((u) => (
                      <div key={u.id} className="flex items-center gap-3 p-3 rounded-md bg-muted/40" data-testid={`user-row-${u.id}`}>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {u.firstName || u.phone || u.email || "Unknown"}
                            </p>
                            {u.role === "admin" && (
                              <Badge className="bg-amber-500/10 text-amber-600 text-[10px]">Admin</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {u.questionCount} questions · {u.paperCount} papers
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                  {dashboard.users.length > 5 && (
                    <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setActiveTab("users")}
                      data-testid="button-view-all-users">
                      View all {dashboard.users.length} users
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "master-bank" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-semibold flex items-center gap-2">
                    <ImagePlus className="w-4 h-4" />
                    Upload Questions
                  </h2>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/admin/pdf-upload")}
                    data-testid="button-pdf-upload"
                  >
                    <FileUp className="w-4 h-4 mr-1.5" />
                    Upload PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Select Images (up to 50)</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      data-testid="input-bulk-files"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Subject</Label>
                    <Select value={bulkSubject} onValueChange={setBulkSubject}>
                      <SelectTrigger data-testid="select-bulk-subject">
                        <SelectValue placeholder="Auto-detect" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="Physics">Physics</SelectItem>
                        <SelectItem value="Chemistry">Chemistry</SelectItem>
                        <SelectItem value="Mathematics">Mathematics</SelectItem>
                        <SelectItem value="Biology">Biology</SelectItem>
                        <SelectItem value="Computer Science">Computer Science</SelectItem>
                        <SelectItem value="English">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source (optional)</Label>
                    <Input
                      placeholder="e.g., HC Verma, Irodov, NCERT"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      data-testid="input-source"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Board</Label>
                    <Select value={bulkBoard} onValueChange={setBulkBoard}>
                      <SelectTrigger data-testid="select-bulk-board">
                        <SelectValue placeholder="Select board" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="CBSE">CBSE</SelectItem>
                        <SelectItem value="ICSE">ICSE</SelectItem>
                        <SelectItem value="IGCSE">IGCSE</SelectItem>
                        <SelectItem value="IB">IB</SelectItem>
                        <SelectItem value="State Board">State Board</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Class</Label>
                    <Select value={bulkClass} onValueChange={setBulkClass}>
                      <SelectTrigger data-testid="select-bulk-class">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="9">Class 9</SelectItem>
                        <SelectItem value="10">Class 10</SelectItem>
                        <SelectItem value="11">Class 11</SelectItem>
                        <SelectItem value="12">Class 12</SelectItem>
                        <SelectItem value="UG">UG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Exam</Label>
                    <Select value={bulkExam} onValueChange={setBulkExam}>
                      <SelectTrigger data-testid="select-bulk-exam">
                        <SelectValue placeholder="Select exam" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="JEE Main">JEE Main</SelectItem>
                        <SelectItem value="JEE Advanced">JEE Advanced</SelectItem>
                        <SelectItem value="NEET">NEET</SelectItem>
                        <SelectItem value="CBSE Board">CBSE Board</SelectItem>
                        <SelectItem value="ICSE Board">ICSE Board</SelectItem>
                        <SelectItem value="IGCSE">IGCSE</SelectItem>
                        <SelectItem value="Olympiad">Olympiad</SelectItem>
                        <SelectItem value="KVPY">KVPY</SelectItem>
                        <SelectItem value="Practice">Practice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Year</Label>
                    <Input
                      placeholder="e.g., 2024"
                      value={bulkYear}
                      onChange={(e) => setBulkYear(e.target.value)}
                      data-testid="input-bulk-year"
                    />
                  </div>
                </div>
                {selectedFiles && (
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{selectedFiles.length} image{selectedFiles.length > 1 ? "s" : ""} selected</Badge>
                    <Button
                      onClick={() => bulkUploadMutation.mutate(selectedFiles)}
                      disabled={bulkUploadMutation.isPending}
                      data-testid="button-bulk-upload"
                    >
                      {bulkUploadMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-1.5" />
                          Extract & Add to Master Bank
                        </>
                      )}
                    </Button>
                  </div>
                )}
                {bulkResult && (
                  <div className="p-3 rounded-md bg-muted/40 text-sm space-y-1">
                    <p className="font-medium">Results: {bulkResult.total} image{bulkResult.total > 1 ? "s" : ""} processed</p>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600">{bulkResult.succeeded} questions added</span>
                      <span className="text-amber-600">{bulkResult.duplicates} duplicates</span>
                      <span className="text-red-600">{bulkResult.failed} failed</span>
                    </div>
                    {bulkResult.results.filter(r => r.status === "failed").map((r, i) => (
                      <p key={i} className="text-xs text-red-500">{r.filename}: {r.error}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>


            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Scrape Questions from Web
                </h2>
                <p className="text-xs text-muted-foreground">Fetch past year papers from educational websites and extract questions automatically</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Paste any URL with questions (or leave empty to use preset sources below)</Label>
                  <Input
                    placeholder="https://example.com/jee-advanced-2024-paper.html"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    data-testid="input-scrape-url"
                  />
                </div>
                {scrapeUrl.trim() ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max PDFs to process (if page has PDF links)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={scrapeMax}
                      onChange={(e) => setScrapeMax(e.target.value)}
                      data-testid="input-scrape-max-url"
                      className="w-32"
                    />
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Preset Source</Label>
                      <Select value={scrapeSource} onValueChange={setScrapeSource}>
                        <SelectTrigger data-testid="select-scrape-source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          <SelectItem value="jee advanced">JEE Advanced</SelectItem>
                          <SelectItem value="jee main">JEE Main</SelectItem>
                          <SelectItem value="cbse">CBSE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max papers per source</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={scrapeMax}
                        onChange={(e) => setScrapeMax(e.target.value)}
                        data-testid="input-scrape-max"
                      />
                    </div>
                  </div>
                )}
                <Button
                  onClick={() => scrapeMutation.mutate()}
                  disabled={scrapeMutation.isPending}
                  data-testid="button-scrape"
                >
                  {scrapeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Scraping... (this may take a few minutes)
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-1.5" />
                      {scrapeUrl.trim() ? "Scrape This URL" : "Start Scraping"}
                    </>
                  )}
                </Button>
                {scrapeResult && (
                  <div className="p-3 rounded-md bg-muted/40 text-sm space-y-2">
                    <p className="font-medium">
                      Found {scrapeResult.totalFound} questions, saved {scrapeResult.totalSaved} to database
                    </p>
                    <div className="space-y-1">
                      {scrapeResult.results.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={r.error ? "text-red-500" : "text-green-600"}>
                            {r.error ? "✗" : "✓"}
                          </span>
                          <span className="flex-1">{r.paper}</span>
                          {!r.error && (
                            <span className="text-muted-foreground">
                              {r.questionsFound} found, {r.saved} saved
                            </span>
                          )}
                          {r.error && <span className="text-red-500">{r.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Questions ({filtered.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 h-8 w-40 text-xs"
                        placeholder="Filter by subject..."
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                        data-testid="input-filter-subject"
                      />
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 h-8 w-40 text-xs"
                        placeholder="Search content..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        data-testid="input-filter-text"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    {masterQuestions?.length === 0
                      ? "No questions in master bank yet. Use bulk upload or PDF upload to add questions."
                      : "No questions match your filters."}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-auto">
                    {filtered.map((q) => (
                      <div
                        key={q.id}
                        className="p-3 rounded-md border bg-card flex items-start gap-3"
                        data-testid={`card-master-question-${q.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">{q.subject}</Badge>
                            {q.chapter && <Badge variant="secondary" className="text-xs">{q.chapter}</Badge>}
                            <Badge variant="secondary" className="text-xs">{q.topic}</Badge>
                            {q.source && <span className="text-xs text-muted-foreground">Source: {q.source}</span>}
                            {(q as any).board && <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950">{(q as any).board}</Badge>}
                            {(q as any).className && <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950">Class {(q as any).className}</Badge>}
                            {(q as any).exam && <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950">{(q as any).exam}</Badge>}
                            {(q as any).year && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{(q as any).year}</Badge>}
                          </div>
                          <div className="text-sm line-clamp-3">
                            <LatexRenderer content={q.latexContent} diagramLatex={q.diagramLatex} className="text-sm" />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(q.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-master-${q.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  All Users ({dashboard?.totalUsers || 0})
                </h2>
              </CardHeader>
              <CardContent>
                {!dashboard?.users ? (
                  <div className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : dashboard.users.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No users yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.users.map((u) => (
                      <div key={u.id} className="p-4 rounded-md border bg-card hover:bg-muted/20 transition-colors" data-testid={`user-detail-${u.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">
                                {u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : "Unnamed User"}
                              </p>
                              {u.role === "admin" && (
                                <Badge className="bg-amber-500 text-white text-[10px]">Admin</Badge>
                              )}
                              {u.role === "teacher" && (
                                <Badge variant="secondary" className="text-[10px]">Teacher</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              {u.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {u.phone}
                                </span>
                              )}
                              {u.email && (
                                <span>{u.email}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                              <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 bg-blue-500/5">
                                <BookOpen className="w-3 h-3 mr-1" />
                                {u.questionCount} questions
                              </Badge>
                              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-600 bg-purple-500/5">
                                <FileText className="w-3 h-3 mr-1" />
                                {u.paperCount} papers
                              </Badge>
                              <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 bg-emerald-500/5" title={`Saved: ${formatCurrency(u.savedAiCost ?? 0, user?.currency || "USD")} • Unsaved: ${formatCurrency((u.totalAiCost ?? 0) - (u.savedAiCost ?? 0), user?.currency || "USD")}`}>
                                {formatCurrency(u.totalAiCost ?? 0, user?.currency || "USD")} AI Cost
                              </Badge>
                            </div>
                            {u.subjects.length > 0 && (
                              <div className="flex items-center gap-1 mt-2 flex-wrap">
                                {u.subjects.map((s) => (
                                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                  <MoreVertical className="w-4 h-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {u.role === "teacher" ? (
                                  <DropdownMenuItem
                                    onClick={() => updateRoleMutation.mutate({ userId: u.id, role: "admin" })}
                                    disabled={updateRoleMutation.isPending}
                                  >
                                    <ShieldCheck className="w-4 h-4 mr-2 text-emerald-500" />
                                    Make Admin
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => updateRoleMutation.mutate({ userId: u.id, role: "teacher" })}
                                    disabled={u.id === user?.id || updateRoleMutation.isPending}
                                    className={u.id === user?.id ? "opacity-50" : "text-amber-600"}
                                  >
                                    <Shield className="w-4 h-4 mr-2" />
                                    Remove Admin
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "tools" && (
          <div className="space-y-4">



            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  Model Configuration
                </h2>
                <p className="text-xs text-muted-foreground">Select the default models for background tasks. Gemma 4 (open-weight) is the default; Gemini models use the same API key.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingSettings ? (
                  <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
                ) : systemSettings && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Image Generation Model</Label>
                      <Select
                        value={systemSettings.imageGenerationModel}
                        onValueChange={(val) => updateSettingsMutation.mutate({ imageGenerationModel: val })}
                        disabled={updateSettingsMutation.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODEL_OPTIONS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Used for complex bounding box diagram extraction from images.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Answer Generation Model</Label>
                      <Select
                        value={systemSettings.answerGenerationModel}
                        onValueChange={(val) => updateSettingsMutation.mutate({ answerGenerationModel: val })}
                        disabled={updateSettingsMutation.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODEL_OPTIONS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Used to solve questions and generate LaTeX answer keys.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Extraction Model</Label>
                      <Select
                        value={systemSettings.extractionModel}
                        onValueChange={(val) => updateSettingsMutation.mutate({ extractionModel: val })}
                        disabled={updateSettingsMutation.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODEL_OPTIONS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Used for bulk parsing text from images and PDF scraping.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Review Configuration
                </h2>
                <p className="text-xs text-muted-foreground">Manage the model and settings used for matching and scoring master question exceptions.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Review Model</Label>
                    <Select
                      value={systemSettings?.reviewModel || "gemma-4-26b-a4b-it"}
                      onValueChange={(val) => updateSettingsMutation.mutate({ reviewModel: val })}
                      disabled={updateSettingsMutation.isPending || loadingSettings}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODEL_OPTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Used for AI scoring of user edits against the master question.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Master Match Review Threshold (%)</Label>
                    <Input
                      type="number"
                      min="80" max="100"
                      className="h-8 text-xs"
                      defaultValue={systemSettings?.masterMatchThreshold || 85}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 80 && val <= 100) {
                          updateSettingsMutation.mutate({ masterMatchThreshold: val });
                        } else if (val < 80) {
                          toast({ title: "Invalid Threshold", description: "Threshold cannot be less than 80%.", variant: "destructive" });
                          e.target.value = "80";
                          updateSettingsMutation.mutate({ masterMatchThreshold: 80 });
                        }
                      }}
                      disabled={updateSettingsMutation.isPending || loadingSettings}
                    />
                    <p className="text-[10px] text-muted-foreground">The similarity percentage required for an extracted question to be auto-replaced.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  AI Pricing Configuration
                </h2>
                <p className="text-xs text-muted-foreground">Manage and preview the current Gemini pricing rates used to calculate platform costs.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-sm">Update Pricing from Google</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Scrape the latest pricing chart from Google AI Studio docs to keep cost tracking accurate.
                    </p>
                  </div>
                  <Button
                    onClick={() => updatePricingMutation.mutate()}
                    disabled={updatePricingMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {updatePricingMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      "Fetch Latest Pricing"
                    )}
                  </Button>
                </div>

                <div className="pt-2 border-t">
                  <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <ChartLine className="w-4 h-4" />
                    Live Pricing Preview
                  </h3>

                  {loadingPricing ? (
                    <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
                  ) : pricingChart ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(pricingChart).map(([model, data]: [string, any]) => (
                        <div key={model} className="p-3 rounded-md border bg-muted/20 space-y-2">
                          <div className="font-medium text-xs text-primary">{model}</div>
                          {data.tiers?.map((tier: any, i: number) => (
                            <div key={i} className="text-[10px] space-y-0.5">
                              <div className="text-muted-foreground font-medium">
                                {data.tiers.length === 1
                                  ? "Flat Rate (All tokens)"
                                  : `Tier ${i + 1} ${tier.threshold === null ? "(>200k tokens)" : `(<= ${tier.threshold / 1000}k tokens)`}`}
                              </div>
                              <div className="flex justify-between">
                                <span>Input:</span>
                                <span>${tier.promptRate.toFixed(3)} / 1M</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Output:</span>
                                <span>${tier.completionRate.toFixed(3)} / 1M</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No pricing data available. Click fetch to update.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  System Tools
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-md border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-sm">Clear Local Cache</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Invalidates all local cached data to force fresh fetching from the server. Useful if you notice stale data.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    queryClient.clear();
                    // Clear local storage items that start with 'extract_job_' or other caching artifacts
                    Object.keys(localStorage).forEach(key => {
                      if (key.startsWith('extract_job_') || key === 'extract_jobs_index') {
                        localStorage.removeItem(key);
                      }
                    });
                    toast({ title: "Cache & Local Storage Cleared", description: "All local API cache and job artifacts have been invalidated." });
                  }}>Clear Cache</Button>
                </div>

                <div className="p-4 rounded-md border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-75">
                  <div>
                    <h3 className="font-medium text-sm">Sync Supabase Storage (Migration Completed)</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check for and resolve any broken image links or missing files in your Supabase storage bucket.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" disabled>Sync Storage</Button>
                </div>
                <div className="p-4 rounded-md border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-sm">Sync Question Libraries</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Runs a script to match all user questions against the master library and link them if they are similar.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMasterQuestionsMutation.mutate()}
                    disabled={syncMasterQuestionsMutation.isPending}
                  >
                    {syncMasterQuestionsMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Syncing...</>
                    ) : (
                      "Sync Libraries"
                    )}
                  </Button>
                </div>

                <div className="p-4 rounded-md border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-sm">Delete All Completed Jobs</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Clears the jobs history by deleting all completed job records.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40"
                    size="sm"
                    onClick={() => cleanupJobsMutation.mutate()}
                    disabled={cleanupJobsMutation.isPending}
                  >
                    {cleanupJobsMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Deleting...</>
                    ) : (
                      "Delete Jobs"
                    )}
                  </Button>
                </div>

                <div className="p-4 rounded-md border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-sm">Clear Processed Exceptions</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Permanently deletes all 'approved' and 'rejected' exceptions from the database.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="secondary"
                        className="bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40"
                        size="sm"
                        disabled={clearExceptionsMutation.isPending}
                      >
                        {clearExceptionsMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Clearing...</>
                        ) : (
                          "Clear Exceptions"
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all approved and rejected exceptions. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => clearExceptionsMutation.mutate()}>Continue</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "exceptions" && <AdminExceptionsView />}
      </div>
    </div>
  );
}
