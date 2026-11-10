import { expect, test } from "@playwright/test";

type WorkerReply = {
  status: "completed" | "failed";
  errorCategory?: string;
  message?: string;
  results?: Array<{ id: string; passed: boolean }>;
};

async function runJavaScriptInWorker(
  page: import("@playwright/test").Page,
  source: string,
): Promise<WorkerReply> {
  // The runner is deliberately verified in an actual browser worker, never by
  // evaluating candidate code in Node or an application process.
  return page.evaluate(async (candidateSource) => {
    return new Promise<WorkerReply>((resolve, reject) => {
      const worker = new Worker("/technical-runner.worker.js");
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("Worker did not reply"));
      }, 5_000);
      worker.addEventListener("message", (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(event.data as WorkerReply);
      });
      worker.addEventListener("error", (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(event.error ?? new Error(event.message));
      });
      worker.postMessage({
        runId: 1,
        language: "javascript",
        source: candidateSource,
        entry: "pairSum",
        tests: [
          { id: "matching-pair", input: [[2, 7, 11, 15], 9], expected: [0, 1] },
          { id: "no-pair", input: [[1, 2], 9], expected: [] },
        ],
      });
    });
  }, source);
}

test.describe("technical visible-test worker", () => {
  test("executes JavaScript only in a browser worker", async ({ page }) => {
    await page.goto("/login");
    const reply = await runJavaScriptInWorker(
      page,
      `function pairSum(numbers, target) {
        const seen = new Map();
        for (let index = 0; index < numbers.length; index += 1) {
          const complement = target - numbers[index];
          if (seen.has(complement)) return [seen.get(complement), index];
          seen.set(numbers[index], index);
        }
        return [];
      }`,
    );

    expect(reply).toMatchObject({
      status: "completed",
      results: [
        { id: "matching-pair", passed: true },
        { id: "no-pair", passed: true },
      ],
    });
  });

  test("reports JavaScript syntax errors without running tests", async ({ page }) => {
    await page.goto("/login");
    const reply = await runJavaScriptInWorker(page, "function pairSum( {");

    expect(reply).toMatchObject({ status: "failed", errorCategory: "syntax_error" });
  });
});
