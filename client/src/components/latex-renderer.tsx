import React, { useEffect, useRef, useState, useId, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "../lib/utils";
import { ImageFromCoordinates } from "./image-from-coordinates";
import { AuthImage } from "./auth-image";

declare global {
  interface Window {
    MathJax?: any;
    mathJaxReady?: boolean;
  }
}

let mathJaxPromise: Promise<void> | null = null;

function loadMathJax(): Promise<void> {
  if (mathJaxPromise) return mathJaxPromise;

  mathJaxPromise = new Promise((resolve) => {
    if (window.MathJax && window.mathJaxReady) {
      resolve();
      return;
    }

    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"]],
        displayMath: [["$$", "$$"]],
      },
      options: {
        enableMenu: false,
      },

      chtml: {
        scale: 1,
        minScale: 0.5,
        matchFontHeight: true,
        mtextInheritFont: true,
        fontURL: 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/output/chtml/fonts/woff-v2',
      },
      startup: {
        ready: () => {
          window.MathJax.startup.defaultReady();
          window.mathJaxReady = true;
          resolve();
        },
      },
    };

    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff2";
    document.head.appendChild(fontLink);

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js";
    script.async = true;
    document.head.appendChild(script);
  });

  return mathJaxPromise;
}

const getIframeContent = (tikzCode: string, id: string) => {
  let cleanTikz = tikzCode;

  // Attempt full support using the maintained @rod2ik/tikzjax fork.
  // It properly supports fetching missing packages automatically.
  const tikzMatch = tikzCode.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  if (tikzMatch) {
    const diagram = tikzMatch[0];

    // Extract any \usetikzlibrary commands from the code, ignoring \documentclass, \usepackage, etc.
    const librariesMatch = tikzCode.match(/\\usetikzlibrary\{[^}]+\}/g) || [];
    const uniqueLibraries = [...new Set(librariesMatch)].join('\n');

    // Safely replace \text{} with \mbox{} since we cannot use amsmath in TikZJax
    const safeDiagram = diagram.replace(/\\text\{/g, '\\mbox{');

    cleanTikz = (uniqueLibraries ? uniqueLibraries + '\n' : '') + safeDiagram;
  } else {
    // Fallback if no tikzpicture environment is found
    const librariesMatch = tikzCode.match(/\\usetikzlibrary\{[^}]+\}/g) || [];
    const uniqueLibraries = [...new Set(librariesMatch)].join('\n');

    let safeFallback = tikzCode
      .replace(/\\text\{/g, '\\mbox{')
      .replace(/\\documentclass(\[[\s\S]*?\])?\{[\s\S]*?\}/g, '')
      .replace(/\\usepackage(\[[\s\S]*?\])?\{[\s\S]*?\}/g, '')
      .replace(/\\begin\{document\}/g, '')
      .replace(/\\end\{document\}/g, '')
      .trim();

    cleanTikz = (uniqueLibraries ? uniqueLibraries + '\n' : '') + safeFallback;
  }

  // Prevent XSS breakouts from the text/tikz script tag
  cleanTikz = cleanTikz.replace(/<\/script>/gi, '');

  return `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.0.0-beta32/dist/fonts.css">
    <script>console.log=function(){};console.warn=function(){};console.error=function(){};</script>
    <script src="https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.0.0-beta32/dist/tikzjax.js"></script>
    <style>
      body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: transparent; padding: 0; box-sizing: border-box; overflow: hidden; }
      .svg-container { display: flex; justify-content: center; align-items: center; width: 100%; height: auto; transform: scale(1); transform-origin: center; padding: 0; }
      svg { max-width: 100%; height: auto !important; }
      /* Hide the native TikzJax ugly gray loader */
      svg > rect[fill="#000"] { display: none !important; }
      svg > circle[stroke="#f3f3f3"] { display: none !important; }
      svg > circle[stroke="#3498db"] { display: none !important; }
    </style>
  </head>
  <body>
    <div class="svg-container">
      <script type="text/tikz">
        ${cleanTikz}
      </script>
    </div>
    <script>
      let resizeTimer;
      function sendHeight() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const container = document.querySelector('.svg-container');
          if (container) {
            const svg = container.querySelector('svg');
            if (svg) {
              const rect = svg.getBoundingClientRect();
              window.parent.postMessage({ type: 'tikz-resize', id: '${id}', height: rect.height }, '*');
            }
          }
        }, 50); // Debounce resize events
      }
      const observer = new MutationObserver(() => sendHeight());
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      window.addEventListener('resize', sendHeight);
      setTimeout(sendHeight, 500);
      setTimeout(sendHeight, 2000);
      
      document.addEventListener('tikzjax-load-finished', function() {
        window.parent.postMessage({ type: 'tikz-done', id: '${id}' }, '*');
      });
      // Safety fallback to hide loader if compile hangs
      setTimeout(function() {
        window.parent.postMessage({ type: 'tikz-done', id: '${id}' }, '*');
      }, 10000);
    </script>
  </body>
</html>`;
};

function processMathBlock(str: string) {
  let s = str.replace(/\\text\s*\{\s*₹\s*\}/g, "₹");
  let result = "";
  let textDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const textMatch = s.slice(i).match(/^\\text\s*\{/);
    if (textMatch) {
       textDepth++;
       result += textMatch[0];
       i += textMatch[0].length - 1;
       continue;
    }
    if (s[i] === "{" && textDepth > 0) {
       textDepth++;
    } else if (s[i] === "}" && textDepth > 0) {
       textDepth--;
    }
    if (s[i] === "₹") {
       if (textDepth > 0) result += "₹";
       else result += "\\text{₹}";
    } else if (textDepth > 0 && (s[i] === "&" || s[i] === "%")) {
       if (i > 0 && s[i-1] === "\\") result += s[i];
       else result += "\\" + s[i];
    } else {
       result += s[i];
    }
  }
  return result;
}

const renderLatexWithLineBreaks = (text: string) => {
  if (!text) return null;
  const mathBlocks: string[] = [];
  const placeholder = (index: number) => `__MATH_BLOCK_${index}__`;

  let processedText = text.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
    mathBlocks.push(processMathBlock(match));
    return placeholder(mathBlocks.length - 1);
  });

  processedText = processedText.replace(/(?<!\\)\$([\s\S]*?)(?<!\\)\$/g, (match) => {
    mathBlocks.push(processMathBlock(match));
    return placeholder(mathBlocks.length - 1);
  });

  return processedText.split(/\n\n+/).map((paragraph, pIndex) => {
    const lines = paragraph.split("\n");
    return (
      <p key={pIndex} style={{ margin: pIndex > 0 ? "0.5em 0" : "0" }}>
        {lines.map((line, lIndex) => {
          const parts = line.split(/(__MATH_BLOCK_\d+__)/);
          return (
            <React.Fragment key={lIndex}>
              {parts.map((part, partIndex) => {
                const match = part.match(/__MATH_BLOCK_(\d+)__/);
                if (match) {
                  return <span key={partIndex}>{mathBlocks[parseInt(match[1], 10)]}</span>;
                }
                return <span key={partIndex} style={{ whiteSpace: "pre-wrap" }}>{part.replace(/\\%/g, "%").replace(/\\&/g, "&").replace(/\\\$/g, "$")}</span>;
              })}
              {lIndex < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </p>
    );
  });
};

interface LatexRendererProps {
  content: string;
  diagramLatex?: string | null;
  imageUrl?: string | null;
  diagramBounds?: any;
  diagramType?: string | null;
  className?: string;
  alignment?: string;
  isAlternateRight?: boolean;
  forceLightMode?: boolean;
  optionsNode?: React.ReactNode;
}

export default function LatexRenderer({ content, diagramLatex, imageUrl, diagramBounds, diagramType, className = "", alignment = "center", isAlternateRight = false, forceLightMode = false, optionsNode }: LatexRendererProps) {
  const cleanContent = useMemo(() => {
    if (!content) return "";
    let cleaned = content;
    cleaned = cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");
    cleaned = cleaned.replace(/\\textbf\{\s*OR\s*\}/gi, "");
    
    // Safely convert legacy tabular environments to MathJax arrays
    cleaned = cleaned.replace(/\\begin\{tabular\}([\s\S]*?)\\end\{tabular\}/g, (match, body) => {
      return "$\n\\begin{array}" + body + "\\end{array}\n$";
    });




    return cleaned;
  }, [content]);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageHeight, setImageHeight] = useState<number>(150);
  const { theme } = useTheme();

  const isDark = !forceLightMode && (theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches));

  const iframeId = useId();
  const [iframeHeight, setIframeHeight] = useState<number>(150);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.id === iframeId) {
        if (event.data?.type === 'tikz-resize') {
          setIframeHeight(Math.max(150, Math.ceil(event.data.height) + 20));
        } else if (event.data?.type === 'tikz-done') {
          setIframeLoaded(true);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeId]);

  useEffect(() => {
    if (!containerRef.current || !content) return;
    const el = containerRef.current;

    loadMathJax().then(() => {
      if (el && window.MathJax) {
        window.MathJax.typesetClear?.([el]);
        window.MathJax.typesetPromise?.([el]).catch((err: any) => console.error("MathJax error:", err));
      }
    });
  }, [content]);

  useEffect(() => {
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        setIsOverflowing(scrollContainerRef.current.scrollWidth > scrollContainerRef.current.clientWidth + 1);
      }
    };

    const timeoutId = setTimeout(checkOverflow, 100);
    window.addEventListener("resize", checkOverflow);

    const observer = new MutationObserver(checkOverflow);
    if (scrollContainerRef.current) {
      observer.observe(scrollContainerRef.current, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", checkOverflow);
      observer.disconnect();
    };
  }, [content]);

  const hasLatex = Boolean(diagramLatex);
  const hasImage = Boolean(imageUrl);
  const prefType = diagramType || 'latex';
  const showLatex = hasLatex && (prefType === 'latex' || !hasImage);
  const showImage = hasImage && (!hasLatex || prefType === 'image');
  const hasDiagram = showLatex || showImage;

  // Smart layout for options: place them inline if text is short and a diagram is present side-by-side.
  // We use dynamic threshold based on the actual rendered height of the diagram.
  // An average line of text is ~80 chars and takes ~24px height.
  // We allow rendering inline if the text length roughly fits within the diagram's vertical space.
  const diagramActualHeight = showLatex ? iframeHeight : showImage ? imageHeight : 150;
  const dynamicThreshold = Math.max(150, Math.floor(diagramActualHeight * 2.5));
  const isShortText = content ? content.length < dynamicThreshold : true;
  const renderOptionsInline = Boolean(optionsNode && hasDiagram && alignment !== "center" && isShortText);

  const alignClass = alignment === "center"
    ? "flex flex-col gap-4"
    : alignment === "left" || (alignment === "alternate" && !isAlternateRight)
      ? "flex flex-col sm:flex-row sm:flex-wrap gap-5 items-start"
      : "flex flex-col sm:flex-row-reverse sm:flex-wrap gap-5 items-start";

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "latex-content leading-relaxed max-w-full overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        isOverflowing ? "bg-muted/40 p-2 rounded-md" : "",
        className,
        hasDiagram && (content || renderOptionsInline) ? alignClass : ""
      )}
    >
      {(content || renderOptionsInline) && (
        <div className={cn(hasDiagram && alignment !== "center" ? "flex-1 min-w-0" : "w-full")} ref={containerRef} key={cleanContent}>
          <div className="latex-text-container" style={{ wordBreak: "break-word" }}>{renderLatexWithLineBreaks(cleanContent)}</div>
          {renderOptionsInline && (
            <div className={cn("mt-4", !content && "mt-0")}>
              {optionsNode}
            </div>
          )}
        </div>
      )}
      {hasDiagram && (
        <div
          className={cn(
            "flex flex-col relative transition-all duration-300 gap-4",
            !content ? "mt-0 w-full" : alignment === "center" ? "mt-0 mb-4 w-full" : "mt-0 w-full sm:w-1/3 shrink-0",
            alignment === "left" ? "items-start" : "items-center"
          )}
          style={{ minHeight: showLatex ? `${iframeHeight}px` : undefined }}
        >
          {showLatex && (
            <div className="relative w-full flex justify-center">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-10 print:hidden bg-primary/5 rounded-md">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
                </div>
              )}
              <iframe
                srcDoc={getIframeContent(diagramLatex || "", iframeId)}
                className={cn(
                  "w-full border-0 bg-transparent transition-opacity duration-300",
                  iframeLoaded ? 'opacity-100' : 'opacity-0 print:opacity-100'
                )}
                style={{ filter: isDark ? 'invert(1) hue-rotate(180deg)' : 'none', height: `${iframeHeight}px` }}
                title="TikZ Diagram"
                scrolling="no"
              />
            </div>
          )}
          {showImage && (
            <div className="relative flex justify-center w-full min-h-[100px]">
              {diagramBounds ? (
                <ImageFromCoordinates
                  src={imageUrl!}
                  bounds={typeof diagramBounds === 'string' ? JSON.parse(diagramBounds) : diagramBounds}
                  alt="Diagram"
                  className={cn(
                    "transition-opacity duration-300"
                  )}
                />
              ) : (
                <div className="relative w-full flex justify-center min-h-[100px]">
                  <AuthImage
                    src={imageUrl!}
                    alt="Diagram"
                    overlayLoader={true}
                    className={cn(
                      "max-w-full max-h-[300px] object-contain rounded-sm"
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {optionsNode && !renderOptionsInline && (
        <div className="mt-4 w-full">
          {optionsNode}
        </div>
      )}
    </div>
  );
}
