export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  // Placeholder product name (TBD) — Weatherhead Leadership Institute practice platform
  name: "LeadPath",
  description:
    "Weatherhead leadership practice: interviews, pitches, and courageous conversations",
  navItems: [
    {
      label: "Home",
      href: "/",
      icon: "Home",
    },
    {
      label: "Scenarios",
      href: "/case-management",
      icon: "Briefcase",
    },
    {
      label: "Avatar Management",
      href: "/avatar-profiles",
      icon: "Video",
    },
    {
      label: "Cohort Management",
      href: "/codes",
      icon: "GraduationCap",
    },
  ],
  studentNavItems: [
    {
      label: "Practice",
      href: "/practice",
      icon: "Briefcase",
    },
    {
      label: "Progress",
      href: "/progress",
      icon: "ChartColumnBig",
    },
    {
      label: "Plan",
      href: "/plan",
      icon: "GraduationCap",
    },
    {
      label: "Settings",
      href: "/student-cases/settings",
      icon: "Settings",
    },
  ],
  // JWT and Authentication Configuration
  auth: {
    // JWT token expiration time (for jose library)
    jwtExpiresIn: "45d", // 45 days
    // Cookie expiration time in seconds
    cookieMaxAge: 60 * 60 * 24 * 45, // 45 days in seconds
    // Cookie configuration
    cookie: {
      name: "auth-token",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  },
  localCache: {
    avatarPreviewChatLocalStorageKeyPrefix: "wsom-ai-avatar-preview-chat-",
    addAvatarDraftLocalStorageKey: "wsom-ai-avatar-add-draft",
  },
};
