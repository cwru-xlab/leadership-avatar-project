"use client";

/**
 * Host side of the visible-test runner worker.
 *
 * Candidate code executes in the worker (see
 * `public/technical-runner.worker.js`), never on the server and never on this
 * thread. The host owns the wall-clock limit: on timeout it TERMINATES the
 * worker, which is the only reliable way to stop a candidate's infinite loop,
 * and the next run starts a fresh one.
 *
 * These results are a developer-experience affordance, not interview
 * evidence — the candidate controls this runtime. Deterministic correctness
 * remains unavailable (`coding_correctness: null`) and nothing here is sent
 * to the evaluator.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PublicTechnicalTest,
  TechnicalCodingLanguage,
} from "@/lib/technical-interview/types";

export const VISIBLE_TEST_TIMEOUT_MS = 20_000;
/** First run also downloads the runtime from the CDN. */
export const VISIBLE_TEST_STARTUP_TIMEOUT_MS = 70_000;

export interface VisibleTestOutcome {
  id: string;
  passed: boolean;
  error?: string;
  produced?: string;
  expected?: string;
}

export type VisibleTestRun =
  | { status: "completed"; stdout: string; results: VisibleTestOutcome[] }
  | { status: "failed"; errorCategory: string; message: string };

/**
 * The learner-visible starter signature is the contract the tests call, so the
 * entry point is read from it rather than stored separately — existing
 * persisted snapshots predate any such field and must keep working.
 */
export function entryPointFromStarterCode(
  starterCode: string,
  language: TechnicalCodingLanguage,
): string | null {
  const pattern =
    language === "python"
      ? /^\s*def\s+([A-Za-z_]\w*)\s*\(/m
      : /^\s*function\s+([A-Za-z_]\w*)\s*\(/m;
  return pattern.exec(starterCode)?.[1] ?? null;
}

export function useVisibleTestRunner() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const settledRef = useRef(true);
  const [ready, setReady] = useState(false);

  const dispose = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => dispose, [dispose]);

  const run = useCallback(
    async (
      source: string,
      language: TechnicalCodingLanguage,
      entryPoint: string,
      tests: readonly PublicTechnicalTest[],
    ): Promise<VisibleTestRun> => {
      const runId = ++runIdRef.current;
      // A worker left mid-run cannot be reused: its Python may still be
      // looping. Replace it so the new run starts from a clean runtime.
      if (!settledRef.current) dispose();
      settledRef.current = false;

      let worker: Worker;
      try {
        worker =
          workerRef.current ??
          (workerRef.current = new Worker("/technical-runner.worker.js"));
      } catch {
        settledRef.current = true;
        return {
          status: "failed",
          errorCategory: "unavailable",
          message:
            "This browser could not start the code runner. Try a different browser.",
        };
      }

      const budget = ready
        ? VISIBLE_TEST_TIMEOUT_MS
        : VISIBLE_TEST_STARTUP_TIMEOUT_MS;

      const outcome = await new Promise<VisibleTestRun>((resolve) => {
        let finished = false;
        const settle = (value: VisibleTestRun) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          resolve(value);
        };

        const onMessage = (event: MessageEvent) => {
          // Ignore a late reply from a superseded run.
          if (event.data?.runId !== runId) return;
          const { status, stdout, results, errorCategory, message } = event.data;
          settle(
            status === "completed"
              ? { status: "completed", stdout: stdout ?? "", results: results ?? [] }
              : {
                  status: "failed",
                  errorCategory: errorCategory ?? "runtime_error",
                  message: message ?? "The run failed.",
                },
          );
        };

        const onError = () => {
          dispose();
          settle({
            status: "failed",
            errorCategory: "unavailable",
            message: "The code runner stopped unexpectedly. Try running again.",
          });
        };

        const timer = window.setTimeout(() => {
          // Terminating is the stop button for runaway candidate code.
          dispose();
          settle({
            status: "failed",
            errorCategory: "timeout",
            message: `Execution exceeded ${Math.round(budget / 1000)}s and was stopped. Check for an infinite loop.`,
          });
        }, budget);

        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.postMessage({
          runId,
          source,
          language,
          entry: entryPoint,
          tests: tests.map((test) => ({
            id: test.id,
            input: Array.isArray(test.input) ? test.input : [test.input],
            expected: test.expected,
          })),
        });
      });

      settledRef.current = true;
      if (outcome.status === "completed" || outcome.errorCategory !== "unavailable") {
        setReady(true);
      }
      return outcome;
    },
    [dispose, ready],
  );

  return { run, runtimeReady: ready };
}
