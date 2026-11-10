/*
 * Visible-test runner for the technical coding interview.
 *
 * Candidate Python runs HERE — in a dedicated Web Worker inside the
 * candidate's own browser — and never in the Next.js/Vercel process. That is
 * the whole reason this file exists: `lib/technical-interview/sandbox.ts`
 * deliberately fails closed because no managed server-side execution provider
 * has been approved, and running learner source in the application process is
 * not an option.
 *
 * Because the candidate controls this environment, nothing it reports is
 * evidence. These results exist to let a candidate iterate like they would in
 * a real editor. Deterministic correctness stays `null` end to end
 * (`lib/engine/evaluation-runner.ts` forces `coding_correctness: null`), and
 * the worker never sees hidden tests, reference solutions, or rubric data —
 * only the learner-visible fixtures already rendered in the problem panel.
 *
 * The host terminates this worker on timeout, which is how a candidate's
 * infinite loop is survivable: the interview tab stays responsive because no
 * candidate code ever executes on the main thread.
 */

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const MAX_STDOUT_CHARS = 4000;
const MAX_MESSAGE_CHARS = 500;

let runtimePromise = null;

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      importScripts(`${PYODIDE_BASE}pyodide.js`);
      return loadPyodide({ indexURL: PYODIDE_BASE });
    })().catch((error) => {
      // Let a later attempt retry a transient CDN failure.
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/**
 * Compares with Python `==` so list/bool/None semantics match what the
 * candidate would see locally, and keeps each candidate test isolated so one
 * raised exception does not abort the rest of the run.
 */
const HARNESS = `
import contextlib, io, json

def __run_visible_tests(spec_json):
    spec = json.loads(spec_json)
    entry = spec["entry"]
    results = []
    buffer = io.StringIO()
    target = globals().get(entry)
    if not callable(target):
        return json.dumps({
            "fatal": "missing_entry",
            "message": "Define " + entry + "(...) before running the visible tests.",
        })
    with contextlib.redirect_stdout(buffer):
        for test in spec["tests"]:
            try:
                produced = target(*test["input"])
                results.append({
                    "id": test["id"],
                    "passed": bool(produced == test["expected"]),
                    "produced": repr(produced),
                    "expected": repr(test["expected"]),
                })
            except BaseException as error:
                results.append({
                    "id": test["id"],
                    "passed": False,
                    "error": type(error).__name__ + ": " + str(error),
                })
    return json.dumps({"results": results, "stdout": buffer.getvalue()})
`;

function truncate(value, limit) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function runJavaScript(source, entry, tests) {
  let target;
  try {
    // Candidate code is intentionally evaluated only inside this disposable
    // browser worker. `entry` is derived from trusted starter code, never a
    // browser-provided expression.
    target = new Function(`${source}\nreturn typeof ${entry} === "function" ? ${entry} : null;`)();
  } catch (error) {
    return {
      status: "failed",
      errorCategory: error instanceof SyntaxError ? "syntax_error" : "runtime_error",
      message: truncate(String(error), MAX_MESSAGE_CHARS),
    };
  }
  if (typeof target !== "function") {
    return { status: "failed", errorCategory: "runtime_error", message: `Define ${entry}(...) before running the visible tests.` };
  }
  const display = (value) => {
    try {
      const encoded = JSON.stringify(value);
      return encoded === undefined ? String(value) : encoded;
    } catch {
      return "[unsupported value]";
    }
  };
  // Visible fixtures are JSON-like values. Compare their structure rather than
  // serialization: insertion order must not matter and non-finite values must
  // never alias JSON null.
  const equal = (left, right) => {
    if (typeof left === "number" || typeof right === "number") {
      return Number.isFinite(left) && Number.isFinite(right) && Object.is(left, right);
    }
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]));
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && equal(left[key], right[key]));
  };
  const results = tests.map((test) => {
    try {
      const produced = target(...test.input);
      return { id: test.id, passed: equal(produced, test.expected), produced: display(produced), expected: display(test.expected) };
    } catch (error) {
      return { id: test.id, passed: false, error: `${error?.name || "Error"}: ${error?.message || String(error)}` };
    }
  });
  return { status: "completed", stdout: "", results };
}

self.onmessage = async (event) => {
  const { runId, source, language, entry, tests } = event.data || {};
  const reply = (payload) => self.postMessage({ runId, ...payload });

  try {
    if (language === "javascript") {
      reply(runJavaScript(source, entry, tests));
      return;
    }
    const pyodide = await loadRuntime();

    // A fresh module namespace per run: a previous run's globals must not make
    // a later run pass (for example a helper the candidate has since deleted).
    const globals = pyodide.globals.get("dict")();
    try {
      try {
        pyodide.runPython(source, { globals });
      } catch (error) {
        reply({
          status: "failed",
          errorCategory: /SyntaxError|IndentationError/.test(String(error))
            ? "syntax_error"
            : "runtime_error",
          message: truncate(
            String(error).split("\n").filter(Boolean).slice(-3).join(" · "),
            MAX_MESSAGE_CHARS,
          ),
        });
        return;
      }

      pyodide.runPython(HARNESS, { globals });
      const raw = globals.get("__run_visible_tests")(
        JSON.stringify({ entry, tests }),
      );
      const parsed = JSON.parse(raw);

      if (parsed.fatal) {
        reply({
          status: "failed",
          errorCategory: "runtime_error",
          message: truncate(parsed.message, MAX_MESSAGE_CHARS),
        });
        return;
      }

      reply({
        status: "completed",
        stdout: truncate(parsed.stdout, MAX_STDOUT_CHARS),
        results: parsed.results.map((result) => ({
          id: result.id,
          passed: Boolean(result.passed),
          ...(result.error
            ? { error: truncate(result.error, MAX_MESSAGE_CHARS) }
            : {
                produced: truncate(result.produced, MAX_MESSAGE_CHARS),
                expected: truncate(result.expected, MAX_MESSAGE_CHARS),
              }),
        })),
      });
    } finally {
      globals.destroy();
    }
  } catch (error) {
    reply({
      status: "failed",
      errorCategory: "unavailable",
      message: truncate(
        `The Python runtime could not start: ${String(error)}`,
        MAX_MESSAGE_CHARS,
      ),
    });
  }
};
