import "@/styles/globals.css";
import "@/styles/brand.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "./providers";

import { siteConfig } from "@/config/site";
import { fontDisplay, fontMono, fontSans } from "@/config/fonts";
import { AuthNavbar } from "@/components/auth-navbar";
import { MainContent } from "@/components/main-content";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#003071",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning className="light" lang="en">
      <head />
      <body
        className={clsx(
          "min-h-screen text-foreground bg-background font-sans antialiased",
          fontSans.variable,
          fontDisplay.variable,
          fontMono.variable
        )}
      >
        <Providers>
          {/* The direction flips at the SAME width the nav changes shape
              (`min-[900px]` in components/auth-navbar.tsx), not at `md`. With
              `md:flex-row` the 768-899px band laid the MOBILE top bar out as a
              row item, so it took 378px of width and squeezed the content
              column to 358px on every page in this frame. */}
          <div className="relative flex h-dvh flex-col overflow-hidden min-[900px]:flex-row">
            <AuthNavbar />
            <MainContent>{children}</MainContent>
          </div>
        </Providers>
      </body>
    </html>
  );
}
