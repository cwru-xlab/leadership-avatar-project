# Phase 16 deferred items (discovered during execution)

## Out of scope (not caused by 16-02)

- **`lib/deck/pdf-extract.ts` tsc error** — `Argument of type '(errData: { parserError?: unknown; }) => void' is not assignable...` seen during `npx tsc --noEmit` while verifying 16-02. File is Phase 14 deck work from a parallel agent; not touched by 16-02. Do not block attestation store on it.
