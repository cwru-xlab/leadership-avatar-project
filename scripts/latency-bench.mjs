#!/usr/bin/env node
/**
 * Interleaved A/B latency benchmark for /api/interaction/chat.
 *
 * Compares two running servers (e.g. two git worktrees on different ports) on
 * the metric that actually differs between the streaming and non-streaming
 * implementations: time to first usable content.
 *
 *   node scripts/latency-bench.mjs \
 *     --a http://localhost:3000 --label-a bug/latency \
 *     --b http://localhost:3001 --label-b main \
 *     --n 20
 *
 * Run both servers as PRODUCTION builds (npm run build && npx next start -p PORT).
 * Under `next dev` the first hit on a route pays for on-demand compilation and
 * will swamp the effect being measured.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const A = opt("a", "http://localhost:3000");
const B = opt("b", "http://localhost:3001");
const LABEL_A = opt("label-a", A);
const LABEL_B = opt("label-b", B);
const N = Number(opt("n", 20));
const WARMUP = Number(opt("warmup", 2));
const PAUSE_MS = Number(opt("pause", 500));
// The chat route sits behind the JWT middleware. Supply credentials and the
// script logs in against each server to obtain an auth-token cookie, or pass
// --cookie to reuse one copied from DevTools.
const EMAIL = opt("email", process.env.BENCH_EMAIL);
const PASSWORD = opt("password", process.env.BENCH_PASSWORD);
const COOKIE = opt("cookie", process.env.BENCH_COOKIE);

// ── Fixed input ───────────────────────────────────────────────────────────
// Every trial on every branch sends a byte-identical body for a given probe
// index, so the only variable is the server implementation. The client-side
// sliding window is deliberately not simulated: its effect is a smaller prompt,
// which is measured in token counts, not in this script.

const SYSTEM_PROMPT = `Background information about this case study:
Riverside Manufacturing has seen a 12% drop in on-time delivery over two quarters.
The plant runs three shifts. Second shift has the highest defect rate and the
highest turnover. The operations director believes the issue is staffing; the
line supervisors believe it is an aging calibration process on the number four
press. Leadership has asked for a recommendation within two weeks.`;

const ROLE_CONTEXT = {
  roleName: "Dana Whitfield",
  role: "Second Shift Line Supervisor",
  additionalInfo:
    "You have worked at the plant for eleven years. You are protective of your crew, " +
    "skeptical of management's staffing theory, and you have raised the calibration " +
    "issue twice before without result. You are direct but not hostile.",
};

const HISTORY = [
  { role: "user", content: "Thanks for making time, Dana. Can you walk me through what second shift looks like on a normal night?" },
  { role: "assistant", content: "Sure. We come in at three, take handoff from first shift, and run until eleven-thirty. Most nights it's fine. It's the handoff where things get messy." },
  { role: "user", content: "Messy how?" },
  { role: "assistant", content: "First shift doesn't always log where they left the calibration on press four. So we're guessing for the first hour." },
];

const PROBES = [
  "That's useful. What would you change first if it were your call?",
  "Have you raised the calibration issue with anyone above your supervisor?",
  "The operations director thinks this is a staffing problem. What's your read on that?",
  "How much of the defect rate do you think traces back to press four specifically?",
  "What would it take to fix the handoff process?",
];

const buildBody = (i) => ({
  messages: [...HISTORY, { role: "user", content: PROBES[i % PROBES.length] }],
  systemPrompt: SYSTEM_PROMPT,
  roleContext: ROLE_CONTEXT,
});

// ── One trial ─────────────────────────────────────────────────────────────

async function trial(baseUrl, probeIndex, cookie) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/interaction/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(buildBody(probeIndex)),
      // Never follow the middleware's redirect to /login: following it would
      // return a 200 HTML page and silently pollute the measurements.
      redirect: "manual",
    });
  } catch (err) {
    return { error: `request failed: ${err.message}` };
  }

  if (res.status >= 300 && res.status < 400) {
    return { error: "redirected to login — auth cookie missing or expired" };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };

  const ttHeaders = performance.now() - t0;
  const contentType = res.headers.get("content-type") || "";

  // Non-streaming (main): the whole JSON body is the first usable content.
  if (!contentType.includes("text/event-stream")) {
    const text = await res.text();
    const ttTotal = performance.now() - t0;
    let chars = 0;
    try {
      chars = (JSON.parse(text).message || "").length;
    } catch {
      return { error: "response was not JSON" };
    }
    return { mode: "json", ttHeaders, ttft: ttTotal, ttTotal, chars };
  }

  // Streaming (bug/latency): first usable content is the first non-empty
  // content delta. Keep draining so ttTotal is comparable to the JSON case.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let ttft = null;
  let chars = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (evt.type === "content" && evt.delta) {
        if (ttft === null) ttft = performance.now() - t0;
        chars += evt.delta.length;
      } else if (evt.type === "error") {
        return { error: "stream reported an error frame" };
      }
    }
  }

  const ttTotal = performance.now() - t0;
  if (ttft === null) return { error: "stream produced no content frames" };
  return { mode: "sse", ttHeaders, ttft, ttTotal, chars };
}

// ── Stats ─────────────────────────────────────────────────────────────────

const quantile = (sorted, q) => {
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil(q * sorted.length);          // nearest-rank
  return sorted[Math.min(rank, sorted.length) - 1];
};

const summarize = (values) => {
  const s = [...values].sort((x, y) => x - y);
  return { n: s.length, min: s[0], median: quantile(s, 0.5), p90: quantile(s, 0.9), max: s[s.length - 1] };
};

const ms = (v) => (Number.isFinite(v) ? `${v.toFixed(0)}ms` : "—");

// ── Auth ──────────────────────────────────────────────────────────────────

async function login(baseUrl, label) {
  if (COOKIE) return COOKIE;
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "auth required: pass --email and --password (or --cookie \"auth-token=...\"), " +
        "or set BENCH_EMAIL / BENCH_PASSWORD"
    );
  }
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`login failed on ${label}: HTTP ${res.status}`);

  const setCookie = res.headers.getSetCookie?.() || [];
  const auth = setCookie.find((c) => c.startsWith("auth-token="));
  if (!auth) throw new Error(`login on ${label} returned no auth-token cookie`);
  return auth.split(";")[0];
}

// ── Run ───────────────────────────────────────────────────────────────────

async function main() {
  const sleep = (n) => new Promise((r) => setTimeout(r, n));

  // Each server signs its own cookie, so authenticate against both.
  const cookies = { [LABEL_A]: await login(A, LABEL_A), [LABEL_B]: await login(B, LABEL_B) };

  console.log(`A = ${LABEL_A}  (${A})`);
  console.log(`B = ${LABEL_B}  (${B})`);
  console.log(`${N} trials each, interleaved, ${WARMUP} warmup per side (discarded)\n`);

  for (let i = 0; i < WARMUP; i++) {
    process.stdout.write(`warmup ${i + 1}/${WARMUP}\r`);
    await trial(A, i, cookies[LABEL_A]);
    await trial(B, i, cookies[LABEL_B]);
    await sleep(PAUSE_MS);
  }

  const results = { [LABEL_A]: [], [LABEL_B]: [] };
  const errors = { [LABEL_A]: [], [LABEL_B]: [] };
  const modes = {};

  for (let i = 0; i < N; i++) {
    // Alternate which side goes first so pair-internal ordering cannot bias
    // one branch systematically (the second call in a pair sees a warmer
    // upstream prompt cache).
    const order = i % 2 === 0 ? [[LABEL_A, A], [LABEL_B, B]] : [[LABEL_B, B], [LABEL_A, A]];

    for (const [label, url] of order) {
      const r = await trial(url, i, cookies[label]);
      if (r.error) errors[label].push(r.error);
      else {
        results[label].push(r);
        modes[label] = r.mode;
      }
      await sleep(PAUSE_MS);
    }
    process.stdout.write(`trial ${i + 1}/${N}\r`);
  }
  process.stdout.write(" ".repeat(24) + "\r");

  const pad = Math.max(LABEL_A.length, LABEL_B.length, 6);
  console.log(
    `${"branch".padEnd(pad)}  ${"mode".padEnd(5)}  ${"n".padStart(3)}  ` +
      `${"ttft med".padStart(9)}  ${"ttft p90".padStart(9)}  ${"total med".padStart(9)}  ${"chars med".padStart(9)}`
  );
  console.log("-".repeat(pad + 56));

  const medians = {};
  for (const label of [LABEL_A, LABEL_B]) {
    const rows = results[label];
    if (rows.length === 0) {
      console.log(`${label.padEnd(pad)}  ${"—".padEnd(5)}  ${"0".padStart(3)}  all trials failed`);
      continue;
    }
    const ttft = summarize(rows.map((r) => r.ttft));
    const total = summarize(rows.map((r) => r.ttTotal));
    const chars = summarize(rows.map((r) => r.chars));
    medians[label] = ttft.median;
    console.log(
      `${label.padEnd(pad)}  ${(modes[label] || "—").padEnd(5)}  ${String(ttft.n).padStart(3)}  ` +
        `${ms(ttft.median).padStart(9)}  ${ms(ttft.p90).padStart(9)}  ${ms(total.median).padStart(9)}  ` +
        `${String(chars.median).padStart(9)}`
    );
  }

  if (medians[LABEL_A] && medians[LABEL_B]) {
    const delta = medians[LABEL_B] - medians[LABEL_A];
    const faster = delta > 0 ? LABEL_A : LABEL_B;
    console.log(
      `\nmedian time-to-first-content: ${faster} is faster by ${ms(Math.abs(delta))} ` +
        `(${((Math.abs(delta) / Math.max(medians[LABEL_A], medians[LABEL_B])) * 100).toFixed(0)}%)`
    );
  }

  for (const label of [LABEL_A, LABEL_B]) {
    if (errors[label].length) {
      const counts = {};
      for (const e of errors[label]) counts[e] = (counts[e] || 0) + 1;
      console.log(`\n${label}: ${errors[label].length} failed trial(s)`);
      for (const [msg, count] of Object.entries(counts)) console.log(`  ${count}x ${msg}`);
    }
  }

  console.log(
    `\nNote: "chars med" is a sanity check — if the two branches differ a lot, ` +
      `they generated different amounts of text and the latency numbers are not comparable.`
  );
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
