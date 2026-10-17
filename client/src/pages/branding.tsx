import { fetchWithAuth } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Upload, User, LayoutTemplate, Palette, Type, AlignLeft, AlignCenter, AlignRight, Save, Paintbrush, Settings2, MoveHorizontalIcon, PaintBucketIcon, LayoutListIcon, LayoutDashboardIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { TeacherProfile } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TestPaperHeader, getFontString } from "@/components/paper-header";

const AlternateIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="4" y="5" width="6" height="3" rx="0.5" />
    <rect x="14" y="5" width="6" height="3" rx="0.5" />
    <rect x="4" y="10.5" width="6" height="3" rx="0.5" />
    <rect x="14" y="10.5" width="6" height="3" rx="0.5" />
    <rect x="4" y="16" width="6" height="3" rx="0.5" />
    <rect x="14" y="16" width="6" height="3" rx="0.5" />
  </svg>
);

export default function BrandingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [coachingName, setCoachingName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState("");

  const [accentColor, setAccentColor] = useState("#000000");
  const [secondaryAccentColor, setSecondaryAccentColor] = useState("#6b7280");

  // General Style
  const [headerStyle, setHeaderStyle] = useState("classic");
  const [logoPosition, setLogoPosition] = useState("left");
  const [logoSize, setLogoSize] = useState("medium");

  // Header Formatting
  const [headerFontFamily, setHeaderFontFamily] = useState("century");
  const [headerFontSize, setHeaderFontSize] = useState("medium");
  const [subHeaderFontSize, setSubHeaderFontSize] = useState("medium");
  const [headerPadding, setHeaderPadding] = useState("small");
  const [headerAlignment, setHeaderAlignment] = useState("left");

  // Body Formatting
  const [bodyFontFamily, setBodyFontFamily] = useState("century");
  const [bodyFontSize, setBodyFontSize] = useState("medium");
  const [bodyMargin, setBodyMargin] = useState("standard");
  const [bodyAlignment, setBodyAlignment] = useState("alternate");

  // Number Formatting
  const [questionNumbering, setQuestionNumbering] = useState("q-number");
  const [optionNumbering, setOptionNumbering] = useState("a-b-c-d");

  // Extra / Spacing / Borders
  const [showBorder, setShowBorder] = useState(true);
  const [borderThickness, setBorderThickness] = useState("2");
  const [borderMargin, setBorderMargin] = useState("none");
  const [watermarkOpacity, setWatermarkOpacity] = useState("3");
  const [questionSpacing, setQuestionSpacing] = useState("tight");
  const [optionSpacing, setOptionSpacing] = useState("tight");
  const [isInitializing, setIsInitializing] = useState(true);

  const { data: profile, isLoading: isProfileLoading, isFetching: isProfileFetching } = useQuery<TeacherProfile | null>({
    queryKey: ["/api/profile"],
  });

  useEffect(() => {
    if (profile) {
      setCoachingName(profile.coachingName || "");
      setTeacherName(profile.teacherName || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ""));
      setLogoPreview(profile.logoUrl || null);
      setWatermarkText(profile.watermarkText || "");
      setAccentColor(profile.accentColor || "#000000");

      let p = "";
      let e = "";

      try {
        const parsed = JSON.parse(profile.headerFormat || '{}');
        let hStyle = parsed.style || "classic";
        if (hStyle === "standard") hStyle = "classic";
        setHeaderStyle(hStyle);
        setLogoPosition(parsed.logoPosition || "left");
        setLogoSize(parsed.logoSize || "medium");

        setHeaderFontFamily(parsed.headerFontFamily || parsed.fontFamily || "century");
        setHeaderFontSize(parsed.headerFontSize || parsed.textSize || "medium");
        setSubHeaderFontSize(parsed.subHeaderFontSize || "medium");
        setHeaderPadding(parsed.headerPadding || parsed.paddingSize || "small");
        setHeaderAlignment(parsed.headerAlignment || parsed.alignment || "left");

        setBodyFontFamily(parsed.bodyFontFamily || parsed.fontFamily || "century");
        setBodyFontSize(parsed.bodyFontSize || "medium");
        setBodyMargin(parsed.bodyMargin || parsed.pageMargin || "standard");
        setBodyAlignment(parsed.bodyAlignment || "alternate");

        setQuestionNumbering(parsed.questionNumbering || "q-number");
        setOptionNumbering(parsed.optionNumbering || "a-b-c-d");

        setShowBorder(parsed.showBorder ?? true);
        setBorderThickness(parsed.borderThickness || "2");
        setBorderMargin(parsed.borderMargin || "none");

        setWatermarkOpacity(parsed.watermarkOpacity || "3");
        setQuestionSpacing(parsed.questionSpacing || "tight");
        setOptionSpacing(parsed.optionSpacing || "tight");
        setSecondaryAccentColor(parsed.secondaryAccentColor || "#6b7280");

        p = parsed.contactPhone ?? "";
        e = parsed.contactEmail ?? "";
      } catch (err) {
        let fallbackStyle = profile.headerFormat || "classic";
        if (fallbackStyle === "standard") fallbackStyle = "classic";
        setHeaderStyle(fallbackStyle);
      }

      if (!p && !e && profile.contactInfo) {
        p = profile.contactInfo;
      }
      setContactPhone(p || (user?.phone || ""));
      setContactEmail(e || (user?.email || ""));

      setTimeout(() => setIsInitializing(false), 50);
    } else if (user) {
      setTeacherName(`${user.firstName || ''} ${user.lastName || ''}`.trim());
      setContactPhone(user.phone || "");
      setContactEmail(user.email || "");
      setTimeout(() => setIsInitializing(false), 50);
    }
  }, [profile, user]);

  const availableLogoPositions = () => {
    switch (headerStyle) {
      case 'minimalist': return ['hidden'];
      case 'elegant': return ['center', 'hidden'];
      case 'split-header': return ['left', 'hidden'];
      case 'modern-line': return ['left', 'right', 'hidden'];
      default: return ['left', 'right', 'hidden']; // classic, boxed, modern
    }
  };

  useEffect(() => {
    const validPositions = availableLogoPositions();
    setLogoPosition(prev => validPositions.includes(prev) ? prev : validPositions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerStyle]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const formatJson = JSON.stringify({
        style: headerStyle,
        logoPosition,
        logoSize,
        headerFontFamily,
        headerFontSize,
        subHeaderFontSize,
        headerPadding,
        headerAlignment,
        bodyFontFamily,
        bodyFontSize,
        bodyMargin,
        bodyAlignment,
        questionNumbering,
        optionNumbering,
        showBorder,
        borderThickness,
        borderMargin,
        contactPhone,
        contactEmail,
        watermarkOpacity,
        questionSpacing,
        optionSpacing,
        secondaryAccentColor
      });

      const contactInfoStr = [contactPhone, contactEmail].filter(Boolean).join(" | ");

      const formData = new FormData();
      formData.append("coachingName", coachingName);
      formData.append("teacherName", teacherName);
      formData.append("contactInfo", contactInfoStr);
      formData.append("headerFormat", formatJson);
      formData.append("watermarkText", watermarkText);
      formData.append("accentColor", accentColor);
      if (logoFile) formData.append("logo", logoFile);
      else if (logoPreview) formData.append("logoUrl", logoPreview);

      const res = await fetchWithAuth("/api/profile", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      // Remove test papers query completely so it forces a hard reload (no stale UI) when navigating back
      queryClient.removeQueries({ queryKey: ["/api/test-papers"] });
      toast({ title: "Branding saved", description: "Your test paper styles have been updated!" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // Helper classes for preview rendering
  const bodySizeClass = bodyFontSize === 'small' ? 'text-[10px]' : bodyFontSize === 'large' ? 'text-sm' : 'text-xs';
  const bodySizeLgClass = bodyFontSize === 'small' ? 'text-xs' : bodyFontSize === 'large' ? 'text-base' : 'text-sm';

  if (isProfileLoading || isProfileFetching || isInitializing) {
    return (
      <div className="flex flex-col absolute inset-0 bg-background z-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col absolute inset-0 bg-background z-10">
      <div className="flex-none bg-background pt-4 pb-4 sm:pt-6 sm:pb-6 px-4 sm:px-6 shadow-sm border-b z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/account")} data-testid="button-back-branding">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-branding-title">Paper Design</h1>
            <p className="text-sm text-muted-foreground">Set up your school name, logo, and how your papers will look</p>
          </div>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-profile"
          className="gap-2 font-medium text-white"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Save className="w-4 h-4 text-white" />
          )}
          Save Design
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 pb-12 sm:pb-16">
        <div className="grid lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {/* Form Column */}
          <div className="space-y-6">
            <Card className="border-none shadow-md">
              <CardHeader className="pb-3 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Your School / Institute Details
                </h2>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="flex items-center gap-5">
                  <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border/50">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" data-testid="img-logo-preview" />
                    ) : (
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-sm">Logo</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      data-testid="input-logo"
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground">Recommended: 200x200px, PNG or JPG</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">School or Institute Name</Label>
                  <Input
                    placeholder="e.g., ABC Physics Academy"
                    value={coachingName}
                    onChange={(e) => setCoachingName(e.target.value)}
                    data-testid="input-coaching-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Teacher Name</Label>
                  <Input
                    placeholder="e.g., Dr. Sharma"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    data-testid="input-teacher-name"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Contact Phone</Label>
                    <Input
                      placeholder="+91..."
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      data-testid="input-contact-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Contact Email</Label>
                    <Input
                      placeholder="teacher@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      data-testid="input-contact-email"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-3 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Paper Formatting Options
                </h2>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">

                {/* General Style */}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Style</Label>
                    <Select value={headerStyle} onValueChange={setHeaderStyle}>
                      <SelectTrigger><SelectValue placeholder="Style" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="classic">Classic (Standard)</SelectItem>
                        <SelectItem value="split-header">Split Header (Official)</SelectItem>
                        <SelectItem value="modern-line">Modern Line</SelectItem>
                        <SelectItem value="boxed-title">Boxed Title</SelectItem>
                        <SelectItem value="boxed-filled">Boxed Title Filled</SelectItem>
                        <SelectItem value="minimalist">Minimalist</SelectItem>
                        <SelectItem value="elegant">Elegant Centered</SelectItem>
                        <SelectItem value="full-colored">Full Colored Header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Logo Position</Label>
                    <Select value={logoPosition} onValueChange={setLogoPosition}>
                      <SelectTrigger><SelectValue placeholder="Logo Pos" /></SelectTrigger>
                      <SelectContent>
                        {availableLogoPositions().map(pos => (
                          <SelectItem key={pos} value={pos}>
                            {pos === 'left' ? 'Left Aligned' : pos === 'right' ? 'Right Aligned' : pos === 'center' ? 'Center Top' : 'Hidden'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Header Formatting */}
                <div className="grid sm:grid-cols-2 gap-6 border-t border-border/50 pt-8">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Header Font</Label>
                    <Select value={headerFontFamily} onValueChange={setHeaderFontFamily}>
                      <SelectTrigger><SelectValue placeholder="Font" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serif">Serif (Generic)</SelectItem>
                        <SelectItem value="sans">Sans-Serif (Generic)</SelectItem>
                        <SelectItem value="mono">Monospace (Generic)</SelectItem>
                        <SelectItem value="times">Times New Roman</SelectItem>
                        <SelectItem value="arial">Arial / Helvetica</SelectItem>
                        <SelectItem value="georgia">Georgia</SelectItem>
                        <SelectItem value="verdana">Verdana</SelectItem>
                        <SelectItem value="century">Century Gothic</SelectItem>
                        <SelectItem value="courier">Courier New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Header Font Size</Label>
                    <Select value={headerFontSize} onValueChange={setHeaderFontSize}>
                      <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Header Padding</Label>
                    <Select value={headerPadding} onValueChange={setHeaderPadding}>
                      <SelectTrigger><SelectValue placeholder="Padding" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Compact</SelectItem>
                        <SelectItem value="medium">Standard</SelectItem>
                        <SelectItem value="large">Spacious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Header Alignment</Label>
                    <ToggleGroup type="single" value={headerAlignment} onValueChange={(v) => v && setHeaderAlignment(v)} className="justify-start">
                      <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft className="w-4 h-4" /></ToggleGroupItem>
                      <ToggleGroupItem value="center" aria-label="Align center"><AlignCenter className="w-4 h-4" /></ToggleGroupItem>
                      <ToggleGroupItem value="right" aria-label="Align right"><AlignRight className="w-4 h-4" /></ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Logo Size</Label>
                    <Select value={logoSize} onValueChange={setLogoSize}>
                      <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Subheader Font Size</Label>
                    <Select value={subHeaderFontSize} onValueChange={setSubHeaderFontSize}>
                      <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Body Formatting */}
                <div className="grid sm:grid-cols-2 gap-6 border-t border-border/50 pt-8">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Body Font</Label>
                    <Select value={bodyFontFamily} onValueChange={setBodyFontFamily}>
                      <SelectTrigger><SelectValue placeholder="Font" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serif">Serif (Generic)</SelectItem>
                        <SelectItem value="sans">Sans-Serif (Generic)</SelectItem>
                        <SelectItem value="mono">Monospace (Generic)</SelectItem>
                        <SelectItem value="times">Times New Roman</SelectItem>
                        <SelectItem value="arial">Arial / Helvetica</SelectItem>
                        <SelectItem value="georgia">Georgia</SelectItem>
                        <SelectItem value="verdana">Verdana</SelectItem>
                        <SelectItem value="century">Century Gothic</SelectItem>
                        <SelectItem value="courier">Courier New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Body Font Size</Label>
                    <Select value={bodyFontSize} onValueChange={setBodyFontSize}>
                      <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Body Margin</Label>
                    <Select value={bodyMargin} onValueChange={setBodyMargin}>
                      <SelectTrigger><SelectValue placeholder="Margin" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="narrow">Narrow</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="wide">Wide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Diagram Alignment</Label>
                    <ToggleGroup type="single" value={bodyAlignment} onValueChange={(v) => v && setBodyAlignment(v)} className="justify-start">
                      <ToggleGroupItem value="alternate" aria-label="Alternate" title="Alternate L/R"><AlternateIcon className="w-4 h-4" /></ToggleGroupItem>
                      <ToggleGroupItem value="left" aria-label="Align left" title="Left"><AlignLeft className="w-4 h-4" /></ToggleGroupItem>
                      <ToggleGroupItem value="center" aria-label="Align center" title="Center"><AlignCenter className="w-4 h-4" /></ToggleGroupItem>
                      <ToggleGroupItem value="right" aria-label="Align right" title="Right"><AlignRight className="w-4 h-4" /></ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>

                {/* Number Formatting */}
                <div className="grid sm:grid-cols-2 gap-6 border-t border-border/50 pt-8">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Question Number Format</Label>
                    <Select value={questionNumbering} onValueChange={setQuestionNumbering}>
                      <SelectTrigger><SelectValue placeholder="Select format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number-dot">1. , 2. , 3.</SelectItem>
                        <SelectItem value="q-number">Q1. , Q2. , Q3.</SelectItem>
                        <SelectItem value="q-dot-number">Q.1 , Q.2 , Q.3</SelectItem>
                        <SelectItem value="bracket-number">(1) , (2) , (3)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Option Number Format</Label>
                    <Select value={optionNumbering} onValueChange={setOptionNumbering}>
                      <SelectTrigger><SelectValue placeholder="Select format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A-B-C-D">A., B., C., D.</SelectItem>
                        <SelectItem value="a-b-c-d">a., b., c., d.</SelectItem>
                        <SelectItem value="bracket-a">(a), (b), (c), (d)</SelectItem>
                        <SelectItem value="1-2-3-4">1., 2., 3., 4.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Theme & Extras */}
                <div className="grid sm:grid-cols-2 gap-6 items-start border-t border-border/50 pt-8">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <PaintBucketIcon className="w-4 h-4 text-muted-foreground" />
                      Primary Accent Color
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal flex items-center gap-3">
                          <div className="w-5 h-5 rounded border shadow-sm" style={{ backgroundColor: accentColor }} />
                          {accentColor.toUpperCase()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="start">
                        <HexColorPicker color={accentColor} onChange={setAccentColor} />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-mono text-muted-foreground">HEX</span>
                          <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-24 h-7 text-xs font-mono uppercase" />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Paintbrush className="w-4 h-4 text-muted-foreground" />
                      Secondary Accent Color
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal flex items-center gap-3">
                          <div className="w-5 h-5 rounded border shadow-sm" style={{ backgroundColor: secondaryAccentColor }} />
                          {secondaryAccentColor.toUpperCase()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="start">
                        <HexColorPicker color={secondaryAccentColor} onChange={setSecondaryAccentColor} />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-mono text-muted-foreground">HEX</span>
                          <Input value={secondaryAccentColor} onChange={(e) => setSecondaryAccentColor(e.target.value)} className="w-24 h-7 text-xs font-mono uppercase" />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Type className="w-4 h-4 text-muted-foreground" />
                      Watermark Text
                    </Label>
                    <Input
                      placeholder="e.g., CONFIDENTIAL / DRAFT"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                    />
                    {watermarkText && (
                      <div className="pt-2 space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Watermark Opacity</Label>
                        <Select value={watermarkOpacity} onValueChange={setWatermarkOpacity}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select opacity" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Subtle (1%)</SelectItem>
                            <SelectItem value="3">Standard (3%)</SelectItem>
                            <SelectItem value="5">Visible (5%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <LayoutListIcon className="w-4 h-4 text-muted-foreground" />
                      Spacing Settings
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal h-9 px-3">
                          <span className="flex items-center gap-2 w-full text-sm">
                            <span className="font-semibold flex-1 text-left">Q: <span className="font-normal uppercase text-xs ml-1">{questionSpacing}</span></span>
                            <span className="text-muted-foreground opacity-50">|</span>
                            <span className="font-semibold flex-1 text-left">A: <span className="font-normal uppercase text-xs ml-1">{optionSpacing}</span></span>
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-4 border border-border shadow-md rounded-md" align="end">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-muted-foreground text-center uppercase tracking-wider">QUESTIONS</h4>
                            <div className="flex flex-col gap-1">
                              <Button variant={questionSpacing === 'relaxed' ? 'secondary' : 'ghost'} size="sm" onClick={() => setQuestionSpacing('relaxed')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${questionSpacing === 'relaxed' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>WIDE</Button>
                              <Button variant={questionSpacing === 'standard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setQuestionSpacing('standard')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${questionSpacing === 'standard' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>STANDARD</Button>
                              <Button variant={questionSpacing === 'tight' ? 'secondary' : 'ghost'} size="sm" onClick={() => setQuestionSpacing('tight')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${questionSpacing === 'tight' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>COMPACT</Button>
                            </div>
                          </div>

                          <div className="h-px w-full bg-border" />

                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-muted-foreground text-center uppercase tracking-wider">OPTIONS</h4>
                            <div className="flex flex-col gap-1">
                              <Button variant={optionSpacing === 'relaxed' ? 'secondary' : 'ghost'} size="sm" onClick={() => setOptionSpacing('relaxed')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${optionSpacing === 'relaxed' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>WIDE</Button>
                              <Button variant={optionSpacing === 'standard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setOptionSpacing('standard')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${optionSpacing === 'standard' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>STANDARD</Button>
                              <Button variant={optionSpacing === 'tight' ? 'secondary' : 'ghost'} size="sm" onClick={() => setOptionSpacing('tight')} className={`w-full justify-center h-8 text-xs font-medium tracking-wide ${optionSpacing === 'tight' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>COMPACT</Button>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="border border-border/50 rounded-md p-4 space-y-4 mt-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold">Header Bottom Border</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Add a separating line below the header</p>
                    </div>
                    <Switch checked={showBorder} onCheckedChange={setShowBorder} />
                  </div>

                  {showBorder && (
                    <div className="grid sm:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Thickness</Label>
                        <Select value={borderThickness} onValueChange={setBorderThickness}>
                          <SelectTrigger><SelectValue placeholder="Thickness" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Thin (1px)</SelectItem>
                            <SelectItem value="2">Medium (2px)</SelectItem>
                            <SelectItem value="3">Thick (3px)</SelectItem>
                            <SelectItem value="4">Extra Thick (4px)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Space Below Header</Label>
                        <Select value={borderMargin} onValueChange={setBorderMargin}>
                          <SelectTrigger><SelectValue placeholder="Spacing" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Flush)</SelectItem>
                            <SelectItem value="small">Small Space</SelectItem>
                            <SelectItem value="medium">Standard Space</SelectItem>
                            <SelectItem value="large">Large Space</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          </div>

          {/* Live Preview Column */}
          <div className="relative h-full">
            <div className="sticky top-0 pb-6">
              <Card className="border-none shadow-md">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <h2 className="font-semibold flex items-center gap-2">
                    <LayoutDashboardIcon className="w-5 h-5 text-primary" />
                    Live Preview
                  </h2>
                  <p className="text-xs text-muted-foreground">A zoomed-in look at how your branding will appear on exported papers.</p>
                </CardHeader>
                <CardContent className="p-0 bg-muted/10">
                  <div className="p-6 md:p-10 flex items-center justify-center overflow-hidden min-h-[500px]">
                    <div
                      className="bg-white text-black shadow-lg relative overflow-hidden transition-all duration-300 w-full rounded-sm"
                      style={{
                        aspectRatio: '1 / 1.4',
                        maxWidth: '450px',
                        fontFamily: getFontString(bodyFontFamily)
                      }}
                    >
                      {/* Watermark */}
                      {watermarkText && (
                        <div
                          className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
                          style={{
                            transform: 'rotate(-45deg)',
                            fontSize: 'clamp(2rem, 8vw, 4rem)',
                            fontWeight: 'bold',
                            color: 'black',
                            opacity: parseInt(watermarkOpacity) / 100,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {watermarkText}
                        </div>
                      )}

                      {/* Header Region */}
                      <TestPaperHeader
                        coachingName={coachingName}
                        teacherName={teacherName}
                        contactPhone={contactPhone}
                        contactEmail={contactEmail}
                        logoUrl={logoPreview}
                        accentColor={accentColor}
                        secondaryAccentColor={secondaryAccentColor}
                        headerStyle={headerStyle}
                        logoPosition={logoPosition}
                        logoSize={logoSize}
                        headerFontFamily={headerFontFamily}
                        headerFontSize={headerFontSize}
                        subHeaderFontSize={subHeaderFontSize}
                        headerPadding={headerPadding}
                        headerAlignment={headerAlignment}
                        showBorder={showBorder}
                        borderThickness={borderThickness}
                      />

                      {/* Body Content Placeholder - zoomed in */}
                      <div
                        className={`transition-all duration-300 relative z-10 ${bodyMargin === 'narrow' ? 'px-4 sm:px-5 pb-5' : bodyMargin === 'wide' ? 'px-8 sm:px-12 pb-12' : 'px-6 sm:px-8 pb-8'} ${bodySizeClass}`}
                        style={{
                          paddingTop: borderMargin === 'none' ? '12px' : borderMargin === 'small' ? '24px' : borderMargin === 'large' ? '48px' : '32px'
                        }}
                      >
                        <div className="text-center mb-6">
                          <div className={`font-bold ${bodySizeLgClass}`}>Mock Test Paper 1</div>
                          <div className={`opacity-70 mt-1 ${bodySizeClass}`}>Duration: 60 mins | Max Marks: 100</div>
                        </div>

                        <div className={questionSpacing === 'tight' ? 'space-y-3' : questionSpacing === 'relaxed' ? 'space-y-8' : 'space-y-5'}>

                          {/* Q1: Normal MCQ */}
                          <div className="flex gap-3">
                            <span className="font-bold">
                              {questionNumbering === 'number-dot' ? '1.' : questionNumbering === 'q-number' ? 'Q1.' : questionNumbering === 'q-dot-number' ? 'Q.1' : '(1)'}
                            </span>
                            <div className="space-y-2 flex-1 mt-1">
                              <div className="h-2.5 bg-gray-200/80 rounded w-full"></div>
                              <div className="h-2.5 bg-gray-200/80 rounded w-5/6"></div>
                              <div className={`grid grid-cols-2 mt-4 ${optionSpacing === 'tight' ? 'gap-2' : optionSpacing === 'relaxed' ? 'gap-6' : 'gap-4'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'a.' : optionNumbering === 'bracket-a' ? '(a)' : optionNumbering === '1-2-3-4' ? '1.' : 'A.'}</span>
                                  <div className="h-2 bg-gray-100/80 rounded w-3/4"></div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'b.' : optionNumbering === 'bracket-a' ? '(b)' : optionNumbering === '1-2-3-4' ? '2.' : 'B.'}</span>
                                  <div className="h-2 bg-gray-100/80 rounded w-2/3"></div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'c.' : optionNumbering === 'bracket-a' ? '(c)' : optionNumbering === '1-2-3-4' ? '3.' : 'C.'}</span>
                                  <div className="h-2 bg-gray-100/80 rounded w-4/5"></div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'd.' : optionNumbering === 'bracket-a' ? '(d)' : optionNumbering === '1-2-3-4' ? '4.' : 'D.'}</span>
                                  <div className="h-2 bg-gray-100/80 rounded w-1/2"></div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Q2: MCQ with Diagram using Body Alignment */}
                          <div className="flex gap-3 pt-2">
                            <span className="font-bold">
                              {questionNumbering === 'number-dot' ? '2.' : questionNumbering === 'q-number' ? 'Q2.' : questionNumbering === 'q-dot-number' ? 'Q.2' : '(2)'}
                            </span>
                            <div className="space-y-2 flex-1 mt-1">
                              <div className="h-2.5 bg-gray-200/80 rounded w-full"></div>
                              <div className="h-2.5 bg-gray-200/80 rounded w-2/3"></div>

                              {/* Layout based on Body Alignment */}
                              <div className={`mt-4 ${bodyAlignment === 'center' ? 'flex flex-col gap-4' : (bodyAlignment === 'right' || bodyAlignment === 'alternate') ? 'flex flex-row-reverse gap-5' : 'flex flex-row gap-5'}`}>

                                {/* Diagram */}
                                <div
                                  className={`${bodyAlignment === 'center' ? 'w-full max-w-[160px] mx-auto h-28' : 'w-32 shrink-0 self-stretch min-h-[120px]'} bg-gray-50 rounded border border-gray-200 flex items-center justify-center`}
                                >
                                  <span className="text-[10px] text-gray-400">Diagram</span>
                                </div>

                                {/* Options */}
                                <div className={`grid content-center ${bodyAlignment === 'center' ? 'grid-cols-2' : 'grid-cols-1'} flex-1 ${optionSpacing === 'tight' ? 'gap-2' : optionSpacing === 'relaxed' ? 'gap-6' : 'gap-4'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'a.' : optionNumbering === 'bracket-a' ? '(a)' : optionNumbering === '1-2-3-4' ? '1.' : 'A.'}</span>
                                    <div className="h-2 bg-gray-100/80 rounded w-3/4"></div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'b.' : optionNumbering === 'bracket-a' ? '(b)' : optionNumbering === '1-2-3-4' ? '2.' : 'B.'}</span>
                                    <div className="h-2 bg-gray-100/80 rounded w-2/3"></div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'c.' : optionNumbering === 'bracket-a' ? '(c)' : optionNumbering === '1-2-3-4' ? '3.' : 'C.'}</span>
                                    <div className="h-2 bg-gray-100/80 rounded w-4/5"></div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium w-4">{optionNumbering === 'a-b-c-d' ? 'd.' : optionNumbering === 'bracket-a' ? '(d)' : optionNumbering === '1-2-3-4' ? '4.' : 'D.'}</span>
                                    <div className="h-2 bg-gray-100/80 rounded w-1/2"></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Q3: Input with Diagram using Body Alignment */}
                          <div className="flex gap-3 pt-2">
                            <span className="font-bold">
                              {questionNumbering === 'number-dot' ? '3.' : questionNumbering === 'q-number' ? 'Q3.' : questionNumbering === 'q-dot-number' ? 'Q.3' : '(3)'}
                            </span>
                            <div className="space-y-2 flex-1 mt-1">

                              {/* Layout based on Body Alignment */}
                              <div className={`${bodyAlignment === 'center' ? 'flex flex-col gap-4' : bodyAlignment === 'right' ? 'flex flex-row-reverse gap-5' : 'flex flex-row gap-5'}`}>

                                {/* Diagram */}
                                <div
                                  className={`${bodyAlignment === 'center' ? 'w-full max-w-[140px] mx-auto h-24' : 'w-20 h-20 shrink-0'} bg-gray-50 rounded border border-gray-200 flex items-center justify-center`}
                                >
                                  <span className="text-[10px] text-gray-400">Diagram</span>
                                </div>

                                {/* Text content for question */}
                                <div className="space-y-2 flex-1">
                                  <div className="h-2.5 bg-gray-200/80 rounded w-full"></div>
                                  <div className="h-2.5 bg-gray-200/80 rounded w-5/6"></div>
                                  <div className="h-2.5 bg-gray-200/80 rounded w-2/3"></div>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* Gradient fade out at bottom to simulate continuation */}
                      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none z-20"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
