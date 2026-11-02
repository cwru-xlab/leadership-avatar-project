import { routes } from "@/lib/routes";

export const siteConfig = {
  name: "Leadership Avatar",
  description: "AI Case Study",
  // `group` becomes the sentence-case label above each block in the sidebar.
  navItems: [
    { label: "Home", href: "/", icon: "Home", group: "Manage" },
    { label: "Cases", href: "/case-management", icon: "Briefcase", group: "Manage" },
    { label: "Avatars", href: "/avatar-profiles", icon: "Video", group: "Manage" },
  ],
  // Settings lives on the sidebar's profile row, not in this list.
  studentNavItems: [
    { label: "Practice", href: routes.practice(), icon: "Mic", group: "Practice" },
    { label: "My reports", href: routes.reports(), icon: "FileText", group: "Practice" },
    { label: "Study plans", href: "/study-plans", icon: "BookOpenCheck", group: "Progress" },
    { label: "Paths", href: "/paths", icon: "Route", group: "Progress" },
    { label: "Mastery", href: "/mastery", icon: "ChartColumnBig", group: "Progress" },
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

export type SiteConfig = typeof siteConfig;
