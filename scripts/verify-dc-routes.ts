/**
 * Proof that every difficult-conversation authoring write path's publish gate
 * cannot be walked around.
 *
 * Run: npx tsx scripts/verify-dc-routes.ts
 *
 * Sections:
 *  1. Auth — all five routes unauthenticated → 401
 *  2. Create-then-practice (P15-SC2)
 *  3. Field errors — five bad fields → 400 with five entries
 *  4. First publish, passed
 *  5. First publish, rejected (still privately playable)
 *  6. First publish, unavailable (distinct from rejected)
 *  7. Publish-clean-then-edit hole
 *  8. Edit on a private record (check NOT called)
 *  9. Unpublish is never gated (throws ignored)
 * 10. Re-publish after unpublish re-screens
 * 11. 404 never permission-denied
 * 12. Seeded ids are not writable
 * 13. No private stance key on the list wire
 * 14. Live corpus verdicts through the real publish route
 *
 * dotenv MUST load before s3-client / route modules import.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { NextRequest } from "next/server";
import type { User } from "../lib/auth";
import type { PrePublishVerdict } from "../lib/difficult-conversation/prepublish-check";
import type { DifficultConversationRecord } from "../lib/difficult-conversation/types";
import {
  MUST_PASS,
  MUST_REJECT_ABUSE,
  MUST_REJECT_INJECTION,
  type DcCorpusFixture,
} from "./fixtures/dc-injection-corpus";

type Json = Record<string, unknown>;

let failures = 0;

function pass(section: string, detail: string) {
  console.log(`  ✓ ${section}: ${detail}`);
}

function fail(section: string, detail: string) {
  failures += 1;
  console.error(`  ✗ ${section}: ${detail}`);
}

function check(section: string, ok: boolean, detail: string) {
  if (ok) pass(section, detail);
  else fail(section, detail);
}

const USER_A: User = {
  id: "verify-dc-routes-user-a",
  email: "verify-a@example.com",
  name: "Verify A",
  role: "STUDENT",
};

const USER_B: User = {
  id: "verify-dc-routes-user-b",
  email: "verify-b@example.com",
  name: "Verify B",
  role: "STUDENT",
};

function setAuth(user: User | null) {
  globalThis.__DC_AUTH_USER__ = user;
}

function clearAuth() {
  globalThis.__DC_AUTH_USER__ = undefined;
}

function setCheck(
  fn:
    | ((record: DifficultConversationRecord) => Promise<PrePublishVerdict>)
    | undefined
) {
  globalThis.__DC_RUN_PREPUBLISH_CHECK__ = fn;
}

function clearCheck() {
  globalThis.__DC_RUN_PREPUBLISH_CHECK__ = undefined;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Performance conversation with Dana",
    avatarRole: "Direct report",
    studentRole: "Team lead",
    situation:
      "Dana has missed three deadlines this quarter and the rest of the team is covering. You need to address the pattern before the next sprint.",
    sharedBackstory:
      "Dana joined eighteen months ago with strong early reviews. Last quarter two projects slipped; you had an informal chat in March. The team still likes Dana personally.",
    hiddenPosition:
      "Dana believes the deadlines were unrealistic and that you never protected the team from scope creep. Their bottom line is refusing a PIP without written workload changes.",
    studentObjective:
      "Get a written commitment to an improvement plan with clear milestones.",
    stakes:
      "If this goes badly Dana may escalate to HR or quietly disengage from the team.",
    difficulty: "guarded",
    avatarId: "avatar-verify-dc-routes-1",
    voiceId: "voice-verify-dc-routes-1",
    ...overrides,
  };
}

function fixturePayload(f: DcCorpusFixture) {
  return validPayload({
    title: `Corpus ${f.name}`.slice(0, 80),
    avatarRole: f.avatarRole,
    studentRole: f.studentRole,
    situation: f.situation,
    sharedBackstory: f.sharedBackstory,
    hiddenPosition: f.hiddenPosition,
    studentObjective: f.studentObjective,
    stakes: f.stakes,
  });
}

function jsonRequest(
  url: string,
  method: string,
  body?: unknown
): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

async function readJson(
  res: Response
): Promise<{ status: number; body: Json }> {
  const body = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, body };
}

async function main() {
  const { POST: addPost } = await import(
    "../app/api/difficult-conversation/add/route"
  );
  const { POST: editPost } = await import(
    "../app/api/difficult-conversation/edit/route"
  );
  const { POST: deletePost } = await import(
    "../app/api/difficult-conversation/delete/route"
  );
  const { POST: publishPost } = await import(
    "../app/api/difficult-conversation/publish/route"
  );
  const { GET: listGet } = await import(
    "../app/api/difficult-conversation/list/route"
  );
  const {
    loadDifficultConversationForPlay,
    deleteDifficultConversation,
  } = await import("../lib/difficult-conversation/store");
  const { SEEDED_CONVERSATIONS } = await import(
    "../lib/difficult-conversation/seeded"
  );
  const { execSync } = await import("child_process");

  const createdIds: string[] = [];

  async function cleanup() {
    clearCheck();
    setAuth(USER_A);
    for (const id of createdIds) {
      try {
        await deleteDifficultConversation(id, USER_A.id);
      } catch {
        /* ignore */
      }
    }
    clearAuth();
  }

  try {
    // ------------------------------------------------------------------
    // 1. Auth
    // ------------------------------------------------------------------
    console.log("\n1. Auth");
    setAuth(null);
    clearCheck();
    {
      const routes: Array<[string, () => Promise<Response>]> = [
        [
          "add",
          () =>
            addPost(
              jsonRequest("/api/difficult-conversation/add", "POST", validPayload())
            ),
        ],
        [
          "edit",
          () =>
            editPost(
              jsonRequest("/api/difficult-conversation/edit", "POST", {
                id: "x",
                ...validPayload(),
              })
            ),
        ],
        [
          "delete",
          () =>
            deletePost(
              jsonRequest("/api/difficult-conversation/delete", "POST", {
                id: "x",
              })
            ),
        ],
        [
          "publish",
          () =>
            publishPost(
              jsonRequest("/api/difficult-conversation/publish", "POST", {
                id: "x",
                published: true,
              })
            ),
        ],
        [
          "list",
          () =>
            listGet(jsonRequest("/api/difficult-conversation/list", "GET")),
        ],
      ];
      for (const [name, call] of routes) {
        const { status } = await readJson(await call());
        check("1", status === 401, `${name} unauthenticated → ${status}`);
      }
    }

    // ------------------------------------------------------------------
    // 2. Create-then-practice
    // ------------------------------------------------------------------
    console.log("\n2. Create-then-practice");
    setAuth(USER_A);
    let practiceId = "";
    {
      const { status, body } = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload()
          )
        )
      );
      practiceId = typeof body.id === "string" ? body.id : "";
      if (practiceId) createdIds.push(practiceId);
      check(
        "2",
        status === 201 && practiceId.length > 0 && body.published === false,
        `add → ${status} id=${practiceId} published=${String(body.published)}`
      );
      const playable = await loadDifficultConversationForPlay(practiceId);
      check(
        "2",
        !!playable && playable.id === practiceId,
        "loadDifficultConversationForPlay resolves immediately"
      );
    }

    // ------------------------------------------------------------------
    // 3. Field errors
    // ------------------------------------------------------------------
    console.log("\n3. Field errors");
    {
      const { status, body } = await readJson(
        await addPost(
          jsonRequest("/api/difficult-conversation/add", "POST", {
            title: "ab",
            avatarRole: "",
            studentRole: "x",
            situation: "too short",
            sharedBackstory: "also too short",
            studentObjective: "ok objective here",
            stakes: "ok stakes!!",
            difficulty: "hostile",
          })
        )
      );
      const errors = Array.isArray(body.errors) ? body.errors : [];
      check(
        "3",
        status === 400 && errors.length >= 5,
        `400 with ${errors.length} errors (need ≥5)`
      );
    }

    // ------------------------------------------------------------------
    // 4. First publish, passed
    // ------------------------------------------------------------------
    console.log("\n4. First publish, passed");
    let pubId = "";
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Publish passed case" })
          )
        )
      );
      pubId = String(created.body.id || "");
      if (pubId) createdIds.push(pubId);

      setCheck(async () => ({ status: "passed" }));
      const { status, body } = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id: pubId,
            published: true,
          })
        )
      );
      const stored = await loadDifficultConversationForPlay(pubId);
      check(
        "4",
        status === 200 &&
          body.published === true &&
          stored?.published === true &&
          stored.lastCheck?.status === "passed",
        `publish passed → ${status}, stored.published=${String(stored?.published)} lastCheck=${stored?.lastCheck?.status}`
      );
    }

    // ------------------------------------------------------------------
    // 5. First publish, rejected
    // ------------------------------------------------------------------
    console.log("\n5. First publish, rejected");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Publish rejected case" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      setCheck(async () => ({
        status: "rejected",
        category: "injection",
        reason: 'Scenario text contains "ignore your rubric".',
        fix: "Remove instructions aimed at the scoring system.",
      }));
      const { status, body } = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: true,
          })
        )
      );
      const stored = await loadDifficultConversationForPlay(id);
      const stillPlayable = !!stored;
      check(
        "5",
        status === 422 &&
          body.blocked === "rejected" &&
          body.stillPlayable === true &&
          stored?.published === false &&
          !!stored?.lastCheck?.reason &&
          !!stored?.lastCheck?.fix &&
          stillPlayable,
        `rejected → ${status} blocked=${String(body.blocked)} playable=${stillPlayable}`
      );
    }

    // ------------------------------------------------------------------
    // 6. First publish, unavailable
    // ------------------------------------------------------------------
    console.log("\n6. First publish, unavailable");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Publish unavailable case" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      setCheck(async () => ({
        status: "unavailable",
        reason: "The publish check could not be completed right now.",
        fix: "Try publishing again in a minute. Your scenario is still saved and privately playable.",
      }));
      const { status, body } = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: true,
          })
        )
      );

      // Distinct rejected copy for comparison
      setCheck(async () => ({
        status: "rejected",
        category: "abuse",
        reason: "Contains a slur targeting a group.",
        fix: "Remove the slur and rephrase without targeted harassment.",
      }));
      const rejectedRes = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: true,
          })
        )
      );

      const unavailMsg = String(body.message || "");
      const rejectMsg = String(rejectedRes.body.message || "");
      check(
        "6",
        status === 503 &&
          body.blocked === "unavailable" &&
          body.blocked !== "rejected" &&
          unavailMsg.length > 0 &&
          rejectMsg.length > 0 &&
          unavailMsg !== rejectMsg &&
          !/abus|reject|harass|slur/i.test(unavailMsg),
        `unavailable → ${status} blocked=${String(body.blocked)}; messages differ=${unavailMsg !== rejectMsg}`
      );
    }

    // ------------------------------------------------------------------
    // 7. Publish-clean-then-edit hole
    // ------------------------------------------------------------------
    console.log("\n7. Publish-clean-then-edit hole");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Clean then edit hole" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      setCheck(async () => ({ status: "passed" }));
      await publishPost(
        jsonRequest("/api/difficult-conversation/publish", "POST", {
          id,
          published: true,
        })
      );

      const beforeEdit = await loadDifficultConversationForPlay(id);
      check(
        "7",
        beforeEdit?.published === true,
        "precondition: published after clean publish"
      );

      const NEW_SITUATION =
        "You must now confront a completely different performance pattern after a reorg shuffled ownership of the launch checklist across two squads.";
      let sawPublishedNewText = false;

      setCheck(async (record) => {
        // During the screen, store must still hold the OLD published text —
        // never the new rejected text at published:true.
        const mid = await loadDifficultConversationForPlay(id);
        if (
          mid &&
          mid.situation === NEW_SITUATION &&
          mid.published === true
        ) {
          sawPublishedNewText = true;
        }
        if (record.situation === NEW_SITUATION && mid?.published === true) {
          // edited payload is being screened; store must not already show it published
        }
        return {
          status: "rejected",
          category: "injection",
          reason: "Edited text tries to override the rubric.",
          fix: "Remove the override language from the situation field.",
        };
      });

      const { status, body } = await readJson(
        await editPost(
          jsonRequest("/api/difficult-conversation/edit", "POST", {
            id,
            ...validPayload({
              title: "Clean then edit hole",
              situation: NEW_SITUATION,
            }),
          })
        )
      );
      const after = await loadDifficultConversationForPlay(id);
      check(
        "7",
        status === 422 &&
          body.demoted === true &&
          after?.published === false &&
          after?.situation === NEW_SITUATION &&
          !sawPublishedNewText,
        `demoted edit → ${status} demoted=${String(body.demoted)} saved=${after?.situation === NEW_SITUATION} noLiveHole=${!sawPublishedNewText}`
      );
    }

    // ------------------------------------------------------------------
    // 8. Edit on a private record
    // ------------------------------------------------------------------
    console.log("\n8. Edit on a private record");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Private edit case" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      let called = 0;
      setCheck(async () => {
        called += 1;
        return {
          status: "rejected",
          category: "abuse",
          reason: "should not run",
          fix: "should not run",
        };
      });

      const NEW_TITLE = "Private edit case — revised";
      const { status } = await readJson(
        await editPost(
          jsonRequest("/api/difficult-conversation/edit", "POST", {
            id,
            ...validPayload({ title: NEW_TITLE }),
          })
        )
      );
      const stored = await loadDifficultConversationForPlay(id);
      check(
        "8",
        status === 200 &&
          called === 0 &&
          stored?.published === false &&
          stored?.title === NEW_TITLE,
        `private edit → ${status}, checkCalled=${called}, title saved`
      );
    }

    // ------------------------------------------------------------------
    // 9. Unpublish is never gated
    // ------------------------------------------------------------------
    console.log("\n9. Unpublish is never gated");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Unpublish ungated case" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      setCheck(async () => ({ status: "passed" }));
      await publishPost(
        jsonRequest("/api/difficult-conversation/publish", "POST", {
          id,
          published: true,
        })
      );

      setCheck(async () => {
        throw new Error("check must not run on unpublish");
      });
      const { status, body } = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: false,
          })
        )
      );
      const stored = await loadDifficultConversationForPlay(id);
      check(
        "9",
        status === 200 &&
          body.published === false &&
          stored?.published === false,
        `unpublish with throwing check → ${status} published=${String(stored?.published)}`
      );

      // ------------------------------------------------------------------
      // 10. Re-publish after unpublish re-screens
      // ------------------------------------------------------------------
      console.log("\n10. Re-publish after unpublish re-screens");
      setCheck(async () => ({
        status: "rejected",
        category: "injection",
        reason: "Re-publish still screened.",
        fix: "Remove the injection attempt.",
      }));
      const republish = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: true,
          })
        )
      );
      const afterRepub = await loadDifficultConversationForPlay(id);
      check(
        "10",
        republish.status === 422 && afterRepub?.published === false,
        `re-publish re-screens → ${republish.status} published=${String(afterRepub?.published)}`
      );
    }

    // ------------------------------------------------------------------
    // 11. 404 never permission-denied
    // ------------------------------------------------------------------
    console.log("\n11. 404 never permission-denied");
    {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            validPayload({ title: "Ownership 404 case" })
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);

      setAuth(USER_B);
      clearCheck();
      const cases: Array<[string, Promise<Response>]> = [
        [
          "edit other",
          editPost(
            jsonRequest("/api/difficult-conversation/edit", "POST", {
              id,
              ...validPayload(),
            })
          ),
        ],
        [
          "delete other",
          deletePost(
            jsonRequest("/api/difficult-conversation/delete", "POST", {
              id,
            })
          ),
        ],
        [
          "publish other",
          publishPost(
            jsonRequest("/api/difficult-conversation/publish", "POST", {
              id,
              published: true,
            })
          ),
        ],
        [
          "edit missing",
          editPost(
            jsonRequest("/api/difficult-conversation/edit", "POST", {
              id: "does-not-exist-dc-routes",
              ...validPayload(),
            })
          ),
        ],
        [
          "delete missing",
          deletePost(
            jsonRequest("/api/difficult-conversation/delete", "POST", {
              id: "does-not-exist-dc-routes",
            })
          ),
        ],
        [
          "publish missing",
          publishPost(
            jsonRequest("/api/difficult-conversation/publish", "POST", {
              id: "does-not-exist-dc-routes",
              published: true,
            })
          ),
        ],
      ];
      for (const [label, promise] of cases) {
        const { status } = await readJson(await promise);
        check("11", status === 404, `${label} → ${status}`);
      }

      const grep403 = execSync(
        'grep -r "403" app/api/difficult-conversation/ || true',
        { encoding: "utf8" }
      ).trim();
      check("11", grep403.length === 0, `repo grep 403 empty=${grep403.length === 0}`);
      setAuth(USER_A);
    }

    // ------------------------------------------------------------------
    // 12. Seeded ids are not writable
    // ------------------------------------------------------------------
    console.log("\n12. Seeded ids are not writable");
    {
      check(
        "12",
        SEEDED_CONVERSATIONS.length === 7,
        `seeded count=${SEEDED_CONVERSATIONS.length}`
      );
      for (const seeded of SEEDED_CONVERSATIONS) {
        for (const [label, promise] of [
          [
            "edit",
            editPost(
              jsonRequest("/api/difficult-conversation/edit", "POST", {
                id: seeded.id,
                ...validPayload(),
              })
            ),
          ],
          [
            "delete",
            deletePost(
              jsonRequest("/api/difficult-conversation/delete", "POST", {
                id: seeded.id,
              })
            ),
          ],
          [
            "publish",
            publishPost(
              jsonRequest("/api/difficult-conversation/publish", "POST", {
                id: seeded.id,
                published: false,
              })
            ),
          ],
        ] as Array<[string, Promise<Response>]>) {
          const { status } = await readJson(await promise);
          check(
            "12",
            status === 404,
            `${label} seeded ${seeded.id} → ${status}`
          );
        }
      }
    }

    // ------------------------------------------------------------------
    // 13. No private stance key on the list wire
    // ------------------------------------------------------------------
    console.log("\n13. No private stance on list wire");
    {
      const { status, body } = await readJson(
        await listGet(jsonRequest("/api/difficult-conversation/list", "GET"))
      );
      const serialized = JSON.stringify(body);
      check(
        "13",
        status === 200 &&
          Array.isArray(body.seeded) &&
          Array.isArray(body.mine) &&
          Array.isArray(body.fromOthers) &&
          !serialized.includes("hiddenPosition"),
        `list → ${status}; sections present; no hiddenPosition key`
      );
    }

    // ------------------------------------------------------------------
    // 14. Live corpus verdicts
    // ------------------------------------------------------------------
    console.log("\n14. Live corpus verdicts");
    clearCheck(); // real model
    const liveCases: Array<[string, DcCorpusFixture, number]> = [
      ["MUST_PASS", MUST_PASS[0]!, 200],
      ["MUST_REJECT_INJECTION", MUST_REJECT_INJECTION[0]!, 422],
      ["MUST_REJECT_ABUSE", MUST_REJECT_ABUSE[0]!, 422],
    ];
    for (const [label, fixture, expected] of liveCases) {
      const created = await readJson(
        await addPost(
          jsonRequest(
            "/api/difficult-conversation/add",
            "POST",
            fixturePayload(fixture)
          )
        )
      );
      const id = String(created.body.id || "");
      if (id) createdIds.push(id);
      const { status, body } = await readJson(
        await publishPost(
          jsonRequest("/api/difficult-conversation/publish", "POST", {
            id,
            published: true,
          })
        )
      );
      check(
        "14",
        status === expected,
        `${label} (${fixture.name}) → ${status} (want ${expected}) blocked=${String(body.blocked ?? "none")}`
      );
    }
  } finally {
    await cleanup();
  }

  console.log(
    failures === 0
      ? "\nALL SECTIONS PASSED"
      : `\nFAILED: ${failures} assertion(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
