import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getPublicImageUrl } from "@/lib/utils";

interface AuthImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    fallback?: React.ReactNode;
    overlayLoader?: boolean;
}

export function AuthImage({ src, alt, className, fallback, overlayLoader, ...props }: AuthImageProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const publicSrc = getPublicImageUrl(src);

    useEffect(() => {
        setIsLoading(true);
        setHasError(false);
    }, [publicSrc]);

    const handleLoad = () => { setIsLoading(false); setHasError(false); };
    const handleError = () => { setIsLoading(false); setHasError(true); };

    if (overlayLoader) {
        return (
            <div className={`relative flex items-center justify-center w-full min-h-[100px] ${className?.includes('h-full') ? 'h-full' : ''}`}>
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-primary/5 z-10">
                        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
                    </div>
                )}
                {publicSrc && !hasError ? (
                    <img
                        ref={imgRef}
                        src={publicSrc}
                        alt={alt}
                        onLoad={handleLoad}
                        onError={handleError}
                        className={`${className || ''} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                        {...props}
                    />
                ) : (
                    !isLoading && (
                        fallback ? <>{fallback}</> : (
                            <div className="flex flex-col items-center justify-center bg-muted/20 text-muted-foreground text-xs w-full h-full rounded-sm p-4 border border-dashed border-muted-foreground/20">
                                <span className="opacity-50">Image unavailable</span>
                            </div>
                        )
                    )
                )}
            </div>
        );
    }

    if (!publicSrc || hasError) {
        return fallback ? <>{fallback}</> : (
            <div className={`flex flex-col items-center justify-center bg-muted/20 text-muted-foreground text-xs border border-dashed border-muted-foreground/20 p-4 ${className || ''}`}>
                <span className="opacity-50">Image unavailable</span>
            </div>
        );
    }

    return (
        <div className={`relative flex items-center justify-center ${className || ''}`}>
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/20 z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}
            <img
                ref={imgRef}
                src={publicSrc}
                alt={alt}
                onLoad={handleLoad}
                onError={handleError}
                className={`${className || ''} ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                {...props}
            />
        </div>
    );
}
