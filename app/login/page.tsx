"use client";

import Image from "next/image";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { ChevronDown, University } from "lucide-react";
import { toAppRole } from "@/lib/roles";
import { LoginShowcase } from "@/components/auth/LoginShowcase";

// Mirrors the server-side gate in app/api/auth/login/route.ts. This is a client
// component, so it reads NEXT_PUBLIC_VERCEL_ENV (which Vercel exposes to the
// browser) rather than VERCEL_ENV, which is server-only. Undefined locally,
// which correctly leaves the email/password form visible in dev.
const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

// Seeded by prisma/seed.ts; selecting one fills the form. Never rendered in production.
const TEST_ACCOUNTS = [
  { role: "Student", email: "alice.johnson@case.edu", password: "student123" },
  { role: "Student", email: "student@case.edu", password: "student123" },
  { role: "Professor", email: "professor.smith@case.edu", password: "prof123" },
  { role: "Admin", email: "admin@example.com", password: "admin123" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, loginWithCWRU } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(email, password);

    if (result.success) {
      // Login successful, redirect based on role
      const meResponse = await fetch("/api/auth/me");
      const meData = await meResponse.json();
      if (toAppRole(meData.user?.role) === "user") {
        window.location.href = "/";
      } else {
        window.location.href = "/";
      }
    } else {
      // Login failed, show error
      setError(result.error || "Login failed");
    }

    setIsLoading(false);
  };

  const handleCWRULogin = () => {
    const params = new URLSearchParams(window.location.search);
    loginWithCWRU(params.get("returnTo") || "/");
  };

  // Error values are stable application codes, never reflected CAS responses.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const messages: Record<string, string> = {
      sso_unavailable: "CWRU SSO is unavailable right now. Please try again shortly.",
      sso_session_expired: "Your sign-in session expired. Please start again.",
      sso_sign_in_failed: "CWRU could not complete your sign-in. Please try again.",
      sso_handoff_invalid: "Your preview sign-in link expired. Please start again.",
      sso_error: "We could not complete your CWRU sign-in. Please try again.",
      missing_ticket: "A kiosk sign-in ticket is required.",
      invalid_ticket: "That kiosk sign-in ticket is invalid or expired.",
      kiosk_auto_login_error: "We could not complete kiosk sign-in. Please try again.",
    };
    const urlError = urlParams.get("error");
    if (urlError && messages[urlError]) {
      setError(messages[urlError]);
    }
  }, []);

  const fillTestAccount = (account: { email: string; password: string }) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="grid h-full content-start overflow-y-auto min-[900px]:content-stretch min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[900px]:overflow-hidden">
      <section className="order-2 flex items-center justify-center bg-canvas px-4 py-10 md:px-8 min-[900px]:order-1">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[32px] font-medium leading-[1.1] text-cwru-blue">
              Sign in
            </h1>
            <p className="text-[15px] text-muted">
              {isProduction
                ? "Use your CWRU network ID."
                : "Use your CWRU network ID or a test account."}
            </p>
          </div>

          {error && (
            <div
              className="rounded-lg border border-copper/40 bg-copper/[0.08] px-3 py-2.5 text-sm text-ink"
              role="alert"
            >
              {error}
            </div>
          )}

          <Button
            className="h-11 w-full rounded-lg font-semibold"
            color="primary"
            startContent={<University aria-hidden size={18} strokeWidth={1.5} />}
            type="button"
            variant={isProduction ? "solid" : "bordered"}
            onPress={handleCWRULogin}
          >
            Sign in with CWRU SSO
          </Button>

          {!isProduction && (
            <>
              <div className="flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" />
                or with email
                <span className="h-px flex-1 bg-line" />
              </div>

              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <Input
                  isRequired
                  autoComplete="email"
                  label="Email"
                  labelPlacement="outside"
                  placeholder="you@case.edu"
                  type="email"
                  value={email}
                  variant="bordered"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  isRequired
                  autoComplete="current-password"
                  label="Password"
                  labelPlacement="outside"
                  placeholder="Your password"
                  type="password"
                  value={password}
                  variant="bordered"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  className="h-11 w-full rounded-lg font-semibold"
                  color="primary"
                  isLoading={isLoading}
                  type="submit"
                >
                  {isLoading ? "Signing in" : "Sign in"}
                </Button>
              </form>

              <details className="group rounded-lg border border-line bg-white text-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  Test accounts (development only)
                  <ChevronDown
                    aria-hidden
                    className="text-muted transition-transform duration-200 group-open:rotate-180"
                    size={16}
                  />
                </summary>
                <ul className="flex flex-col divide-y divide-line border-t border-line">
                  {TEST_ACCOUNTS.map((account) => (
                    <li key={account.email}>
                      <button
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-canvas"
                        type="button"
                        onClick={() => fillTestAccount(account)}
                      >
                        <span className="font-semibold text-ink">{account.role}</span>
                        <span className="truncate text-muted">{account.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}

          <Image
            alt="Case Western Reserve University, Weatherhead School of Management"
            className="mt-4 h-auto w-[196px] rounded-lg border border-line bg-white px-2 py-1.5"
            height={112}
            src="/cwru_wsom_logo.png"
            width={448}
          />
        </div>
      </section>
      {/* Brand panel: the dot grid is reserved for login and the kiosk. */}
      <section className="la-dot-grid relative order-1 flex flex-col gap-6 px-6 min-[900px]:overflow-hidden py-8 text-white min-[900px]:order-2 min-[900px]:gap-8 min-[900px]:pl-14 min-[900px]:pt-14">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-white font-display text-xl italic text-cwru-blue">
            La
          </span>
          <span className="font-display text-xl font-medium">Leadership Avatar</span>
        </div>
        <div className="flex max-w-[32rem] flex-col gap-3">
          <p className="font-display text-[28px] font-medium leading-[1.15] min-[900px]:text-[32px]">
            Rehearse the conversation before it counts.
          </p>
          <p className="text-[15px] leading-[1.55] text-light-blue">
            Practice interviews, pitches, and hard conversations with an AI avatar, then read
            what went well and what to work on.
          </p>
        </div>
        <div className="hidden min-[900px]:block">
          <LoginShowcase />
        </div>
      </section>
    </div>
  );
}
