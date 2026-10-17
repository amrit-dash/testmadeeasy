import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { Logo } from "@/components/logo";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<"login" | "signup" | "forgot">("login");

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Must land on a Cloud Run–proxied path (not Firebase static public/index.html).
        redirectTo: `${window.location.origin}/login`,
      }
    });
    if (error) {
      toast({ title: "Google Login Failed", description: error.message, variant: "destructive" });
    }
  };

  const authMutation = useMutation({
    mutationFn: async () => {
      if (view === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        return "forgot_password";
      } else if (view === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Depending on Supabase settings, the user might need to confirm email
        return "signed_up";
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        return "logged_in";
      }
    },
    onSuccess: (result) => {
      if (result === "forgot_password") {
        toast({ title: "Reset link sent!", description: "Check your email for the password reset link." });
        setView("login");
      } else if (result === "signed_up") {
        toast({ title: "Account created!", description: "You can now log in." });
        setView("login");
      } else {
        window.location.href = "/";
      }
    },
    onError: (err: Error) => {
      toast({ title: "Authentication failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo className="w-20 h-20 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-login-title">
            Test<span className="text-primary">Made</span>Easy
          </h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in or create a free account</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-semibold text-center">
              {view === "signup" ? "Create an Account" : view === "forgot" ? "Reset Password" : "Sign In"}
            </h2>
            {view === "forgot" && (
              <p className="text-sm text-center text-muted-foreground mt-2">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {view !== "forgot" && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleLogin}
                  data-testid="button-google-login"
                >
                  <FcGoogle className="w-5 h-5 mr-2" />
                  Continue with Google
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
                  </div>
                </div>
              </>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                authMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {view !== "forgot" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {view === "login" && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setView("forgot")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={authMutation.isPending}
              >
                {authMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {view === "signup" ? "Sign Up" : view === "forgot" ? "Send Reset Link" : "Log In"}
              </Button>
            </form>

            <div className="text-center text-sm">
              {view === "signup" ? (
                <p>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setView("login")}
                  >
                    Log in
                  </button>
                </p>
              ) : view === "forgot" ? (
                <p>
                  Remember your password?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setView("login")}
                  >
                    Log in
                  </button>
                </p>
              ) : (
                <p>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setView("signup")}
                  >
                    Sign up
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
