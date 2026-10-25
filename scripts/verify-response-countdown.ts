import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const shell = readFileSync(
  resolve(root, "components/practice/PracticeSessionShell.tsx"),
  "utf8",
);

let failures = 0;

function check(condition: unknown, description: string) {
  if (condition) {
    console.log(`PASS ${description}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${description}`);
}

console.log("\n1. Waiting state and elapsed indicator");
check(
  /const \[isAwaitingResponse, setIsAwaitingResponse\] = useState\(false\)/.test(shell),
  "the shared shell owns response-waiting state",
);
check(
  /const \[responseWaitSeconds, setResponseWaitSeconds\] = useState\(0\)/.test(shell),
  "the shared shell owns elapsed wait state",
);
check(
  /Waiting for a response/.test(shell) &&
    /aria-hidden="true">· \{formatElapsed\(responseWaitSeconds\)\}/.test(shell),
  "the indicator shows elapsed wait time without an ETA",
);
check(
  /role="status"[\s\S]{0,320}<span>Waiting for a response<\/span>[\s\S]{0,320}aria-hidden="true">· \{formatElapsed\(responseWaitSeconds\)\}/.test(shell),
  "the status announces the stable message once while hiding the ticking counter",
);

console.log("\n2. Stream lifecycle wiring");
const submissionIndex = shell.indexOf('setSending(true);');
const waitStartIndex = shell.indexOf('setIsAwaitingResponse(true);', submissionIndex);
const fetchIndex = shell.indexOf('await fetch("/api/interaction/chat"', waitStartIndex);
check(
  submissionIndex >= 0 && waitStartIndex > submissionIndex && fetchIndex > waitStartIndex,
  "waiting begins after submission and before the chat request",
);
const contentFrameIndex = shell.indexOf('event.type === "content" && event.delta');
const contentFrameEnd = shell.indexOf('else if (event.type === "end"', contentFrameIndex);
const contentFrame =
  contentFrameIndex >= 0 && contentFrameEnd > contentFrameIndex
    ? shell.slice(contentFrameIndex, contentFrameEnd)
    : "";
check(
  contentFrameIndex >= 0 &&
    contentFrameEnd > contentFrameIndex &&
    !contentFrame.includes('setIsAwaitingResponse(false);'),
  "transport-only content frames do not hide the indicator before a response renders",
);
const responseAppendIndex = shell.indexOf(
  'appendMessage({ role: "assistant", content: parsedTurn.cleanedText });',
);
const responseRenderClearIndex = shell.indexOf(
  'setIsAwaitingResponse(false);',
  responseAppendIndex,
);
check(
  responseAppendIndex >= 0 &&
    responseRenderClearIndex > responseAppendIndex &&
    responseRenderClearIndex - responseAppendIndex < 500,
  "the rendered assistant response clears waiting at the visible handoff",
);
const finallyIndex = shell.indexOf('} finally {', responseRenderClearIndex);
const completionClearIndex = shell.indexOf('setIsAwaitingResponse(false);', finallyIndex);
check(
  finallyIndex >= 0 && completionClearIndex > finallyIndex,
  "the completion and error finally path clears waiting",
);

console.log("\n3. Timer cleanup");
const waitConditionIndex = shell.indexOf('if (!isAwaitingResponse)');
const waitEffectIndex = shell.lastIndexOf('useEffect(() => {', waitConditionIndex);
const waitEffectEnd = shell.indexOf('}, [isAwaitingResponse]);', waitConditionIndex);
const waitEffect =
  waitEffectIndex >= 0 && waitEffectEnd > waitEffectIndex
    ? shell.slice(waitEffectIndex, waitEffectEnd)
    : "";
check(
  waitEffect.includes('window.setInterval') &&
    waitEffect.includes('return () => window.clearInterval(interval)'),
  "the elapsed timer has an effect cleanup for state exit and unmount",
);

if (failures > 0) {
  console.error(`\n${failures} response-countdown check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
