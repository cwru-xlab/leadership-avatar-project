/**
 * Phase 12 plan 12-03 spike: prove `@mediapipe/tasks-vision` can load and run
 * inside a Web Worker in THIS project, under both `next dev --turbopack` and
 * `next build` (webpack).
 *
 * Loaded as an ES-module worker:
 *   new Worker(new URL("./visual-capture.worker.ts", import.meta.url), { type: "module" })
 *
 * The one documented community pitfall (see `.planning/phases/12-embodied-visual-signals/12-RESEARCH.md`,
 * Pitfall 1) is that the tasks-vision UMD bundle (`vision_bundle.js`) calls
 * `importScripts()` internally, which is invalid inside a module worker. The
 * installed package also ships `vision_bundle.mjs` — a real ES module with no
 * `importScripts` call — and a plain top-level `import` resolves to that
 * `.mjs` build (confirmed via `node_modules/@mediapipe/tasks-vision/package.json`
 * "exports" map: the `import` condition points at `vision_bundle.mjs`). This
 * spike's only job is to confirm that resolution actually holds under both of
 * this project's bundlers before any real detection logic is built on it.
 *
 * Resolves WASM from the existing self-hosted `/mediapipe/wasm` directory and
 * the model from `/mediapipe/face_landmarker.task` — no CDN, matching the
 * Phase 10 constraint.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let landmarker: FaceLandmarker | null = null;

async function init() {
  const resolver = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  landmarker = await FaceLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: "/mediapipe/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
  });
  self.postMessage({ type: "ready" });
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (msg?.type === "init") {
    try {
      await init();
    } catch (error) {
      self.postMessage({
        type: "init-error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (msg?.type === "detect-spike") {
    const bitmap = msg.bitmap as ImageBitmap;
    try {
      if (!landmarker) {
        bitmap.close();
        self.postMessage({ type: "detect-spike-error", reason: "not-ready" });
        return;
      }
      const result = landmarker.detectForVideo(bitmap, msg.timestamp);
      const faceCount = result.faceLandmarks.length;
      bitmap.close();
      self.postMessage({ type: "detect-spike-result", faceCount });
    } catch (error) {
      bitmap.close();
      self.postMessage({
        type: "detect-spike-error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
