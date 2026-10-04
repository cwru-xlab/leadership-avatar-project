# Phase 16 deferred items (discovered during execution)

## Out of scope (not caused by 16-02)

- **`lib/deck/pdf-extract.ts` tsc error** — `Argument of type '(errData: { parserError?: unknown; }) => void' is not assignable...` seen during `npx tsc --noEmit` while verifying 16-02. File is Phase 14 deck work from a parallel agent; not touched by 16-02. Do not block attestation store on it.

## Out of scope (discovered during 16-11)

- **`scripts/verify-report-structure.ts` fails on `difficult-conversation`** — section 6 loops `ENGINE_TYPES` and only stubs instances for `case-study` and `pitch-elevator`; Phase 15's `difficult-conversation` (`instance.required: true`) now returns `ok: false`. Pre-existing Phase 15 gap; not caused by the networking tile flip or surface-count guard. Fix belongs with Phase 15 / report-structure maintainers.
- **Pre-existing `tsc --noEmit` errors in verify scripts** — `scripts/verify-dc-prepublish.ts`, `scripts/verify-dc-routes.ts`, `scripts/verify-networking-distill-gate.ts`, `scripts/verify-networking-type.ts` (unused `@ts-expect-error`). Not introduced by 16-11; product `lib/` / `app/` / `components/` paths not implicated by these script-only diagnostics.
