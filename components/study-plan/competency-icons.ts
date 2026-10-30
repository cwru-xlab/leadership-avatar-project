import {
  Crosshair,
  Ear,
  Flag,
  Lightbulb,
  ListOrdered,
  Mic,
  Scale,
  Shield,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per competency in `lib/mastery/competencies.ts`, so a skill reads
 * the same on Paths, Mastery and Study plans. An unknown key falls back to a
 * neutral target rather than failing.
 */
const COMPETENCY_ICONS: Record<string, LucideIcon> = {
  delivery_presence: Mic,
  structure_and_clarity: ListOrdered,
  concision_and_focus: Crosshair,
  audience_attunement: Ear,
  holding_position_under_pressure: Shield,
  credibility_of_the_case: Scale,
  outcome_achievement: Flag,
};

export function competencyIcon(key: string | null | undefined): LucideIcon {
  return (key && COMPETENCY_ICONS[key]) || Target;
}

/**
 * Icon for a free-text plan theme ("Improving Organization of Responses").
 * Display only: a keyword match picks a picture, it never classifies the
 * theme for any other purpose.
 */
const THEME_KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/organi[sz]|structur|clarity|order/i, ListOrdered],
  [/listen|attun|audience|rapport|empath/i, Ear],
  [/aware|reflect|insight|growth mindset/i, Lightbulb],
  [/concis|focus|brief|tight/i, Crosshair],
  [/presence|deliver|voice|camera|eye|pace|filler/i, Mic],
  [/pressure|confiden|composure|assert|negotiat/i, Shield],
  [/credib|evidence|data|case/i, Scale],
  [/team|collab|stakeholder|relationship/i, Users],
];

export function themeIcon(theme: string): LucideIcon {
  return THEME_KEYWORDS.find(([pattern]) => pattern.test(theme))?.[1] ?? Target;
}
