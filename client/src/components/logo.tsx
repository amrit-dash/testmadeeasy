import React from "react";
import { LOGO_SVG_PATHS } from "@/lib/logo-svg";

export function Logo({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="10 5 340 375"
            className={className}
            dangerouslySetInnerHTML={{
                __html: `<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none">${LOGO_SVG_PATHS}</g>`
            }}
        />
    );
}
