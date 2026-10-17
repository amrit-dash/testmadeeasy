import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";

export default function ResetPasswordPage() {
    const { toast } = useToast();
    const [password, setPassword] = useState("");
    const [, setLocation] = useLocation();

    const resetMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });
            if (error) throw error;
            return true;
        },
        onSuccess: () => {
            toast({ title: "Password updated!", description: "Your password has been changed successfully." });
            setLocation("/");
        },
        onError: (err: Error) => {
            toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
    });

    return (
        <div className="min-h-full bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <div className="flex justify-center mb-4">
                        <Logo className="w-16 h-16 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Reset Password
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">Enter your new password below</p>
                </div>

                <Card>
                    <CardHeader className="pb-4">
                        <h2 className="text-base font-semibold text-center">Set New Password</h2>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                resetMutation.mutate();
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="password">New Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Enter your new password"
                                        className="pl-9"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={resetMutation.isPending}
                            >
                                {resetMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : null}
                                Update Password
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}