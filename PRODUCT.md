# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Weatherhead School of Management students practicing leadership conversations (interviews, case studies, pitches, networking, courageous conversations) with an AI avatar, then reviewing scored reports and following study paths.

Secondary: professors and admins who author cases, avatar profiles, and kiosk/CTA configuration. Admin and kiosk surfaces are out of scope for the first cohesion pass.

## Product Purpose

Let a student rehearse a high-stakes leadership interaction out loud, get a scored report, and continue through a study plan and path until mastery of named competencies moves. Success is that a student can pick a practice type, complete a session, and know what to do next without hunting across mismatched URLs or chrome.

## Positioning

Live avatar conversation practice grounded in the student's own resume, cases, and authored scenarios — not a question-bank recorder. The mechanism is a shared practice engine with type-specific setup, a live counterpart, and a scored report that feeds study plans.

## Operating Context

Authenticated Next.js app used at a desk or in a Weatherhead lab/kiosk. Students sign in with CWRU SSO or email. Practice happens in a session shell (camera/mic consent, timed turns). Afterward they read reports, generate study plans, walk a path (drills, knowledge checks, coached steps), and check mastery. Reference for IA density: Big Interview — sectioned, tabulated, short labels, little marketing copy inside the tool.

## Capabilities and Constraints

Confirmed for the cohesion pass (2026-10-28):

- Light-only. Dark mode is removed, not rebuilt.
- Practice destinations unify under `/practice/{family}/…` with 301s from legacy picker URLs (`/interview`, `/case-play`, `/conversations`).
- Student nav keeps Practice, My Reports, Study Plans, Paths, Mastery, and Settings as separate items; they must read as one system, not three products.
- First visual pass is the student app only (shell, practice, reports, plans/paths/mastery, settings). Kiosk, CTA, and admin stay as they are except hiding Test Pages from the sidebar.
- Test Pages remain reachable by URL in development; they are not a nav item.
- Meeting facilitation is parked and not offered.

Undecided (not in this pass): fate of the stub `/about` page; whether `/avatar-management` and `/avatar-profiles` should merge (admin); nesting engine session URLs such as `/practice/general` under `/practice/interviews/general`.

## Brand Commitments

Product name: Leadership Avatar. School mark: Weatherhead / CWRU. Student practice screens already use navy ink (`#102331`) and Weatherhead teal (`#0a7391`) with a serif display on some pickers; admin screens still use default HeroUI blue. Those two languages must converge on the student side. Do not invent testimonials, placement stats, or Weatherhead claims.

## Evidence on Hand

Runnable app with seeded users (student@case.edu / student123). Real interaction types in `lib/interactions/index.ts` and engine slugs in `lib/engine/registry.ts`. No PRODUCT.md or DESIGN.md existed before this record. Do not fabricate student outcomes or quotes.

## Product Principles

1. One place for each job: pick practice, do the session, read the report, continue the plan.
2. URLs match the student's mental model (`/practice/…` for practice), not the order features were built.
3. The tool is quiet and sectional; marketing copy and eyebrows stay off app screens.
4. Color marks data, status, and one primary action — not chrome.
5. Parallel UI work shares one shell, type scale, and URL taxonomy; local invention is a defect.

## Accessibility & Inclusion

Keyboard-complete setup and session controls; visible focus; contrast at 4.5:1 on light surfaces. Camera and mic consent is required before live avatar practice and must remain explicit.
