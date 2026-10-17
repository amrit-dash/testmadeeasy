import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { ReactNode } from "react";

interface ExpandedImageDialogProps {
    trigger?: ReactNode;
    title: string;
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function ExpandedImageDialog({ trigger, title, children, open, onOpenChange }: ExpandedImageDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && (
                <DialogTrigger asChild>
                    {trigger}
                </DialogTrigger>
            )}
            <DialogContent className="w-[85vw] max-w-[85vw] md:w-[65vw] md:max-w-[65vw] h-[75vh] max-h-[75vh] sm:h-[85vh] sm:max-h-[85vh] overflow-hidden flex flex-col p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">Expanded view of the image</DialogDescription>
                <div className="flex items-center justify-between border-b pb-2 md:pb-4 pr-6">
                    <h2 className="text-base md:text-lg font-semibold tracking-tight">{title}</h2>
                </div>
                <div className="flex-1 overflow-hidden rounded-md mt-2 md:mt-4 border flex flex-col items-center justify-center relative bg-muted/30">
                    <TransformWrapper
                        initialScale={1}
                        minScale={0.5}
                        maxScale={4}
                        centerOnInit
                    >
                        {({ zoomIn, zoomOut, resetTransform }) => (
                            <div className="w-full h-full flex flex-col items-center p-2 md:p-4 relative">
                                <div className="absolute bottom-4 right-4 z-50 flex gap-2">
                                    <Button variant="outline" size="icon" onClick={() => resetTransform()} className="bg-background/80 backdrop-blur-sm shadow-sm h-8 w-8" title="Reset View">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                    <div className="flex items-center border rounded-md bg-background/80 backdrop-blur-sm shadow-sm">
                                        <Button variant="ghost" size="icon" onClick={() => zoomOut()} className="h-8 w-8 rounded-none rounded-l-md border-r hover:bg-muted/50" title="Zoom Out">
                                            <ZoomOut className="w-4 h-4 text-primary" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => zoomIn()} className="h-8 w-8 rounded-none rounded-r-md hover:bg-muted/50" title="Zoom In">
                                            <ZoomIn className="w-4 h-4 text-primary" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden">
                                    <TransformComponent wrapperClass="!w-full !h-full" contentClass="min-w-full min-h-full flex items-center justify-center">
                                        <div className="bg-white p-2 sm:p-4 rounded-md shadow-sm pointer-events-none max-w-full flex items-center justify-center">
                                            {children}
                                        </div>
                                    </TransformComponent>
                                </div>
                            </div>
                        )}
                    </TransformWrapper>
                </div>
            </DialogContent>
        </Dialog>
    );
}