---
phase: 16-networking-practice
plan: 06
subsystem: config
tags: [networking, characters, persona, code-records, seniority-field]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/registry.ts code-record config convention (lookup returns null, list in declaration order)"
  - phase: 08-interview-customization
    provides: "MAX_PERSONA_LENGTH export from lib/interview/customization.ts"
provides:
  - "NETWORKING_CHARACTERS — five named fictional people as typed code records"
  - "getNetworkingCharacter / listNetworkingCharacters — lookup + picker order"
  - "scripts/verify-networking-characters.ts — ten-section proof of spread and absences"
affects:
  - 16-07 (TYPE record imports characters into networking config / prompt assembly)
  - 16-08 (wizard character picker)
  - InteractionReport.inputSnapshot (character ids are permanent history)

tech-stack:
  added: []
  patterns:
    - "Curated characters as TypeScript code records — no migration, no seed, no instance data"
    - "Persona capped via imported MAX_PERSONA_LENGTH (shared with distiller contract)"
    - "Seniority+field organizing axis; difficulty ladder and setting deferred"

key-files:
  created:
    - lib/networking/characters.ts
    - scripts/verify-networking-characters.ts
  modified: []

key-decisions:
  - "Five characters (within 4–6 band): VC, technical recruiter, consumer-goods VP, peer product analyst, management-consulting director"
  - "Stable kebab ids: priya-malhotra, marcus-okonkwo, elena-vasquez, devon-park, amira-hassan — permanent inputSnapshot history"
  - "Persona length enforced with imported MAX_PERSONA_LENGTH plus module-scope throw; no local 600 constant"
  - "Task 3 human-verify skipped per parallelization.skip_checkpoints; verify script is the automated gate"

patterns-established:
  - "lib/networking/characters.ts mirrors getEngineType null-on-unknown + list-in-declaration-order"
  - "Deliberate absences (avatarId, difficulty, setting) documented in file header and asserted mechanically"

requirements-completed: [P16-SC2]

duration: 8min
completed: 2026-10-04
---

# Phase 16 Plan 06: Networking Characters Summary

**Five named fictional networking contacts as TypeScript code records spanning three seniorities and five fields, with shared MAX_PERSONA_LENGTH personas and no difficulty axis, pinned avatar, or assumed setting.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-04T04:17:57Z
- **Completed:** 2026-10-04T04:26:00Z
- **Tasks:** 3/3 (Task 3 checkpoint skipped per `parallelization.skip_checkpoints`)
- **Files modified:** 2 created

## Accomplishments

- Shipped `NetworkingCharacter` type plus five curated people playable with no persona authoring.
- Spread is seniority + field (peer / senior×3 / executive; venture capital, technical recruiting, consumer goods, product analytics, management consulting) — not difficulty.
- Ten-section verify script proves count band, stable ids, names in personas, spreads, persona contract, and deliberate absences.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare the NetworkingCharacter shape and the five records** — `d98d3cf` (feat)
2. **Task 2: Prove the spread and the deliberate absences** — `3724b97` (test)
3. **Task 3: Judge the five characters as people** — checkpoint skipped (`parallelization.skip_checkpoints`); automated verify evidence below (no separate commit)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `lib/networking/characters.ts` — type, five records, `NETWORKING_CHARACTERS`, `getNetworkingCharacter`, `listNetworkingCharacters`
- `scripts/verify-networking-characters.ts` — ten assertion sections, exits non-zero on failure

## Stable character ids (permanent inputSnapshot history)

| id | displayName | seniority | field |
| ---- | ---- | ---- | ---- |
| `priya-malhotra` | Priya Malhotra | senior | venture capital |
| `marcus-okonkwo` | Marcus Okonkwo | senior | technical recruiting |
| `elena-vasquez` | Elena Vasquez | executive | consumer goods |
| `devon-park` | Devon Park | peer | product analytics |
| `amira-hassan` | Amira Hassan | senior | management consulting |

## Final records (verbatim)

### priya-malhotra

- **headline:** Partner at Northshore Ventures
- **blurb:** An early-stage investor who pattern-matches fast and asks so-what questions. Good practice when you need a crisp thesis and a clear ask.
- **persona (329 chars):** Priya Malhotra, a partner at Northshore Ventures, an early-stage fund. You have eleven years in venture capital. You listen for patterns and interrupt to ask so-what questions; you decide quickly whether a conversation is worth continuing. You give short replies until the other person offers a concrete thesis or a specific ask.

### marcus-okonkwo

- **headline:** Technical Recruiter at Cleargate Systems
- **blurb:** An in-house recruiter at a mid-size software company. Warm, brisk, and direct about fit — practice stating what you want without being prompted.
- **persona (367 chars):** Marcus Okonkwo, an in-house technical recruiter at Cleargate Systems, a mid-size software company. You have eight years in technical recruiting. You are warm and fast: you screen for fit within two minutes and ask what the other person actually wants rather than waiting to be asked. You keep the exchange brisk and redirect vague answers toward a concrete next step.

### elena-vasquez

- **headline:** VP of Brand at Harborleaf Consumer
- **blurb:** A brand executive outside software. Courteous but short on time — practice being concrete fast, then earning a longer conversation.
- **persona (355 chars):** Elena Vasquez, VP of Brand at Harborleaf Consumer, a mid-size consumer goods company. You have eighteen years in consumer goods, most recently as an executive. You are courteous but genuinely short on time: you give two sentences and wait. You warm considerably when the other person is concrete about what they want and why they came to you specifically.

### devon-park

- **headline:** Product Analyst at Brightlane Analytics
- **blurb:** A peer about two years out of school. Relaxed and happy to talk shop — you have to steer; they will not carry the conversation for you.
- **persona (294 chars):** Devon Park, a product analyst at Brightlane Analytics. You are two years out of school in product analytics. You are relaxed and chatty, happy to talk shop, and you will not drive the conversation — the other person has to. You answer openly once asked, but you rarely volunteer the next topic.

### amira-hassan

- **headline:** Director of Strategy at Lumenbridge Advisors
- **blurb:** A strategy director in management consulting — likely outside your field. Thoughtful, and will ask why you came to them specifically.
- **persona (335 chars):** Amira Hassan, a director of strategy at Lumenbridge Advisors, a boutique management consulting firm. You have fourteen years in management consulting. You are thoughtful: you ask why the other person is talking to you specifically, and you linger on that question until you hear a clear answer. You speak carefully and expect the same.

## Copy changes (Task 3)

None — human-verify checkpoint skipped under `parallelization.skip_checkpoints`. No before/after copy edits.

## Checkpoint skip evidence (Task 3)

`npx tsx scripts/verify-networking-characters.ts` exited 0 with all ten sections passing:

1. Count = 5 (within 4–6)
2. Unique lowercase-kebab ids
3. Every displayName is first+last and appears in its persona
4. Seniority distribution `{"senior":3,"executive":1,"peer":1}`
5. Five distinct fields; non-tech includes venture capital, consumer goods, management consulting
6. No difficulty/level/hardness keys; no easy/difficult wording in persona/blurb
7. No avatar/voice/preview keys
8. No setting vocabulary in personas
9. All personas ≤ `MAX_PERSONA_LENGTH` (600), no markdown, do not start with "You are"
10. `getNetworkingCharacter("no-such-id")` returns null without throwing

`git diff --stat lib/engine prisma/schema.prisma` empty — no registry edit, no migration.

## Decisions Made

- Invented employers only (Northshore Ventures, Cleargate Systems, Harborleaf Consumer, Brightlane Analytics, Lumenbridge Advisors) — no real companies or public figures.
- Consumer goods + management consulting satisfy the non-tech breadth requirement; tech remains represented via recruiting and product analytics.
- Module-scope length check throws at import if any persona exceeds `MAX_PERSONA_LENGTH`.

## Deviations from Plan

None - plan executed exactly as written (Task 3 human-verify skipped per orchestrator `skip_checkpoints: true`, documented above).

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-07 can import `NETWORKING_CHARACTERS` / `getNetworkingCharacter` into the networking TYPE record and prompt assembly.
- 16-08 can render `listNetworkingCharacters()` as the picker order.
- Character ids above are frozen for `InteractionReport.inputSnapshot`.

## Self-Check: PASSED

- FOUND: `lib/networking/characters.ts`
- FOUND: `scripts/verify-networking-characters.ts`
- FOUND: commit `d98d3cf`
- FOUND: commit `3724b97`
- FOUND: verify script exit 0

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
