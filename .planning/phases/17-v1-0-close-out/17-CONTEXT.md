# Phase 17: v1.0 Close-Out - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Discharge the four loose ends milestone v1.0 left open:

- **REQ-74** — the shared Lightsail `InteractionReport` migration + backfill (Phase 13's Part 1), then Part 2's legacy `DROP`
- **REQ-75** — verification evidence for REQ-63's visible-context slice, a primitive that ALREADY EXISTS
- **REQ-76** — the `verify-deck-intake.ts` fixture/assertion mismatch
- **REQ-77** — the keyboard UAT deferred under `skip_checkpoints` on Phases 15 and 16

No new product capability. Phases 18 and 19 own the new work.

</domain>

<decisions>
## Implementation Decisions

### Shared-database cutover (REQ-74)

- **NO AGENT CONNECTS TO THE SHARED DATABASE. AT ALL.** Not a migration, not a
  write, **not even a read-only `SELECT`.** This is the strictest reading of
  `HANDOFF.md §3` and `13-MIGRATION-HANDOFF.md`, chosen deliberately so the
  documented rule stays literally true. The user was offered an agent-run Part 1
  and an agent-run read-only verification and **declined both.**
- The human runs every command. The phase's job is to (a) prepare the exact
  copy-pasteable sequence, (b) receive pasted output, (c) verify and record it.
- **Part 2 IS IN SCOPE** — a change from the v1.1 Out of Scope table, which must be
  amended. Sequence is strict: Part 1 applies → Part 1 verifies on shared → only
  then Part 2's `DROP TABLE` on `InterviewReport` and `ScenarioReport`. Part 2 never
  runs before Part 1 is confirmed good.
- `13-MIGRATION-HANDOFF.md` already contains the exact commands for both parts and
  does not need rewriting — it needs a Part 1 execution record appended.
- **Row counts will probably NOT match the local run's 70.** The shared DB has been
  in team testing, so legacy rows may have been written since. The backfill is
  idempotent, so this is safe — but ROADMAP criterion 1's "match the local run"
  wording is wrong and should read "match the shared source tables." Planner: fix
  that criterion.

### Phase-close policy on the human gate (REQ-74)

- **REQ-74 SPLITS OUT of phase completion if it has not run.** Phase 17 closes on
  REQ-75/76/77 alone, and REQ-74 becomes standing human-owned operational work
  tracked outside the phase.
- **Phase 13 closes at the same time**, on the same basis. It has been open since
  2026-10-04 solely because its close was coupled to an unscheduled human action.
- This is the explicit lesson from Phase 13: do not couple a phase's completion to a
  human action with no date on it. Phase 17 was structured to repeat that exact
  failure and was deliberately restructured to avoid it.
- No deadline mechanism. The split is unconditional if the migration has not run.

### Visible-context proof standard (REQ-75)

- **An automated harness, modelled on 16-09's sentinel leak test.** A sentinel from a
  not-yet-visible channel must be ABSENT from every outbound payload on real turns
  and PRESENT in the evaluation context. Durable and regression-catching, not a
  one-time observation.
- **Run against deck slides (`pitch-deck`)** — the hardest case and the one with real
  leak risk. Must cover both halves of Phase 14's criterion 3: a slide not yet
  reached never appears, AND navigating backward does not un-show what the avatar
  already saw.
- **Evidence is recorded back into Phase 13's directory**, not Phase 17's, so REQ-63
  and its proof live together. REQ-63 checks off in REQUIREMENTS.md pointing there.
- This is VERIFICATION, not construction. `visibleContext` already exists in
  `lib/engine/types.ts` and is sliced in `lib/engine/prompts.ts`; three type records
  configure it. If the harness fails, that is a defect to report, not a signal to
  build the primitive.

### Fixture reconciliation (REQ-76)

- **`scripts/generate-deck-fixtures.ts` is canonical.** It already produces
  `"Spike Deck Title"`, which is what `verify-deck-intake.ts:63` asserts — so point
  the harness at it and the mismatch disappears.
- **Do not change the assertion** to match the spike deck. Fix the wiring.
- `scripts/spike-deck-render.ts` stays as the 14-01 spike artifact it was built to
  be, producing `"Spike Deck Slide 1"`. Not deleted, not merged.
- Consolidating the two generators was considered and NOT chosen — wider than the
  deferred item asked for.

### Keyboard UAT (REQ-77)

- **TWO passes, not one.**
  - **Pass 1 — Phase 17:** exactly the deferred B–G keyboard items from
    `15-VALIDATION.md` and `16-VALIDATION.md`, plus Phase 15's hostile probe 5.
    Bounded and already specified.
  - **Pass 2 — Phase 19's closing plan:** the surfaces Phases 18 and 19 add.
    Phase 19's planner must carry this.
- This split exists so **Phase 17 does not depend on Phases 18 and 19.** The user
  initially asked for one combined pass; that would have inverted the roadmap
  (Phase 17 depends on nothing and runs in parallel) and made Phase 17 the last
  thing to finish in v1.1. Both answers are honored by splitting.
- **Defects found in Pass 1 ARE FIXED IN PHASE 17**, not logged and deferred.
- **With a checkpoint:** if total repair work starts to look like its own phase,
  STOP and present the defect list to the user before continuing. Do not silently
  absorb unbounded repair.
- A human performs the keyboard pass. An agent records the result and performs the
  repairs; it does not perform the keyboard pass itself.

### Claude's Discretion

- Harness file location and naming for the REQ-75 sentinel test.
- How the pasted shared-DB verification output is structured in the phase record.
- Plan decomposition and ordering within the phase (subject to: Part 1 verifies
  before Part 2 is offered).
- The boundary judgment for "repair work looks like its own phase" — but the
  checkpoint must actually fire rather than being resolved silently.

</decisions>

<specifics>
## Specific Ideas

- **16-09 is the model for REQ-75.** The user named the existing hidden-goal sentinel
  leak test as the pattern to follow. Read `16-09-PLAN.md` and its summary before
  designing the deck-slide harness.
- **The no-agent-on-shared rule is not a formality to route around.** It was offered
  as waivable and the user kept it. `13-MIGRATION-HANDOFF.md §2` explains why: Phase
  13 is the first migration in this project's history that rewrites data, and the
  team's old review bar ("no `NOT NULL`, no `DROP`") stopped being sufficient.
- **Criterion 1's "match the local run" is a known-wrong phrase.** Flagged above
  under REQ-74; do not treat a count mismatch as a failure.

</specifics>

<deferred>
## Deferred Ideas

- **Consolidating the two deck-fixture generators** into a single source so the
  mismatch cannot drift again — considered during this discussion, rejected as wider
  than REQ-76. Worth doing if the fixtures drift a second time.
- **Keyboard UAT of Phases 18/19 surfaces** — explicitly moved to Phase 19's closing
  plan (Pass 2 above). Not lost, not in Phase 17.
- **A deadline mechanism for human-gated work** — discussed and rejected in favor of
  the unconditional split. If REQ-74 drifts again as standing work, revisit.

</deferred>

<amendments_required>
## Amendments This Discussion Requires

The planner must make these, or flag them if it cannot:

1. **REQUIREMENTS.md v1.1 Out of Scope table** — the row reading "Part 2 of the
   shared-DB handoff (legacy `DROP TABLE`) — declinable by the human after the Part 1
   spot-check; not a v1.1 gate" is now WRONG. Part 2 is in scope, sequenced after
   Part 1 verifies.
2. **REQ-74** — gains a Part 2 clause, and its close-policy split must be recorded.
3. **ROADMAP.md Phase 17 criterion 1** — "match the local run" becomes "match the
   shared source tables."
4. **ROADMAP.md Phase 17 criterion 4** — must reflect the two-pass split and that
   Pass 1 defects are fixed in Phase 17.
5. **ROADMAP.md Phase 19** — gains the Pass 2 keyboard UAT as a closing obligation.
6. **Phase 13's roadmap entry and REQUIREMENTS.md REQ-66/REQ-67** — close under the
   split policy when Phase 17 closes.

</amendments_required>

---

*Phase: 17-v1-0-close-out*
*Context gathered: 2026-10-04*
