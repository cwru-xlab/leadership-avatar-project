"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useLayout } from "@/lib/layout-context";

/** The content column: canvas, max 1080px, 32px page padding (16px on mobile). Only it scrolls. */
export function MainContent({ children }: { children: ReactNode }) {
  const { fullScreen: layoutFullScreen } = useLayout();
  const pathname = usePathname();
  // Login draws its own full-bleed frame.
  const fullScreen = layoutFullScreen || pathname === "/login";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <main
        className={clsx(
          "flex-1",
          fullScreen
            ? "overflow-hidden"
            : "mx-auto w-full max-w-[1144px] overflow-y-auto px-4 pb-16 pt-6 md:px-8 md:pt-8",
        )}
      >
        {children}
      </main>
    </div>
  );
}
