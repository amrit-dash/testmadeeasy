import { fetchWithAuth } from "@/lib/queryClient";
import { createContext, useContext, useEffect, useState } from "react"


type Theme = "dark" | "light" | "system"
type ColorPreset = string

function hexToHsl(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    let r = parseInt(hex.slice(0, 2), 16) / 255;
    let g = parseInt(hex.slice(2, 4), 16) / 255;
    let b = parseInt(hex.slice(4, 6), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    defaultColorPreset?: ColorPreset
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    colorPreset: ColorPreset
    setTheme: (theme: Theme, sync?: boolean) => void
    setColorPreset: (preset: ColorPreset, sync?: boolean) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    colorPreset: "default",
    setTheme: () => null,
    setColorPreset: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
    children,
    defaultTheme = "system",
    defaultColorPreset = "default",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setReactTheme] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    )
    const [colorPreset, setReactColorPreset] = useState<ColorPreset>(
        () => (localStorage.getItem(`${storageKey}-color`) as ColorPreset) || defaultColorPreset
    )

    useEffect(() => {
        const root = window.document.documentElement

        root.classList.remove("light", "dark")
        root.classList.remove("theme-zinc", "theme-rose", "theme-amber", "theme-lime")

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
                .matches
                ? "dark"
                : "light"

            root.classList.add(systemTheme)
        } else {
            root.classList.add(theme)
        }

        root.style.removeProperty('--primary');
        root.style.removeProperty('--ring');

        if (colorPreset.startsWith('#')) {
            const hsl = hexToHsl(colorPreset);
            root.style.setProperty('--primary', hsl);
            root.style.setProperty('--ring', hsl);
        } else if (colorPreset !== "default") {
            root.classList.add(`theme-${colorPreset}`)
        }
    }, [theme, colorPreset])

    const value = {
        theme,
        colorPreset,
        setTheme: (newTheme: Theme, sync: boolean = true) => {
            localStorage.setItem(storageKey, newTheme)
            setReactTheme(newTheme)
            if (sync) {
                fetchWithAuth("/api/user/theme", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ theme: newTheme, colorPreset })
                }).catch(() => { })
            }
        },
        setColorPreset: (newPreset: ColorPreset, sync: boolean = true) => {
            localStorage.setItem(`${storageKey}-color`, newPreset)
            setReactColorPreset(newPreset)
            if (sync) {
                fetchWithAuth("/api/user/theme", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ theme, colorPreset: newPreset })
                }).catch(() => { })
            }
        }
    }

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}