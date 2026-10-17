import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, User, Shield, Phone, Mail, Clock, Save, Edit2, LogOut, Loader2, Camera, UploadCloud, Palette, Building2, ImagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchWithAuth } from "@/lib/queryClient";
import type { TeacherProfile } from "@shared/schema";
import { supabase } from "@/lib/supabase";

export default function AccountPage() {
    const [, navigate] = useLocation();
    const { user, logout } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [isEditing, setIsEditing] = useState(false);

    // User Form State
    const [firstName, setFirstName] = useState(user?.firstName || "");
    const [lastName, setLastName] = useState(user?.lastName || "");
    const [phone, setPhone] = useState(user?.phone || "");
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [previewProfileImage, setPreviewProfileImage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: profile } = useQuery<TeacherProfile | null>({
        queryKey: ["/api/profile"],
    });

    // Coaching Form State
    const [coachingName, setCoachingName] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [coachingLogo, setCoachingLogo] = useState<File | null>(null);
    const [previewCoachingLogo, setPreviewCoachingLogo] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Sync profile state when it loads
    useEffect(() => {
        if (profile) {
            setCoachingName(profile.coachingName || "");

            // Clean up any combined "phone | email" strings from older branding settings
            let defaultEmail = profile.contactInfo || user?.email || "";
            if (defaultEmail.includes("|")) {
                const parts = defaultEmail.split("|");
                defaultEmail = parts[parts.length - 1].trim();
            }
            setContactEmail(defaultEmail);
        }
    }, [profile, user]);

    const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfileImage(file);
            setPreviewProfileImage(URL.createObjectURL(file));
        }
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setCoachingLogo(file);
            setPreviewCoachingLogo(URL.createObjectURL(file));
        }
    };

    const updateProfileMutation = useMutation({
        mutationFn: async () => {
            // 1. Update User Profile (Name, Phone, Profile Image)
            const userFormData = new FormData();
            userFormData.append("firstName", firstName || "");
            userFormData.append("lastName", lastName || "");
            userFormData.append("phone", phone || "");
            if (profileImage) {
                userFormData.append("profileImage", profileImage);
            }

            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;

            const userRes = await fetch("/api/auth/user/profile", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: userFormData
            });

            if (!userRes.ok) {
                const errData = await userRes.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to update user profile");
            }

            // 2. Update Teacher Profile (Coaching Name, Logo)
            const profileFormData = new FormData();
            profileFormData.append("coachingName", coachingName);
            profileFormData.append("contactInfo", contactEmail);

            // Retain existing profile fields so they aren't lost
            if (profile?.teacherName) profileFormData.append("teacherName", profile.teacherName);

            let parsedFormat: any = {};
            if (profile?.headerFormat) {
                try {
                    parsedFormat = JSON.parse(profile.headerFormat);
                } catch { }
            }
            parsedFormat.contactEmail = contactEmail;
            parsedFormat.contactPhone = phone;
            profileFormData.append("headerFormat", JSON.stringify(parsedFormat));

            if (profile?.watermarkText) profileFormData.append("watermarkText", profile.watermarkText);
            if (profile?.accentColor) profileFormData.append("accentColor", profile.accentColor);

            if (coachingLogo) {
                profileFormData.append("logo", coachingLogo);
            } else if (profile?.logoUrl) {
                profileFormData.append("logoUrl", profile.logoUrl);
            }

            const profileRes = await fetch("/api/profile", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: profileFormData
            });

            if (!profileRes.ok) throw new Error("Failed to update teacher profile");
        },
        onSuccess: () => {
            // Optimistically update the sidebar and local auth state immediately
            if (previewProfileImage) {
                queryClient.setQueryData(["/api/auth/user"], (old: any) => {
                    return old ? { ...old, profileImageUrl: previewProfileImage, firstName, lastName, phone } : old;
                });
            } else {
                queryClient.setQueryData(["/api/auth/user"], (old: any) => {
                    return old ? { ...old, firstName, lastName, phone } : old;
                });
            }

            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
            toast({ title: "Profile updated successfully" });
            setIsEditing(false);
            setProfileImage(null);
            setCoachingLogo(null);
            setPreviewProfileImage(null);
            setPreviewCoachingLogo(null);
        },
        onError: (err) => {
            toast({ title: err.message || "Failed to update profile", variant: "destructive" });
        },
    });

    return (
        <div className="flex flex-col absolute inset-0 bg-background z-10 overflow-hidden">
            <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20 flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-account">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold" data-testid="text-account-title">My Account</h1>
                    <p className="text-sm text-muted-foreground">Manage your personal settings and profile</p>
                </div>
            </div>

            <div
                className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-10 pb-12 sm:pb-16 w-full max-w-4xl mx-auto space-y-8 scrollbar-hide [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {/* Profile Header Card */}
                <Card className="border-none shadow-md overflow-hidden bg-card/60 backdrop-blur-sm relative">
                    {/* Top gradient accent line */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

                    <CardContent className="p-6 sm:p-8">
                        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">

                            {/* Profile Info Section */}
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 min-w-0">
                                {/* Profile Picture Area */}
                                <div className="relative group shrink-0">
                                    <Avatar className="w-28 h-28 border-4 border-background shadow-lg ring-1 ring-border/50">
                                        <AvatarImage src={previewProfileImage || user?.profileImageUrl || undefined} className="object-cover" />
                                        <AvatarFallback className="text-3xl bg-muted text-foreground font-medium">
                                            {(user?.firstName?.[0] || "") + (user?.lastName?.[0] || "") || <User className="w-12 h-12 text-muted-foreground" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    {isEditing && (
                                        <>
                                            <div
                                                className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-[2px]"
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <Camera className="w-8 h-8 text-white mb-1" />
                                                <span className="text-[10px] font-medium text-white/90">Change</span>
                                            </div>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleProfileImageChange}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Profile Info Summary */}
                                <div className="flex-1 min-w-0 text-center sm:text-left pt-2">
                                    <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                                        <h2 className="text-3xl font-bold truncate tracking-tight">{user?.firstName} {user?.lastName}</h2>
                                        {user?.role === "admin" ? (
                                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/20 shadow-sm" data-testid="badge-admin-role">
                                                <Shield className="w-3 h-3 mr-1.5" />
                                                Admin
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-muted text-muted-foreground border-none" data-testid="badge-teacher-role">
                                                <User className="w-3 h-3 mr-1.5" />
                                                Teacher
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-4 space-y-2 flex flex-col items-center sm:items-start">
                                        <div className="flex items-center gap-2.5 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full w-fit max-w-full">
                                            <Mail className="w-4 h-4 shrink-0 text-primary/70" />
                                            <span className="truncate">{user?.email || "No email provided"}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-sm text-muted-foreground px-3 py-1">
                                            <Clock className="w-4 h-4 shrink-0 text-primary/70" />
                                            <span>Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : "—"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Group */}
                            <div className="flex flex-col gap-3 shrink-0 w-full md:w-64 mt-2 md:mt-0">
                                <div className="flex items-center gap-3 w-full">
                                    <Button
                                        variant={isEditing ? "outline" : "secondary"}
                                        onClick={() => isEditing ? setIsEditing(false) : setIsEditing(true)}
                                        className="shadow-sm flex-1 transition-all"
                                    >
                                        {isEditing ? <ArrowLeft className="w-4 h-4 mr-2" /> : <Edit2 className="w-4 h-4 mr-2" />}
                                        {isEditing ? "Cancel" : "Edit Profile"}
                                    </Button>
                                    {isEditing ? (
                                        <Button
                                            onClick={() => updateProfileMutation.mutate()}
                                            disabled={updateProfileMutation.isPending}
                                            className="shadow-sm flex-1 transition-all"
                                        >
                                            {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                            Save
                                        </Button>
                                    ) : (
                                        <Button variant="destructive" onClick={() => logout()} className="shadow-sm px-3 hover:bg-destructive/90 transition-all">
                                            <LogOut className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>

                                <div className="relative flex items-center w-full my-1">
                                    <div className="flex-grow border-t border-border/60"></div>
                                    <span className="flex-shrink-0 mx-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Settings</span>
                                    <div className="flex-grow border-t border-border/60"></div>
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => navigate("/branding")}
                                    className="shadow-sm w-full bg-background hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all justify-start"
                                >
                                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center mr-3 shrink-0">
                                        <Palette className="w-4 h-4 text-primary" />
                                    </div>
                                    <span className="font-medium">Branding Center</span>
                                </Button>
                            </div>

                        </div>
                    </CardContent>
                </Card>

                {/* Details Form Card - Full Width */}
                <Card className="border-none shadow-md overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="border-b bg-muted/10 pb-5">
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-primary" />
                            Personal & Coaching Information
                        </CardTitle>
                        <CardDescription>Update your contact details and coaching branding preferences.</CardDescription>
                    </CardHeader>

                    <CardContent className="p-0">
                        {isEditing ? (
                            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
                                {/* Personal Details Section */}
                                <div className="p-5 sm:p-6 space-y-5 bg-background/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="h-5 w-1 bg-primary rounded-full"></div>
                                        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Personal Details</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="firstName" className="text-[11px] font-medium text-muted-foreground">First Name</Label>
                                            <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="h-8 text-sm bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary/50" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="lastName" className="text-[11px] font-medium text-muted-foreground">Last Name</Label>
                                            <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="h-8 text-sm bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary/50" />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <Label htmlFor="email" className="text-[11px] font-medium text-muted-foreground">Email</Label>
                                            <div className="relative">
                                                <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                                                <Input id="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="h-8 text-sm pl-8 bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary/50" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <Label htmlFor="phone" className="text-[11px] font-medium text-muted-foreground">Phone Number</Label>
                                            <div className="relative">
                                                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                                                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" className="h-8 text-sm pl-8 bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary/50" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Coaching Details Section */}
                                <div className="p-5 sm:p-6 space-y-5 bg-muted/5">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-1 bg-primary rounded-full"></div>
                                            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Coaching Details</h3>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] py-0 h-4 font-normal text-muted-foreground border-border/50 bg-background hidden sm:flex">For Test Paper Branding</Badge>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="coachingName" className="text-[11px] font-medium text-muted-foreground">Institute Name</Label>
                                            <div className="relative">
                                                <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                                                <Input id="coachingName" value={coachingName} onChange={e => setCoachingName(e.target.value)} placeholder="e.g. Apex Academy" className="h-8 text-sm pl-8 bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary/50" />
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-1">
                                            <Label className="text-[11px] font-medium text-muted-foreground">Coaching Logo</Label>
                                            <div className="flex items-center gap-4 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-background/50">
                                                <div className="w-14 h-14 rounded-md border shadow-sm flex items-center justify-center overflow-hidden bg-white shrink-0">
                                                    {(previewCoachingLogo || profile?.logoUrl) ? (
                                                        <img src={previewCoachingLogo || profile?.logoUrl || undefined} alt="Logo" className="w-full h-full object-contain p-1" />
                                                    ) : (
                                                        <ImagePlus className="w-6 h-6 text-muted-foreground/30" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <input
                                                        type="file"
                                                        ref={logoInputRef}
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={handleLogoChange}
                                                    />
                                                    <Button variant="secondary" size="sm" onClick={() => logoInputRef.current?.click()} className="h-8 text-xs shadow-sm">
                                                        <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                                                        Upload Logo
                                                    </Button>
                                                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                                                        Recommended format: PNG with transparent background. Ideal size: 200x200px.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-5 sm:p-6">
                                <div className="grid md:grid-cols-2 gap-y-8 gap-x-12">
                                    {/* View Personal Info */}
                                    <div className="space-y-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="h-5 w-1 bg-primary/60 rounded-full"></div>
                                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal Profile</h3>
                                        </div>

                                        <div className="space-y-5">
                                            <div className="group">
                                                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Full Name</span>
                                                <div className="font-medium text-[15px] mt-0.5 text-foreground group-hover:text-primary transition-colors">{user?.firstName} {user?.lastName}</div>
                                            </div>

                                            <div className="group">
                                                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Email Address</span>
                                                <div className="font-medium text-[15px] mt-0.5 text-foreground truncate group-hover:text-primary transition-colors">{contactEmail || user?.email || "Not provided"}</div>
                                            </div>

                                            <div className="group">
                                                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Phone Number</span>
                                                <div className="font-medium text-[15px] mt-0.5 text-foreground group-hover:text-primary transition-colors">{user?.phone || "Not provided"}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* View Coaching Info */}
                                    <div className="space-y-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="h-5 w-1 bg-primary/60 rounded-full"></div>
                                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coaching Branding</h3>
                                        </div>

                                        <div className="space-y-5">
                                            <div className="group">
                                                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Institute Name</span>
                                                <div className="font-medium text-[15px] mt-0.5 text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                                                    {profile?.coachingName || <span className="text-muted-foreground italic font-normal">Not configured</span>}
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Institute Logo</span>
                                                <div className="mt-1.5">
                                                    {profile?.logoUrl ? (
                                                        <div className="w-14 h-14 rounded-md border shadow-sm p-1.5 bg-white transition-transform hover:scale-105">
                                                            <img src={profile.logoUrl} alt="Coaching Logo" className="w-full h-full object-contain" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/10">
                                                            <ImagePlus className="w-5 h-5 text-muted-foreground/30" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>

                </Card>
            </div>
        </div>
    );
}
