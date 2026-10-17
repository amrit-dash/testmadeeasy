import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getPublicImageUrl } from '@/lib/utils';

interface CropModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    onConfirm: (base64Image: string, bounds: { x: number, y: number, width: number, height: number }) => void;
    isLoading?: boolean;
    initialCrop?: { x: number; y: number; width: number; height: number } | null;
    mode?: "edit" | "regenerate" | "edit_question" | "view_question";
}

export default function CropModal({ isOpen, onClose, imageUrl, onConfirm, isLoading, initialCrop, mode = "regenerate" }: CropModalProps) {
    const [crop, setCrop] = useState<Crop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [isImageLoading, setIsImageLoading] = useState(true);
    let publicSrc = getPublicImageUrl(imageUrl);
    if (publicSrc && publicSrc.startsWith("http")) {
        publicSrc = `/api/proxy-image?url=${encodeURIComponent(publicSrc)}`;
    }

    useEffect(() => {
        setIsImageLoading(true);
    }, [publicSrc]);

    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        setIsImageLoading(false);
        if (initialCrop && initialCrop.width > 0 && initialCrop.height > 0) {
            setCrop({
                unit: '%',
                width: initialCrop.width,
                height: initialCrop.height,
                x: initialCrop.x,
                y: initialCrop.y,
            });
        } else {
            setCrop({
                unit: '%',
                width: 50,
                height: 50,
                x: 25,
                y: 25,
            });
        }
    };

    const getCroppedImg = useCallback(async () => {
        if (!crop || !imgRef.current) {
            return;
        }

        const image = imgRef.current;
        const canvas = document.createElement('canvas');

        const pX = crop.x / 100;
        const pY = crop.y / 100;
        const pW = crop.width / 100;
        const pH = crop.height / 100;

        canvas.width = pW * image.naturalWidth;
        canvas.height = pH * image.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('No 2d context');
        }

        ctx.drawImage(
            image,
            pX * image.naturalWidth,
            pY * image.naturalHeight,
            pW * image.naturalWidth,
            pH * image.naturalHeight,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const base64Image = canvas.toDataURL('image/jpeg');
        onConfirm(base64Image, { x: crop.x, y: crop.y, width: crop.width, height: crop.height });
    }, [crop, onConfirm]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl w-full max-h-[75vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "edit" ? "Edit Diagram Crop" :
                            mode === "edit_question" ? "Edit Question Crop" :
                                mode === "view_question" ? "Expanded Question View" :
                                    "Regenerate Figure"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "edit" ? "Adjust the boundary box to tightly fit the diagram." :
                            mode === "edit_question" ? "Adjust the boundary box to encapsulate the entire question." :
                                mode === "view_question" ? "Viewing the extracted bounds of the question." :
                                    "Select the exact region of the figure you want to regenerate."}
                    </DialogDescription>
                </DialogHeader>

                <div className="relative flex-1 flex flex-col items-center justify-center min-h-[40vh] overflow-auto bg-muted/30 p-2 rounded-md border mt-4">
                    {isImageLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-md z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                        </div>
                    )}
                    {publicSrc && (
                        <ReactCrop
                            crop={crop}
                            onChange={(_, percentCrop) => {
                                if (mode !== "view_question") setCrop(percentCrop);
                            }}
                            locked={mode === "view_question"}
                        >
                            <img
                                ref={imgRef}
                                src={publicSrc}
                                alt="Crop area"
                                crossOrigin="anonymous"
                                onLoad={onImageLoad}
                                onError={() => setIsImageLoading(false)}
                                className={`object-contain transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                                style={{ maxHeight: '60vh', maxWidth: '100%' }}
                            />
                        </ReactCrop>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        {mode === "view_question" ? "Close" : "Cancel"}
                    </Button>
                    {mode !== "view_question" && (
                        <Button
                            onClick={getCroppedImg}
                            disabled={!crop?.width || !crop?.height || isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {(mode === "edit" || mode === "edit_question") ? "Saving..." : "Regenerating..."}
                                </>
                            ) : (
                                (mode === "edit" || mode === "edit_question") ? "Save Crop" : "Confirm & Regenerate"
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
