# 23 — VOICE_DRILL client contract

**Purpose:** mount the voice-drill runner on the shared session shell once the shell-extraction branch merges. The backend is done. Only the runner UI remains.

## Route and entry

- PathPanel links every `VOICE_DRILL` step to `/study-plans/{planId}/drills/{stepId}`. The link is keyed by **step id**.
- `app/study-plans/[planId]/drills/[stepId]/page.tsx` is a placeholder today. It loads the brief (`fetchDrill`) and renders `DrillBrief`. Replace its body with `<VoiceDrillRunner …/>` on the shared shell, and keep `DrillBrief` as the pre-start card.

## Props (pinned in `components/study-plan/drill/contract.ts`)

```ts
interface VoiceDrillRunnerProps {
  planId: string;
  stepId: string;
  drill: VoiceDrillDTO;              // from fetchDrill(stepId)
  liveTip: string;                   // = drill.tipText, shown live as-is
  durationSeconds: { minSeconds: 60; maxSeconds: 90 }; // soft timer, never a hard stop
  onGraded: (attempt: VoiceDrillAttemptDTO) => void;
  onExit: () => void;
}
interface DrillCaptureResult {       // what the shell hands back on stop
  transcript: string;
  spokenDurationMs: number;
  cameraMode: "ON" | "OFF";
  metrics: { visual: VisualMetrics | null; vocal: VocalMetrics | null } | null;
}
```

## API (typed client: `components/study-plan/drill/api.ts`)

| Call | Route | Notes |
|---|---|---|
| `fetchDrill(stepId)` | `GET /api/study-plans/path-steps/{stepId}/drill` | `{ drill: VoiceDrillDTO }`. Returns 404 for a wrong kind or a step the user doesn't own. Rebuilds a missing brief from the template. |
| `startDrillAttempt(stepId, cameraMode)` | `POST …/drill/attempts` | 201 `{ attempt }`. A redo is just another POST. The step goes to IN_PROGRESS. |
| `completeDrillAttempt(stepId, attemptId, body)` | `POST …/drill/attempts/{attemptId}/complete` | Body: `DrillCaptureResult`. 200 returns the graded `{ attempt }`. 422 `TOO_SHORT` means fewer than 25 words: the attempt stays open, so offer a retry. 502 `GRADING_FAILED` means nothing was written: resubmit the same body. 409 means the attempt was already completed. |

The DTO shapes are in `lib/study-plan/drill/types.ts`. The metrics payload is validated with `parseMetricsPayload`, the same as practice finish routes. Media-shaped data is dropped.

## Rules the runner must keep

1. **No numbers mid-drill.** During the rep, show only `drill.scenarioPrompt`, the live `tipText` and a soft timer. The API returns `score: null` for an open attempt. Show the score (1-5), the `feedback` note and the `delivery` figures only after `onGraded`.
2. **The tip is fixed text.** `tipText` is a reminder from the closed technique library: it names the skill and never scripts words. Don't generate other live tips.
3. **Camera + vocal/visual capture** come from the shared shell, with the same consent gate as practice. With the camera off, send `cameraMode: "OFF"`; visual metrics are then ignored server-side.
4. **Redo** is allowed at any time. Each completed attempt writes one `VOICE_DRILL` mastery contribution at the coached weight, and the first one completes the step. There is no gating and no streak copy: the forbidden-identifier scan covers `components/study-plan/drill/`.
5. Push-to-talk and the avatar stage are optional for a drill: there is no counterpart. A plain self-view plus mic capture satisfies the contract.

## Before it can run

The migration `prisma/migrations/20261124000000_add_voice_drills_and_prove_it` must be applied, and the Prisma client regenerated, **with the user's go-ahead**. Until then, the drill routes fail at the database layer. Path GET still renders (tolerant reads in `lib/study-plan/drill/repository.ts`).
