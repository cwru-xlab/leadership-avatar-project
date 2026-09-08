/**
 * In-memory users for local browsing when DATABASE_URL is unset.
 * Matches prisma/seed.ts credentials — development only.
 */

import { hashPassword } from "@/lib/auth-password";

export interface DevUserRecord {
  id: string;
  email: string;
  name: string;
  role: "admin" | "professor" | "student" | "kiosk";
  passwordHash: string;
  studentNumber?: string;
}

/** Lazy hashes so we don't run crypto at module load in edge bundles unnecessarily */
let cached: DevUserRecord[] | null = null;

export function getDevUsers(): DevUserRecord[] {
  if (cached) return cached;
  cached = [
    {
      id: "dev-admin",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      passwordHash: hashPassword("admin123"),
    },
    {
      id: "dev-professor-smith",
      email: "professor.smith@case.edu",
      name: "Dr. John Smith",
      role: "professor",
      passwordHash: hashPassword("prof123"),
    },
    {
      id: "dev-student",
      email: "student@case.edu",
      name: "Jane Smith",
      role: "student",
      passwordHash: hashPassword("student123"),
      studentNumber: "jxs456",
    },
    {
      id: "dev-alice",
      email: "alice.johnson@case.edu",
      name: "Alice Johnson",
      role: "student",
      passwordHash: hashPassword("student123"),
      studentNumber: "STU001",
    },
  ];
  return cached;
}

export function findDevUser(
  email: string,
  password: string
): DevUserRecord | null {
  const normalized = email.trim().toLowerCase();
  const user = getDevUsers().find((u) => u.email === normalized);
  if (!user) return null;
  if (user.passwordHash !== hashPassword(password)) return null;
  return user;
}
