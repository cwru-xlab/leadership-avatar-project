"use client";

import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import {
  Home,
  Settings,
  Users,
  ChartColumnBig,
  Mail,
  Video,
  Briefcase,
  FileText,
  GraduationCap,
  QrCode,
  BookOpenCheck,
  Route,
  ChevronsUpDown,
  LogOut,
  Menu,
  Mic,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { siteConfig } from "@/config/site";
import { UpNextCard } from "@/components/shell/UpNextCard";
import { useLayout } from "@/lib/layout-context";
import { toAppRole } from "@/lib/roles";

const iconMap = {
  Home,
  Settings,
  Users,
  ChartColumnBig,
  Mail,
  Video,
  Briefcase,
  FileText,
  GraduationCap,
  QrCode,
  BookOpenCheck,
  Route,
  Mic,
} as const;

type NavItem = { label: string; href: string; icon: string; group: string };

/** Flat CWRU Blue sidebar. Fixed at full height from 900px; a top bar with a drawer below. */
export const AuthNavbar = () => {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const { fullScreen } = useLayout();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  if (pathname.startsWith("/kiosk") || pathname === "/login" || fullScreen) {
    return null;
  }

  const isStudent = toAppRole(user?.role) === "user";
  const navItems: NavItem[] = isStudent ? siteConfig.studentNavItems : siteConfig.navItems;
  const groups = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ||
    // Practice owns every practice flow, not just the picker at "/".
    (href === "/" && isStudent && /^\/(practice|interview|case-play|conversations)(\/|$)/.test(pathname));

  const initials = (user?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const brand = (
    <NextLink
      className="flex items-center gap-3 rounded-lg focus-visible:outline-light-blue"
      href="/"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-white font-display text-xl italic text-cwru-blue">
        La
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-xl font-medium leading-tight text-white">
          Leadership Avatar
        </span>
        <span className="text-xs leading-snug text-light-blue">
          Weatherhead School of Management
        </span>
      </span>
    </NextLink>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-4 pb-4 pt-6">
      {brand}

      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-2" aria-label="Loading navigation">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-11 rounded-lg bg-white/[0.06]" />
          ))}
        </div>
      ) : (
        user && (
          <nav aria-label="Main" className="flex flex-col gap-6">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="px-3 pb-1 text-xs text-light-blue">{group}</p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const Icon = iconMap[item.icon as keyof typeof iconMap];
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <NextLink
                          aria-current={active ? "page" : undefined}
                          className={clsx(
                            "flex h-11 items-center gap-3 rounded-lg px-3 text-[14.5px] transition-colors duration-150 ease-out focus-visible:outline-light-blue",
                            active
                              ? "bg-white font-semibold text-cwru-blue"
                              : "text-white/[0.88] hover:bg-white/10 hover:text-white",
                          )}
                          href={item.href}
                        >
                          {Icon && <Icon aria-hidden className="shrink-0" size={18} strokeWidth={1.5} />}
                          {item.label}
                        </NextLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )
      )}

      {isStudent && user && <UpNextCard refreshKey={pathname} />}

      <div className="mt-auto flex flex-col gap-4">
        <div className="rounded-lg bg-white px-3 py-2">
          <Image
            alt="Case Western Reserve University, Weatherhead School of Management"
            className="h-auto w-full max-w-[200px]"
            height={112}
            src="/cwru_wsom_logo.png"
            width={448}
          />
        </div>

        {user && (
          <AccountMenu
            initials={initials}
            name={user.name}
            settingsActive={pathname.startsWith("/settings")}
            showSettings={isStudent}
            subtitle={isStudent ? "Weatherhead student" : "Faculty and staff"}
            onSignOut={logout}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Below 900px: a CWRU Blue top bar; the full sidebar opens as a drawer. */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-cwru-blue px-4 min-[900px]:hidden">
        {brand}
        <button
          aria-controls="mobile-nav"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          className="grid size-11 place-items-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-light-blue"
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X aria-hidden size={22} /> : <Menu aria-hidden size={22} />}
        </button>
      </header>

      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-ink/40 min-[900px]:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed left-0 top-0 z-50 h-dvh w-[272px] max-w-[85vw] bg-cwru-blue transition-transform duration-200 ease-out min-[900px]:hidden",
          mobileOpen ? "translate-x-0 shadow-raised" : "-translate-x-full",
        )}
        id="mobile-nav"
        inert={!mobileOpen}
      >
        {sidebarContent}
      </aside>

      <aside className="hidden h-dvh w-[256px] shrink-0 flex-col bg-cwru-blue min-[900px]:flex">
        {sidebarContent}
      </aside>
    </>
  );
};

/** The profile row is one button that opens Settings and Sign out above it. */
function AccountMenu({
  initials,
  name,
  subtitle,
  showSettings,
  settingsActive,
  onSignOut,
}: {
  initials: string;
  name: string;
  subtitle: string;
  showSettings: boolean;
  settingsActive: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-ink transition-colors duration-150 ease-out hover:bg-canvas";

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 flex flex-col gap-0.5 rounded-lg border border-line bg-white p-1 shadow-raised"
          id="account-menu"
          role="menu"
        >
          {showSettings && (
            <NextLink
              aria-current={settingsActive ? "page" : undefined}
              className={clsx(itemClass, settingsActive && "font-semibold text-cwru-blue")}
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Settings aria-hidden size={18} strokeWidth={1.5} />
              Settings
            </NextLink>
          )}
          <button className={itemClass} role="menuitem" type="button" onClick={onSignOut}>
            <LogOut aria-hidden size={18} strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      )}
      <button
        aria-controls="account-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors duration-150 ease-out hover:bg-white/10 focus-visible:outline-light-blue"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-light-blue text-[13px] font-bold text-cwru-blue"
        >
          {initials || "?"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-white">{name}</span>
          <span className="truncate text-xs text-light-blue">{subtitle}</span>
        </span>
        <ChevronsUpDown aria-hidden className="shrink-0 text-light-blue" size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
