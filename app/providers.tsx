"use client";

import * as React from "react";
import { HeroUIProvider } from "@heroui/system";
import { ToastProvider, addToast } from "@heroui/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { LayoutProvider } from "@/lib/layout-context";

export interface ProvidersProps {
  children: React.ReactNode;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

// Component to handle URL error parameters and show toasts
function ErrorToastHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    const error = searchParams.get("error");

    if (error) {
      // Show toast based on error type
      const errorMessages: Record<
        string,
        { title: string; description?: string; color: "danger" | "warning" }
      > = {
        access_denied: {
          title: "Access Denied",
          description: "You don't have permission to access this page.",
          color: "danger",
        },
        missing_ticket: {
          title: "Authentication Error",
          description: "Missing authentication ticket.",
          color: "danger",
        },
        sso_error: {
          title: "SSO Error",
          description:
            "An error occurred during single sign-on authentication.",
          color: "danger",
        },
        sso_validation_failed: {
          title: "Authentication Failed",
          description: "SSO validation failed. Please try again.",
          color: "danger",
        },
      };

      const errorConfig = errorMessages[error] || {
        title: "Error",
        description: `An error occurred: ${error}`,
        color: "danger" as const,
      };

      addToast({
        title: errorConfig.title,
        description: errorConfig.description,
        color: errorConfig.color,
        timeout: 5000,
      });

      // Clean up the URL by removing the error parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("error");
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });
    }
  }, [searchParams, router]);

  return null;
}

export function Providers({ children }: ProvidersProps) {
  const router = useRouter();

  return (
    <HeroUIProvider navigate={router.push}>
      <ToastProvider />
      <AuthProvider>
        <LayoutProvider>
          <React.Suspense fallback={null}>
            <ErrorToastHandler />
          </React.Suspense>
          {children}
        </LayoutProvider>
      </AuthProvider>
    </HeroUIProvider>
  );
}
