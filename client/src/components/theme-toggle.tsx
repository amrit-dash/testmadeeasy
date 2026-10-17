import { Moon, Sun, Palette, PaintRollerIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
    const { setTheme, setColorPreset } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="w-8 h-8 rounded-full shrink-0">
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                    System
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <PaintRollerIcon className="mr-2 h-4 w-4" />
                        <span>Theme Color</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => setColorPreset("default")}>
                                <div className="w-4 h-4 rounded-full bg-blue-500 mr-2" />
                                Default (Blue)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setColorPreset("zinc")}>
                                <div className="w-4 h-4 rounded-full bg-zinc-500 mr-2" />
                                Zinc
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setColorPreset("rose")}>
                                <div className="w-4 h-4 rounded-full bg-rose-500 mr-2" />
                                Rose
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setColorPreset("green")}>
                                <div className="w-4 h-4 rounded-full bg-green-500 mr-2" />
                                Green
                            </DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}