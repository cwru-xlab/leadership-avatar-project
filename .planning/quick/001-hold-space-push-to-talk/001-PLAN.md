---
phase: quick-001-hold-space-push-to-talk
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/practice/push-to-talk-key.ts
  - components/practice/PracticeSessionShell.tsx
  - scripts/verify-hold-space-push-to-talk.ts
  - package.json
autonomous: true
requirements:
  - PTT-01   # hold-Space starts/stops recording via the existing recorder pair
  - PTT-02   # Space ignored in text entry and on Space-activated controls
  - PTT-03   # Phase 18 walk-out lock holds for Space (inherited, not duplicated)
  - PTT-04   # visible hint near the existing mic control
  - PTT-05   # listener + microphone cleanup on unmount / session end / blur
  - PTT-06   # one shell implementation, zero per-type wiring
  - PTT-07   # a tap-and-release faster than getMicrophone() cannot leave the mic open

must_haves:
  truths:
    - "Holding Space anywhere outside a text field or focusable control starts recording, and releasing Space stops it and submits the turn — identical to pressing the mic button twice."
    - "Holding Space does not restart recording on key repeat; one hold produces exactly one recording."
    - "Pressing Space while focus is in the answer textarea (or any input/contenteditable) types a space and does NOT start recording."
    - "Pressing Space while a button, link, summary disclosure, or any Space-activated role has focus activates that control and does NOT start recording."
    - "While the Phase 18 walk-out lock is engaged, Space is as inert as the disabled mic button."
    - "The learner can see that hold-Space exists without tabbing to the mic icon."
    - "Unmounting the shell, ending the session, or losing window focus mid-hold removes the key listeners and leaves no microphone recording."
    - "Tapping and releasing Space faster than getMicrophone() resolves leaves NO recorder running: the late-arriving start aborts because the key was already released."
    - "Every engine-backed interaction type (interview, case-study, all five deck modes, pitch-elevator, difficult-conversation, networking) gets hold-Space with no per-type prop or branch."
  artifacts:
    - path: "lib/practice/push-to-talk-key.ts"
      provides: "Pure, DOM-light predicate deciding whether a key event should drive push-to-talk"
      exports: ["SPACE_ACTIVATED_ROLES", "BLOCKING_TAG_NAMES", "KeyTargetDescriptor", "describeKeyTarget", "isPushToTalkBlockingTarget", "isPushToTalkKey", "shouldAbortPendingStart"]
      min_lines: 80
    - path: "components/practice/PracticeSessionShell.tsx"
      provides: "Single window-level keydown/keyup hold-to-talk wiring plus the visible hint"
      contains: "isPushToTalkBlockingTarget"
    - path: "scripts/verify-hold-space-push-to-talk.ts"
      provides: "Mechanical proof of the predicate's behaviour and of the shell's wiring/cleanup/lock reuse/pending-start abort"
      min_lines: 130
  key_links:
    - from: "components/practice/PracticeSessionShell.tsx"
      to: "lib/practice/push-to-talk-key.ts"
      via: "import of describeKeyTarget / isPushToTalkBlockingTarget / isPushToTalkKey"
      pattern: "from \"@/lib/practice/push-to-talk-key\""
    - from: "the window keydown handler"
      to: "startRecording"
      via: "startRecordingRef.current?.() — reuses the existing guarded recorder entry point"
      pattern: "startRecordingRef\\.current"
    - from: "the window keyup handler"
      to: "stopRecording"
      via: "stopRecordingRef.current?.()"
      pattern: "stopRecordingRef\\.current"
    - from: "Space path"
      to: "walkOutLockRef guard"
      via: "inherited from startRecording's existing guard — NOT re-implemented in the handler"
      pattern: "walkOutLockRef\\.current \\|\\|"
    - from: "the window keyup / releaseHold path"
      to: "startRecording's post-getMicrophone abort check"
      via: "cancelPendingStartRef, read through shouldAbortPendingStart"
      pattern: "cancelPendingStartRef\\.current"
---

<objective>
Add hold-Space push-to-talk to every avatar chat session, alongside the existing
mic button, implemented once in `components/practice/PracticeSessionShell.tsx`.

Purpose: students today must tab to the mic icon and press Enter to speak. A
held spacebar is the affordance they expect. Because every engine-backed
interaction type renders through this one shell, a single wiring covers
interview, case-study, all five pitch deck modes, pitch-elevator,
difficult-conversation and networking with no per-type work.

Output: a pure key-target predicate module, the shell wiring plus a visible
hint, and a `verify-*` script that proves the focus scoping, the walk-out
inertness and the cleanup rather than asserting them in prose.
</objective>

<execution_context>
@/Users/ajabreu79/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ajabreu79/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/practice/PracticeSessionShell.tsx
@scripts/verify-disengagement-walkout-shell.ts

Scouted facts — treat as given, do not re-derive:

- `startRecording` (~line 1126) already guards on
  `sending || isTranscribing || isPaused || walkOutLockRef.current ||
  recordingStartInFlightRef.current || mediaRecorderRef.current?.state === "recording"`,
  and re-checks `walkOutLockRef.current` after the async `getMicrophone()`
  resolves (~line 1140).
- Therefore routing Space through the existing `startRecording` / `stopRecording`
  pair inherits the Phase 18 walk-out lock, the paused state, the in-flight
  guard and the double-start guard **for free**. Reusing those two functions IS
  the requirement. Do NOT write a parallel gate and do NOT copy the condition.
- `stopRecording` (~line 1185) is a no-op unless the recorder is actually
  `"recording"`, so a stray keyup is harmless.
- `toggleRecording` (~line 1194) is the existing button callback; leave it alone.
- `walkOutLockRef.current = true` is set at ~line 824 when a walk-out fires.
- The mic `<Button>` renders at ~line 1575 inside a
  `<div className="mt-3 flex items-center justify-between gap-3">` row; the
  shell's muted hint style is `text-[11px] leading-4 text-[#82a5b8]`
  (see the resume note at ~line 1602).
- `sendMessageRef` (declared ~line 435) is the house pattern for exposing a
  `useCallback` to code that must not re-subscribe when the callback's deps
  change. Note precisely what that pattern IS: a bare assignment during render
  at line 905 — `sendMessageRef.current = sendMessage;` — with no `useEffect`
  wrapper. Follow that exact shape.
- The deck-picker disclosure Phase 19's keyboard UAT item 1 opens with Space is
  a native `<button type="button">` with `aria-expanded`/`aria-controls`
  (`app/practice/pitches/page.tsx` ~line 186; `19-08-SUMMARY.md` line 53). There
  is NO `<details>`/`<summary>` anywhere in `app/` or `components/` outside
  `app/test-pages/`. Any comment you write about disclosures must respect this.

Constraints:
- Do NOT run `npm run lint` (it is `eslint --fix` with no glob and reformats
  ~280 unrelated files). Use `npx eslint <path>`.
- Do not touch `lib/pitch/elevator-type.ts` or anything under `.planning/phases/`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract the Space-eligibility decision into a pure, testable module</name>
  <files>lib/practice/push-to-talk-key.ts</files>
  <action>
Create `lib/practice/push-to-talk-key.ts`. It must import nothing — no React,
no project modules — so a `tsx` script can exercise it directly. DOM types may
be referenced in type position only; no runtime access to `window`/`document`.

Export exactly:

1. `export const BLOCKING_TAG_NAMES` — a readonly string array of uppercase tag
   names where Space must be left alone:
   `["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY", "OPTION", "AUDIO", "VIDEO"]`.
   (`A` is included unconditionally — a focused link should not swallow its own
   keyboard semantics. `SUMMARY` is included defensively for native `<details>`
   disclosures; **there are none in use in `app/` or `components/` outside
   `app/test-pages/`**, so write no comment claiming otherwise. The live
   deck-picker disclosure that Phase 19's keyboard UAT item 1 opens with Space
   is a native `<button type="button">` with `aria-expanded`/`aria-controls`
   (`app/practice/pitches/page.tsx` ~line 186, per `19-08-SUMMARY.md` line 53) —
   it is already covered by `BUTTON`.)

2. `export const SPACE_ACTIVATED_ROLES` — a readonly string array of ARIA roles
   that Space activates or that imply text entry:
   `["button", "link", "checkbox", "radio", "switch", "tab", "menuitem",
   "menuitemcheckbox", "menuitemradio", "option", "combobox", "listbox",
   "textbox", "searchbox", "spinbutton", "slider"]`.
   Comment why: the deck picker's Start buttons and avatar cards are
   Space-activatable and Phase 19 just verified that, so any role in this list
   must keep its native Space behaviour.

3. `export type KeyTargetDescriptor = { tagName: string | null; role: string | null; isContentEditable: boolean }`.

4. `export function describeKeyTarget(target: unknown): KeyTargetDescriptor` —
   duck-typed on purpose so tests can pass stubs. Treat `target` as possibly
   exposing `tagName`, `isContentEditable`, `getAttribute(name)` and
   `closest(selector)`. Behaviour:
   - If `target` is null/not an object, return `{ tagName: null, role: null, isContentEditable: false }`.
   - If a `closest` function exists, resolve the nearest relevant ancestor with
     `closest("input, textarea, select, button, a, summary, option, audio, video, [role], [contenteditable]")`
     inside a try/catch (an unsupported selector must not throw into the handler);
     use that element if non-null, otherwise the original target.
   - Read `tagName` (uppercased, or null), `role` from `getAttribute("role")`
     (lowercased/trimmed, or null), and `isContentEditable` as
     `resolved.isContentEditable === true`. Native `isContentEditable` is true
     for descendants of a `contenteditable` region, which is why it is read off
     the resolved element rather than matching on the attribute alone.

5. `export function isPushToTalkBlockingTarget(descriptor: KeyTargetDescriptor): boolean`
   — true when `isContentEditable`, or `tagName` is in `BLOCKING_TAG_NAMES`, or
   `role` is in `SPACE_ACTIVATED_ROLES`. Pure; no DOM.

6. `export function isPushToTalkKey(key: string): boolean` — true for `" "`,
   `"Space"`, `"Spacebar"` (older Firefox/Edge) and nothing else.

7. `export type PendingStartFlags = { sending: boolean; isTranscribing: boolean; isPaused: boolean; walkOutLocked: boolean; startCancelled: boolean }`
   and `export function shouldAbortPendingStart(flags: PendingStartFlags): boolean`
   — true when ANY flag is true. This is the decision `startRecording` makes
   after its `await getMicrophone()` resolves, lifted out so the tap-and-release
   ordering can actually be tested (Task 3 Section 10). It encodes no policy of
   its own beyond "any reason to abort aborts"; `walkOutLocked` and
   `startCancelled` are passed in by the shell, never read here.

Add a short file-header comment stating the contract: this module decides only
*eligibility* (is this key, on this target, a push-to-talk key at all?) and the
*abort arithmetic* for an already-in-flight start. It owns no state and reads no
globals; whether recording may begin remains `startRecording`'s business — the
walk-out lock, paused and in-flight conditions live there and must not be
duplicated here. Any comment in this file must be literally true of the current
app; do not assert the existence of elements the app does not render.
  </action>
  <verify>
`npx tsc --noEmit -p tsconfig.json` reports no new errors, and
`npx eslint lib/practice/push-to-talk-key.ts` is clean.
`node -e "1"`-style sanity is not needed; Task 3's script exercises it.
  </verify>
  <done>
`lib/practice/push-to-talk-key.ts` exists, imports nothing, exports all six
symbols above, and `isPushToTalkBlockingTarget` is a pure function of a plain
object descriptor.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire one window-level hold-to-talk listener into the shell, plus the hint</name>
  <files>components/practice/PracticeSessionShell.tsx</files>
  <action>
Single implementation in the shell. No new props, no interaction-type branch —
if you reach for a per-type prop, stop.

1. Import from `@/lib/practice/push-to-talk-key`: `describeKeyTarget`,
   `isPushToTalkBlockingTarget`, `isPushToTalkKey`, `shouldAbortPendingStart`.

2. Add refs near the other recorder refs (~line 354):
   - `const startRecordingRef = useRef<(() => void) | null>(null);`
   - `const stopRecordingRef = useRef<(() => void) | null>(null);`
   - `const spaceHeldRef = useRef(false);`
   - `const cancelPendingStartRef = useRef(false);`

3. After `stopRecording` is declared (~line 1192), refresh the refs by **bare
   assignment during render** — this is the actual `sendMessageRef` pattern
   (`sendMessageRef.current = sendMessage;`, line 905), which uses no effect:
   ```
   startRecordingRef.current = startRecording;
   stopRecordingRef.current = stopRecording;
   ```
   Do NOT wrap these in a `useEffect`. A render-time assignment is current the
   instant the new callback identity exists; an effect-deferred one lags by a
   flush, and a key event landing in that window would call the previous
   closure. Matching the house pattern is also the point — "follow
   `sendMessageRef`" must be true of the code, not approximately true.

   The refs exist so the listener in step 4 can subscribe ONCE. Registering the
   listener with `[startRecording, stopRecording]` deps would re-subscribe every
   time `sending`/`isPaused` changes — i.e. mid-hold — and the matching keyup
   would land on a listener that no longer exists, leaving the microphone open.
   Say that in a comment.

4. Add the listener effect with an empty dependency array:
   - `handleKeyDown(event: KeyboardEvent)`: return early if
     `!isPushToTalkKey(event.key)`, or `event.repeat` (the key-repeat storm —
     one hold must mean one recording), or `event.metaKey || event.ctrlKey ||
     event.altKey`, or `isPushToTalkBlockingTarget(describeKeyTarget(event.target))`,
     or `spaceHeldRef.current`. Otherwise: `event.preventDefault()` (so the page
     does not also scroll), set `spaceHeldRef.current = true`, and call
     `void startRecordingRef.current?.()` (the ref now holds the async
     `startRecording` itself, so the `void` lives at the call site).
     Do NOT consult `walkOutLockRef`, `sending`, `isPaused` or
     `mediaRecorderRef` here. `startRecording` already owns every one of those
     gates, including the re-check after `getMicrophone()` resolves; duplicating
     them is how the two paths drift apart. Add that as a comment.
   - `handleKeyUp(event: KeyboardEvent)`: if `!isPushToTalkKey(event.key)`
     return; if `spaceHeldRef.current` then `event.preventDefault()` and call
     `releaseHold()` — one release path, so keyup and blur cannot diverge.
     Releasing Space must stop even if focus moved into a blocked element during
     the hold — the flag, not the current target, decides.
   - `releaseHold()`: if `spaceHeldRef.current`, clear it, set
     `cancelPendingStartRef.current = true` (see step 5), and call
     `stopRecordingRef.current?.()`. Register it for window `blur` and for
     `document` `visibilitychange` (when `document.hidden`). A hold interrupted
     by an alt-tab never delivers keyup; without this the microphone stays open,
     which is the worst failure mode here.
   - Attach `keydown`/`keyup` to `window`. Return a cleanup that
     `removeEventListener`s all four registrations and then calls
     `releaseHold()`, so unmount or session end mid-hold stops the recorder.

5. **Close the tap-and-release race** (a real stuck-microphone path, not a
   hypothetical). `startRecording` sets `recordingStartInFlightRef.current`
   synchronously and then `await getMicrophone()`. A tap released faster than
   that promise resolves makes keyup call `stopRecording` while
   `mediaRecorderRef.current` is still `null` — so it no-ops per its own
   `recorder?.state !== "recording"` guard. The promise then resolves,
   `startRecording` builds the recorder, calls `recorder.start()` and sets
   `setIsRecording(true)` — with `spaceHeldRef.current` already `false` and no
   second keyup ever coming. The microphone is open and no hold-Space path can
   close it. This race already exists for the button's `toggleRecording`
   (a double-click faster than permission resolution), so it is not a new class
   of bug — but a sub-latency key tap is far more natural than a sub-latency
   double-click, so hold-Space materially raises the odds of hitting it. Fix it;
   do not accept it.

   In `startRecording` (~line 1137-1142):
   - immediately after `recordingStartInFlightRef.current = true`, add
     `cancelPendingStartRef.current = false;` — each start owns a fresh flag, so
     a stale cancel from an earlier hold cannot kill a later start.
   - replace the existing post-await recheck
     `if (sending || isTranscribing || isPaused || walkOutLockRef.current) { return; }`
     with:
     ```
     if (
       shouldAbortPendingStart({
         sending,
         isTranscribing,
         isPaused,
         walkOutLocked: walkOutLockRef.current,
         startCancelled: cancelPendingStartRef.current,
       })
     ) {
       return;
     }
     ```
     It must stay ABOVE `new MediaRecorder(...)` so an aborted start never
     constructs or starts a recorder; the existing `finally` already clears the
     in-flight flag. The walk-out condition is preserved verbatim as
     `walkOutLocked: walkOutLockRef.current` — this refactor must not weaken
     Phase 18's gate, and verification step 4 re-runs
     `verify-disengagement-walkout-shell.ts` to prove it did not.
   - the keydown handler still must not mention `walkOutLockRef`,
     `cancelPendingStartRef` or `mediaRecorderRef`: only the release path sets
     the cancel flag, and only `startRecording` reads it.

6. Visible hint (requirement: discoverable without tabbing to the icon). In the
   `mt-3 flex items-center justify-between gap-3` row that holds the mic and
   Pause buttons, wrap the mic `<Button>` in a
   `<div className="flex items-center gap-2">` and add beside it:
   ```
   <span className="hidden text-[11px] leading-4 text-[#82a5b8] sm:inline">
     or hold <kbd className="rounded border border-white/20 bg-white/5 px-1 py-0.5 font-sans text-[10px] text-[#d7eaf3]">Space</kbd> to talk
   </span>
   ```
   Keep the existing muted `text-[11px] leading-4 text-[#82a5b8]` language. Do
   not render it when `walkOutLock` is true or `!avatarReady` — the affordance
   is inert then and advertising it would be a lie.

7. Also extend the textarea placeholder to mention the shortcut only if it stays
   short; otherwise leave it. The `<span>` is the required surface.
  </action>
  <verify>
`npx tsc --noEmit -p tsconfig.json` clean, `npx eslint components/practice/PracticeSessionShell.tsx` clean,
`npx tsx scripts/verify-disengagement-walkout-shell.ts` still prints `ALL PASS`
(the existing walk-out regexes must not have been disturbed), and
`grep -c "walkOutLockRef" components/practice/PracticeSessionShell.tsx` shows no
new occurrence inside the new handlers.
  </verify>
  <done>
Hold-Space starts recording through `startRecording` and release stops it
through `stopRecording`; the refs are refreshed by bare render assignment with
no `useEffect`; the listener is registered once with `[]` deps; cleanup removes
keydown/keyup/blur/visibilitychange and releases any in-progress hold; a release
landing before `getMicrophone()` resolves aborts the pending start via
`cancelPendingStartRef` read through `shouldAbortPendingStart`, above
`new MediaRecorder`; the hint renders next to the mic button; no per-type prop
or branch was added.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mechanical verification script for scoping, lock inertness and cleanup</name>
  <files>scripts/verify-hold-space-push-to-talk.ts</files>
  <action>
Create `scripts/verify-hold-space-push-to-talk.ts` in the house style of
`scripts/verify-disengagement-walkout-shell.ts`: a local `check(condition, description)`
that prints `PASS`/`FAIL`, a `failures` counter, `process.exit(1)` on any
failure, final `ALL PASS`. Read source with `readFileSync` relative to
`import.meta.dirname`. Behaviour sections import the real module —
`import { ... } from "../lib/practice/push-to-talk-key"` — and assert against
it; do not mock it.

Section 1 — key recognition (behavioural):
`isPushToTalkKey(" ")`, `("Space")`, `("Spacebar")` true; `("Enter")`,
`("a")`, `("Tab")`, `("")` false.

Section 2 — Space in text entry does NOT start recording (behavioural). Assert
`isPushToTalkBlockingTarget` is true for descriptors
`{tagName:"INPUT"}`, `{tagName:"TEXTAREA"}`, `{tagName:"SELECT"}`,
`{tagName:null, role:"textbox"}`, `{tagName:"DIV", isContentEditable:true}`.

Section 3 — Space on a focused control does NOT start recording (behavioural).
True for `{tagName:"BUTTON"}`, `{tagName:"A"}`, `{tagName:"SUMMARY"}`, and for
every role in `SPACE_ACTIVATED_ROLES` iterated programmatically with
`{tagName:"DIV", role}` — so adding a role to the list can never silently go
untested. Explicitly include `role:"button"` with a comment naming what it
protects: the Phase 19 deck-picker Start buttons and avatar cards, and the
deck-picker disclosure — which is a native `<button type="button">`
(`app/practice/pitches/page.tsx`), covered by `BUTTON`, NOT a `<details>`
element. Do not write a comment implying this app renders `<summary>`; it does
not outside `app/test-pages/`. `{tagName:"SUMMARY"}` is asserted purely as
defensive coverage for a future native disclosure.

Section 4 — Space elsewhere DOES start recording (behavioural). False for
`{tagName:"DIV", role:null, isContentEditable:false}`, `{tagName:"MAIN"}`,
`{tagName:"SECTION"}`, `{tagName:null, role:null, isContentEditable:false}`,
and `{tagName:"DIV", role:"presentation"}`.

Section 5 — `describeKeyTarget` resolves ancestors (behavioural, stub DOM). Build
plain-object stubs shaped `{ tagName, isContentEditable, getAttribute(name), closest(selector) }`
cast through `as unknown`. Prove:
  - a stub whose `closest` returns a `{tagName:"BUTTON"}` ancestor yields a
    blocking descriptor even though the event target itself is a `SPAN`;
  - a stub nested inside a contenteditable (`isContentEditable: true` on the
    resolved element) yields a blocking descriptor;
  - a stub with no `closest` method at all does not throw and is described from
    its own fields;
  - a stub whose `closest` throws is caught and falls back to the raw target
    (call it and assert no exception escapes).

Section 6 — shell wiring (source assertions against
`components/practice/PracticeSessionShell.tsx`):
  - imports `isPushToTalkBlockingTarget` and `describeKeyTarget` from
    `@/lib/practice/push-to-talk-key`;
  - the handler guards on `event.repeat`;
  - the handler calls `event.preventDefault()`;
  - Space starts via `startRecordingRef.current` and stops via
    `stopRecordingRef.current` — i.e. it reuses the guarded recorder pair;
  - `startRecording` still carries its own `walkOutLockRef.current ||`
    pre-guard, AND the region between `await getMicrophone()` and the
    `new MediaRecorder` construction still mentions `walkOutLockRef.current`.
    Anchor the second assertion by slicing the source between those two
    landmarks rather than regexing the old inline `if` — step 5 of Task 2
    rewrites that condition into `shouldAbortPendingStart({...})`, and a
    brittle literal regex would have to be loosened later, which is how a real
    guard check quietly becomes a no-op. Together these two are the walk-out
    inertness proof: Space is inert because the only entry point it has is
    inert.
  - that same post-`getMicrophone()` slice also mentions
    `startCancelled: cancelPendingStartRef.current`, and the slice is non-empty
    (a zero-length slice would make every `includes` assertion vacuously
    false-positive if the landmarks ever move — assert `slice.length > 0`
    explicitly);
  - **negative:** the extracted keydown handler body does NOT mention
    `walkOutLockRef`. Implement by slicing the source between the
    `handleKeyDown` declaration and the matching `handleKeyUp` declaration and
    asserting `!slice.includes("walkOutLockRef")`,
    `!slice.includes("mediaRecorderRef")` and
    `!slice.includes("cancelPendingStartRef")` — a duplicated gate fails the
    script. Assert this keydown slice is non-empty too, for the same reason.

Section 7 — cleanup (source assertions): the effect's returned cleanup
`removeEventListener`s `"keydown"`, `"keyup"`, `"blur"` and
`"visibilitychange"`, and the cleanup calls the hold-release path
(`releaseHold`) so a mid-hold unmount cannot leave the recorder running. Also
assert the listener effect's dependency array is empty (`}, []);` immediately
following the cleanup return) so it cannot re-subscribe mid-hold.

Section 8 — no per-type wiring (source assertions): the shell contains no
interaction-type comparison introduced for this feature. Assert the shell
contains exactly one `isPushToTalkKey(` import-site usage region by checking
`(shell.match(/isPushToTalkBlockingTarget/g) ?? []).length <= 2` (import +
single call), and assert the hint string `to talk` appears exactly once.

Section 9 — hint presence: the shell contains `hold` and a `<kbd` with `Space`
within the mic control row, and the hint is gated on `avatarReady` /
`walkOutLock`.

Section 10 — tap-and-release ordering (behavioural + source). This is the
stuck-open-microphone path, so it gets its own section; an untested mitigation
is worth little in a codebase whose guards have historically never been
observed failing.
  - Behavioural, against the real `shouldAbortPendingStart`: with every flag
    false it returns `false` (a normal hold proceeds to build the recorder);
    with ONLY `startCancelled: true` it returns `true` — that is literally the
    tap-and-release race, keyup landing before `getMicrophone()` resolved, and
    it must abort the late start. Then iterate the four other flags
    (`sending`, `isTranscribing`, `isPaused`, `walkOutLocked`), setting each
    alone true and asserting `true`, so the refactor cannot have dropped a
    condition the old inline `if` enforced.
  - Source, proving the flag is actually threaded — the predicate being correct
    is useless if nothing sets or reads it:
    - `startRecording` clears the flag on entry
      (`cancelPendingStartRef.current = false`) AFTER claiming
      `recordingStartInFlightRef.current = true`, so a stale cancel cannot kill
      a later start. Assert by index: the `= false` assignment appears after
      the in-flight claim and before `await getMicrophone()`.
    - the release path SETS it: the slice from `releaseHold` to the end of its
      body contains `cancelPendingStartRef.current = true`.
    - the abort happens BEFORE any recorder exists: assert
      `indexOf("shouldAbortPendingStart") < indexOf("new MediaRecorder")`, so
      an aborted start can never have called `recorder.start()`.
  - State plainly in the script's comments that this proves the ordering
    *decision* and its wiring, not a live promise interleaving — a real
    interleaving test needs a DOM/recorder harness this project does not have.
    That residual belongs in the summary, not in a passing assertion.

Finally add `"verify:hold-space": "tsx scripts/verify-hold-space-push-to-talk.ts"`
to `package.json` scripts, next to the existing `verify:sso-handoff` entry.
  </action>
  <verify>
`npx tsx scripts/verify-hold-space-push-to-talk.ts` prints `ALL PASS` and exits 0.
Then perform TWO recorded NEGATIVE tests, reverting fully after each and
confirming `ALL PASS` returns:
  (a) duplicated gate — temporarily insert `if (walkOutLockRef.current) return;`
      into the new `handleKeyDown`; the script must FAIL (exit 1) on the
      keydown-slice check.
  (b) unthreaded cancel flag — temporarily delete the
      `startCancelled: cancelPendingStartRef.current` line from
      `shouldAbortPendingStart`'s call in `startRecording`; the script must FAIL
      (exit 1) on the Section 10 wiring check. This is the one that matters: it
      proves Section 10 would actually notice the stuck-microphone mitigation
      going missing, rather than passing on the predicate's own arithmetic.
Record all outputs (both failures and both recoveries) in the summary.
`npx eslint scripts/verify-hold-space-push-to-talk.ts` clean.
  </verify>
  <done>
The script exists, exercises the real predicate module (not a mock), proves all
six required behaviours — Space in text input inert, Space on a focused button
inert, Space elsewhere live, Space inert under the walk-out lock by inherited
guard, a tap released before `getMicrophone()` resolves leaving no recorder
running, listeners removed on unmount — exits 0, and BOTH negative tests are
demonstrated to bite. `npm run verify:hold-space` works.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` — no new errors.
2. `npx eslint lib/practice/push-to-talk-key.ts components/practice/PracticeSessionShell.tsx scripts/verify-hold-space-push-to-talk.ts` — clean. (Never `npm run lint`.)
3. `npx tsx scripts/verify-hold-space-push-to-talk.ts` — `ALL PASS`, exit 0.
4. `npx tsx scripts/verify-disengagement-walkout-shell.ts` — still `ALL PASS`; Phase 18's shell guarantees unchanged.
5. `grep -rn "push-to-talk-key" app components lib | grep -v "lib/practice/push-to-talk-key.ts"` — exactly one consumer: the shell. This is a proxy, not airtight: it proves nothing *imports* the module twice, but it cannot prove some page has not independently reimplemented raw `keydown` / `" "` wiring of its own. Task 2's action and done criteria carry the zero-per-type-prop requirement; do not describe this grep as conclusive in the summary. Optionally strengthen with `grep -rn '\"keydown\"' app components | grep -v PracticeSessionShell` and eyeball that nothing new handles Space.
6. Residual manual check (not mechanizable without a DOM harness, state it in the summary rather than claiming it): in one live session, hold Space to speak, release to send; press Space in the answer box and confirm a space is typed; Tab to the deck-picker disclosure and confirm Space still opens it.
</verification>

<success_criteria>
- Hold-Space starts recording and release stops/sends it, in every engine-backed
  interaction type, from one shell implementation with zero per-type props.
- Key repeat cannot restart a recording during a single hold.
- Space is ignored in inputs, textareas, contenteditable regions, and on
  buttons/links/summary/Space-activated roles; Phase 19's keyboard UAT item 1
  (Space opens the deck picker disclosure) still holds.
- Space inherits the Phase 18 walk-out lock through `startRecording` and the
  verification script fails if that gate is ever duplicated in the handler.
- `preventDefault()` runs on handled Space keydown, so the page does not scroll.
- Listeners are removed and any in-progress hold is released on unmount, session
  end, window blur and tab hide; no path leaves the microphone open.
- A tap released before `getMicrophone()` resolves aborts the pending start, and
  that ordering is covered by its own test section rather than asserted in prose.
- The ref refresh is a bare render assignment, matching `sendMessageRef` exactly.
- A visible `or hold Space to talk` hint sits beside the existing mic button in
  the shell's existing muted visual language.
- `scripts/verify-hold-space-push-to-talk.ts` exits 0 and its negative test is
  demonstrated.
</success_criteria>

<output>
After completion, create
`.planning/quick/001-hold-space-push-to-talk/001-SUMMARY.md` recording: the
exported predicate contract, the ref-indirection rationale (why `[]` deps on the
listener effect but a bare render assignment for the refs), the tap-and-release
race and exactly what the Section 10 tests do and do not prove, both
negative-test outputs, and the residual checks left undischarged (the live
three-part browser check, and the fact that verification step 5 is a proxy
rather than a conclusive no-per-type-wiring proof).
</output>
