import { useEffect } from "react";
import { useTheme } from "./theme-provider";

const FAVICON_SVG_PATHS = `
    <g stroke-width="30">
      <path d="M 230 60 L 100 60 A 40 40 0 0 0 60 100 L 60 300 A 40 40 0 0 0 100 340 L 300 340 A 40 40 0 0 0 340 300 L 340 170" />
    </g>

    <g stroke-width="40">
      <circle cx="200" cy="200" r="75" />
      <path d="M 215 225 L 285 285" />
    </g>

    <path d="M 340 -10 Q 340 60 270 60 Q 340 60 340 130 Q 340 60 410 60 Q 340 60 340 -10 Z" fill="currentColor" stroke-width="15" />
`;

export function DynamicFavicon() {
  const { theme, colorPreset } = useTheme();

  useEffect(() => {
    const updateFavicon = () => {
      const root = document.documentElement;
      const isDark = root.classList.contains('dark');

      const primaryHsl = getComputedStyle(root).getPropertyValue('--primary').trim();
      const color = primaryHsl ? `hsl(${primaryHsl})` : 'currentColor';
      //const bgColor = isDark ? '#000000' : '#ffffff';
      const bgColor = 'none';

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 0 360 360" width="100%" height="100%">
  <circle cx="200" cy="200" r="400" fill="${bgColor}" />
  <g stroke="${color}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${FAVICON_SVG_PATHS.replace(/currentColor/g, color)}
  </g>
</svg>`;

      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;
    };

    const timeoutId = setTimeout(updateFavicon, 50);
    return () => clearTimeout(timeoutId);
  }, [theme, colorPreset]);

  return null;
}
