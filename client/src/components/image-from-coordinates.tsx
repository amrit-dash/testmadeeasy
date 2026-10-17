import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getPublicImageUrl } from "@/lib/utils";

export function ImageFromCoordinates({ src, bounds, alt, className = "" }: { src: string, bounds: { x: number, y: number, width: number, height: number }, alt: string, className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  let publicSrc = getPublicImageUrl(src);
  if (publicSrc && publicSrc.startsWith("http")) {
    publicSrc = `/api/proxy-image?url=${encodeURIComponent(publicSrc)}`;
  }

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    if (!publicSrc) {
      setIsLoading(false);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous"; // Needed for CORS to use canvas

    img.onload = () => {
      if (!isMounted) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsLoading(false);
        return;
      }

      // bounds are in percentages (0-100)
      const pxX = (bounds.x / 100) * img.naturalWidth;
      const pxY = (bounds.y / 100) * img.naturalHeight;
      const pxW = (bounds.width / 100) * img.naturalWidth;
      const pxH = (bounds.height / 100) * img.naturalHeight;

      canvas.width = pxW;
      canvas.height = pxH;

      ctx.drawImage(
        img,
        pxX, pxY, pxW, pxH,
        0, 0, pxW, pxH
      );

      setDataUrl(canvas.toDataURL('image/png'));
      setIsLoading(false);
    };

    img.onerror = () => {
      if (isMounted) setIsLoading(false);
    };

    img.src = publicSrc;

    return () => {
      isMounted = false;
    };
  }, [publicSrc, bounds]);

  return (
    <div className={`relative w-full flex items-center justify-center min-h-[100px] ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-primary/5">
          <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
        </div>
      )}
      {dataUrl && (
        <img
          src={dataUrl}
          alt={alt}
          className={`max-w-full max-h-[300px] object-contain rounded-sm transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
    </div>
  );
}
