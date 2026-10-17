import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Logo } from "@/components/logo";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { FileText, Weight } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { DynamicFavicon } from "@/components/dynamic-favicon";
import { fetchExchangeRates } from "@/lib/utils";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import UploadPage from "@/pages/upload";
import Library from "@/pages/library";
import CreatePaper from "@/pages/create-paper";
import Papers from "@/pages/papers";
import PaperView from "@/pages/paper-view";
import AnswerKeyView from "@/pages/answer-key-view";
import BrandingPage from "@/pages/branding";
import AccountPage from "@/pages/account";
import AdminPage from "@/pages/admin";
import PdfUploadPage from "@/pages/pdf-upload";
import ResetPasswordPage from "@/pages/reset-password";
import { useJobs } from "@/hooks/use-jobs";

function ThemeSync() {
  const { user } = useAuth();
  const { setTheme, setColorPreset } = useTheme();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (user && !initialized) {
      if (user.theme) {
        setTheme(user.theme as any, false);
      }
      if (user.colorPreset) {
        setColorPreset(user.colorPreset as any, false);
      }
      setInitialized(true);
    }
  }, [user, initialized, setTheme, setColorPreset]);

  return null;
}

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

function AppHeaderTrigger() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  if (state === "expanded" && !isMobile) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      data-testid="button-sidebar-toggle"
      className="scale-125"
    >
      <Menu className="w-5 h-5 text-primary" />
    </Button>
  );
}

function AuthenticatedLayout() {
  useJobs();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <ThemeSync />
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b print:hidden bg-background sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <AppHeaderTrigger />
            </div>
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer">
                <Logo className="w-10 h-11 text-primary" />
                <span className="font-bold text-xl md:text-2xl tracking-tight text-foreground">
                  Test<span className="text-primary">Made</span>Easy
                </span>
              </Link>
            </div>
          </header>
          <main className="flex-1 overflow-auto relative">
            <div className="px-4 sm:px-6 pb-12 sm:pb-16 pt-4 sm:pt-6 min-h-full flex flex-col relative">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/upload" component={UploadPage} />
                <Route path="/library" component={Library} />
                <Route path="/create-paper" component={CreatePaper} />
                <Route path="/papers" component={Papers} />
                <Route path="/papers/:id" component={PaperView} />
                <Route path="/papers/:id/answer-key" component={AnswerKeyView} />
                <Route path="/branding" component={BrandingPage} />
                <Route path="/account" component={AccountPage} />
                <Route path="/admin" component={AdminPage} />
                <Route path="/admin/pdf-upload" component={PdfUploadPage} />
                <Route path="/reset-password" component={ResetPasswordPage} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!user || isLoading) return;
    const hash = window.location.hash;
    const onAuthCallback =
      location === "/login" ||
      hash.includes("access_token=") ||
      hash.includes("error=");
    if (onAuthCallback) {
      window.history.replaceState(null, "", "/");
      setLocation("/");
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  useEffect(() => {
    fetchExchangeRates();
  }, []);

  return (
    <ThemeProvider defaultTheme="light" defaultColorPreset="default">
      <DynamicFavicon />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
