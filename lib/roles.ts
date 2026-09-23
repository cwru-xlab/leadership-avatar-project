import type { Role } from "@prisma/client";

/**
 * Phase 11: the ADMIN/USER role model, collapsed at the application layer ONLY.
 * The Postgres `Role` enum still has all four values — this is the single source of
 * truth for how app code interprets them.
 *   PROFESSOR -> admin   (professors keep access to the surviving operator tooling)
 *   STUDENT   -> user
 *   KIOSK     -> kiosk   (deliberately a distinct third branch; never folded in)
 *
 * This module is dependency-free (no `crypto`, no `prisma`, no `@vercel/edge-config`)
 * so it is safe to import from both server code (route handlers, middleware) and
 * client components ("use client" pages/components) alike. `lib/auth.ts` re-exports
 * these two functions rather than duplicating them — there must remain exactly ONE
 * implementation of the mapping.
 */

export type AppRole = "admin" | "user" | "kiosk";

export function toAppRole(role: string | Role | null | undefined): AppRole {
  const normalized = (role ?? "").toString().toLowerCase();
  if (normalized === "admin" || normalized === "professor") {
    return "admin";
  }
  if (normalized === "kiosk") {
    return "kiosk";
  }
  return "user";
}

/** True for ADMIN and PROFESSOR. Never true for KIOSK. */
export function isAdminRole(role: string | Role | null | undefined): boolean {
  return toAppRole(role) === "admin";
}
