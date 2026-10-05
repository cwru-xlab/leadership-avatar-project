# Vendored MediaPipe models

All four model files below are self-hosted under `public/mediapipe/` rather
than loaded from a CDN or `@latest`/`/latest/` path — the Phase 10 constraint
(see `10-03-SUMMARY.md`). Each entry records the exact pinned download URL
used, the date it was fetched, and the real byte size on disk (`ls -la`),
since MediaPipe periodically republishes these files under the same name and
without this record a build is not reproducible.

| File | Download URL | Date vendored | Byte size |
|---|---|---|---|
| `face_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | 2026-09-24 (Phase 10, plan 10-03) | 3,758,596 bytes (~3.6MB) |
| `pose_landmarker_lite.task` | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | 2026-10-01 (Phase 12, plan 12-05) | 5,777,746 bytes (~5.5MB) |
| `hand_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | 2026-10-01 (Phase 12, plan 12-05) | 7,819,105 bytes (~7.5MB) |
| `efficientdet_lite0.tflite` | `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite` | 2026-10-01 (Phase 12, plan 12-05) | 7,254,339 bytes (~6.9MB) |

Notes:

- Every URL above is pinned to version `1` under its model family — never
  `/latest/`, never an unversioned path. Re-vendoring a model means
  downloading the exact URL above again (or bumping the version number
  deliberately and updating this table), not re-resolving a floating alias.
- The phase context's original estimates (~8MB hand, ~6MB pose-lite, ~4.4MB
  efficientdet-lite0) were never independently verified before this plan;
  the real, measured sizes are the ones in the table above.
- `pose_landmarker_lite.task` is the `_lite` variant deliberately — the frame
  budget proven in `12-03-SUMMARY.md` is the binding constraint, not landmark
  precision (see `12-05-PLAN.md` Task 1).
- `efficientdet_lite0.tflite` ships the full 80-class COCO label set,
  including `"cell phone"` — no custom classifier or training data is used;
  `lib/metrics/visual-capture.worker.ts` filters to that one class only.
- None of these four paths are gitignored; all four are committed as real
  binaries (confirmed via `file` reporting `data`, not HTML/text, and via
  `git status` showing them staged as regular blobs).
