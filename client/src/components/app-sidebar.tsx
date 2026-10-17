import { Home, Upload, BookOpen, FileText, User, LogOut, DollarSign, IndianRupee, Euro, PaintRollerIcon, LibraryBigIcon, FileSearch, ScrollTextIcon, ChartNetworkIcon, ChartSplineIcon, DrillIcon } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun, Palette, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { HexColorPicker } from "react-colorful";
import { ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { title: "Dashboard", url: "/", icon: ChartSplineIcon },
  { title: "My Questions", url: "/library", icon: LibraryBigIcon },
  { title: "Add Questions", url: "/upload", icon: DrillIcon },
  { title: "Test Papers", url: "/papers", icon: ScrollTextIcon },
  { title: "Paper Design", url: "/branding", icon: Palette },
  { title: "Admin", url: "/admin", icon: ShieldCheck, adminOnly: true },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme, setColorPreset, colorPreset } = useTheme();
  const queryClient = useQueryClient();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleCurrencyToggle = async () => {
    if (!user) return;
    const current = user.currency || "USD";
    const nextCurrency = current === "USD" ? "INR" : current === "INR" ? "EUR" : "USD";
    try {
      await apiRequest("PATCH", "/api/user/currency", { currency: nextCurrency });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (e) {
      console.error("Failed to update currency", e);
    }
  };

  const getCurrencyIcon = () => {
    const c = user?.currency || "USD";
    if (c === "INR") return <IndianRupee className="w-4 h-4 text-primary" />;
    if (c === "EUR") return <Euro className="w-4 h-4 text-primary" />;
    return <DollarSign className="w-4 h-4 text-primary" />;
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-16 flex flex-row items-center justify-between px-4 shrink-0 border-b border-sidebar-border/30">
        <div className="flex flex-col items-start justify-center gap-1 ml-2 mt-2">
          <span className="text-xs font-semibold text-sidebar-foreground/60 tracking-wider uppercase">
            Main Menu
          </span>
          <div className="h-1 w-10 rounded-full bg-primary/25"></div>
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => !item.adminOnly || user?.role === "admin").map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`} className="pl-4" onClick={handleLinkClick}>
                      <item.icon className="w-4 h-4 text-primary" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 space-y-4">
        {/* App Settings Row */}
        <div className="space-y-2">
          <div className="px-2 text-[10px] font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
            Preferences
          </div>
          <TooltipProvider delayDuration={0}>
            <div className="flex items-center justify-center bg-muted/30 rounded-lg border border-border/50 shadow-sm w-full overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-8 flex-1 rounded-none hover:bg-background hover:shadow-sm text-muted-foreground hover:text-foreground transition-all border-r border-transparent hover:border-border/50"
                  >
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Moon className="w-4 h-4 text-indigo-500" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{theme === "dark" ? "Light Mode" : "Dark Mode"}</p>
                </TooltipContent>
              </Tooltip>

              <div className="w-[1px] h-4 bg-border/50 shrink-0" />

              {user?.role === "admin" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCurrencyToggle}
                        className="h-8 flex-1 rounded-none hover:bg-background hover:shadow-sm text-muted-foreground hover:text-foreground transition-all border-r border-transparent hover:border-border/50"
                      >
                        {getCurrencyIcon()}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Currency ({user?.currency || "USD"})</p>
                    </TooltipContent>
                  </Tooltip>

                  <div className="w-[1px] h-4 bg-border/50 shrink-0" />
                </>
              )}

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex h-8">
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full h-full rounded-none hover:bg-background hover:shadow-sm text-muted-foreground hover:text-foreground transition-all">
                          <PaintRollerIcon className="w-4 h-4 text-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Theme Color</p>
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setColorPreset("default")}>
                    <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: "hsl(180 70% 40%)" }} />
                    Aqua
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setColorPreset("zinc")}>
                    <div className="w-4 h-4 rounded-full bg-zinc-500 mr-2" />
                    Zinc
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setColorPreset("rose")}>
                    <div className="w-4 h-4 rounded-full bg-rose-500 mr-2" />
                    Rose
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setColorPreset("amber")}>
                    <div className="w-4 h-4 rounded-full bg-amber-500 mr-2" />
                    Amber
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setColorPreset("lime")}>
                    <div className="w-4 h-4 rounded-full bg-lime-500 mr-2" />
                    Lime
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center border overflow-hidden ${!colorPreset?.startsWith('#') ? 'border-dashed border-muted-foreground bg-transparent' : 'border-transparent'}`} style={{ backgroundColor: colorPreset?.startsWith('#') ? colorPreset : 'transparent' }}>
                        {!colorPreset?.startsWith('#') && <Plus className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <span className="text-sm">Custom</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-auto p-3 flex flex-col gap-2 z-50 ml-1">
                        <HexColorPicker
                          color={colorPreset?.startsWith('#') ? colorPreset : '#ffffff'}
                          onChange={setColorPreset}
                        />
                        <div className="flex items-center justify-between mt-1 px-1">
                          <span className="text-xs font-mono text-muted-foreground">HEX</span>
                          <span className="text-xs font-mono">{colorPreset?.startsWith('#') ? colorPreset.toUpperCase() : '#FFFFFF'}</span>
                        </div>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TooltipProvider>
        </div>

        {/* User Profile Row */}
        {user && (
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center justify-center bg-muted rounded-lg border border-border/50 shadow-sm w-full overflow-hidden">
              <Button
                variant="ghost"
                asChild
                className="flex-1 justify-start h-14 p-2 rounded-none hover:bg-background hover:shadow-sm transition-all border-r border-transparent hover:border-border/50 min-w-0"
              >
                <Link href="/account" onClick={handleLinkClick}>
                  <Avatar className="w-10 h-10 mr-3 shrink-0 border border-border/50 shadow-sm">
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.firstName || user.lastName ? ((user.firstName?.[0] || "") + (user.lastName?.[0] || "")) : <User className="w-5 h-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate w-full">My Profile</span>
                    <span className="text-xs text-muted-foreground font-normal truncate w-full">Account settings</span>
                  </div>
                </Link>
              </Button>

              <div className="w-[1px] h-8 bg-border/90 shrink-0" />

              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => logout()}
                      className="h-14 w-12 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:shadow-sm transition-all shrink-0"
                    >
                      <LogOut className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sign Out</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
