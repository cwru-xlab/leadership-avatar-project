/**
 * The curated slice of HeyGen's public LiveAvatar catalog this app offers.
 *
 * WHY AN ALLOWLIST. `GET /v1/avatars/public` returns ~293 records, but they are
 * only ~50 distinct people: most appear as the same person in up to seven
 * emotional variants (`Adam (Curious)`, `Adam (Sad)`, ...) or several wardrobe
 * and pose variants (`Amina Sitting`, `Amina in Black Suit`, ...). Offering all
 * of them would make the picker unusable, so this list keeps exactly ONE look
 * per person.
 *
 * WHY THESE LOOKS. Every entry is a SEATED framing, because the avatar is
 * playing an interviewer or a conversation partner across a table — a standing
 * full-body shot reads as a presentation, not a conversation. Note the
 * selection is by how the shot is FRAMED, not by the word "Sitting": only 13
 * people have a `Sitting` variant, while the `(Friendly)` emotion variants are
 * themselves seated (`Adam (Friendly)` is at an office table, hands folded).
 *
 * THREE DELIBERATE OVERRIDES. A literal name match lands on a clinician for
 * three people, which is wrong for interview and workplace scenarios, so they
 * are pinned to their professional look instead: Judy -> `Judy HR`,
 * Ann -> `Ann Therapist`, Dexter -> `Dexter Lawyer`. `Santa Fireplace Front`
 * is excluded outright.
 *
 * CHURN. `lib/difficult-conversation/avatar-assignment.ts` warns that hardcoding
 * catalog ids breaks silently when the account churns. That warning is honoured
 * here by treating this list as a FILTER, never as a source of truth: ids that
 * vanish upstream simply stop matching and drop out of the picker, and
 * `app/api/interview/interviewers/route.ts` logs the names it could not find so
 * the churn is visible rather than silent.
 *
 * Regenerate by listing `/v1/avatars/public`, grouping by the first name token,
 * and taking the seated look per person.
 */

/** One seated look per public-catalog person, keyed by LiveAvatar avatar id. */
export const SEATED_PUBLIC_AVATAR_IDS: Readonly<Record<string, string>> = {
  "201f54fe-71a9-449d-b558-26c36badd868": "Adam (Friendly)",
  "998e5637-cfca-4700-891e-8a40ce33f562": "Alessandra Sitting",
  "93a7ec78-06df-481e-8cd2-26eb7259487a": "Alex (Friendly)",
  "40b4f000-f783-4bba-a327-ea58b1a6fdf2": "Amina Sitting",
  "3f291b22-0267-4fb6-a25b-847fb63604b0": "Anastasia Sitting",
  "af93e3b6-e07d-4246-8219-ad7f0fd2e6ed": "Andrew (Friendly)",
  "513fd1b7-7ef9-466d-9af2-344e51eeb833": "Ann Therapist",
  "a96238c3-21e9-4eca-b4ca-3e411e4e5b6d": "Anna (Friendly)",
  "91342979-4c4c-44f1-bd3b-1c846d20341e": "Anthony Sitting",
  "64b526e4-741c-43b6-a918-4e40f3261c7a": "Bryan Tech Expert",
  "774d728a-513d-4d3e-a567-2403a37d061d": "Chloe (Friendly)",
  "24211c5e-1374-45de-a625-89b992e9c002": "Claire (Friendly)",
  "cef6194c-b58d-41dc-8410-c39e344b0313": "Daniel (Friendly)",
  "dff45d08-bc9d-4527-bb54-1781aef8553b": "David (Friendly)",
  "0930fd59-c8ad-434d-ad53-b391a1768720": "Dexter Lawyer",
  "8175dfc2-7858-49d6-b5fa-0c135d1c4bad": "Elenora Tech Expert",
  "5bc90b6e-3fd0-4c33-8e55-22a4a9199016": "Ella (Friendly)",
  "e1cfad6b-da74-47b8-a477-09261d3e3cc2": "Emily (Friendly)",
  "10ba14ab-3911-4b89-8dfd-86b5ba25876f": "Emma (Friendly)",
  "9fb8467b-dce6-4fc5-9b52-d9417c88164a": "Ethan (Friendly)",
  "8ac65921-0579-4116-abe3-fb46aafcf567": "Grace (Friendly)",
  "e9844e6d-847e-4964-a92b-7ecd066f69df": "Graham Sitting",
  "1d91e311-781e-42ab-bcbf-07801119a67b": "Hannah (Friendly)",
  "0cbed480-e2e3-453e-a85d-3cd69b97e2b2": "Helen (Friendly)",
  "69a246bd-1739-418d-b533-9fc578208175": "James (Friendly)",
  "cd1d101c-9273-431b-8069-63beef736bec": "Judy HR",
  "52a7e1ec-fc58-4624-814b-b56cc231e5bb": "Julia (Friendly)",
  "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0": "June HR",
  "073b60a9-89a8-45aa-8902-c358f64d2852": "Katya Sitting",
  "eb961787-3605-49e9-b703-3402c12ccdb4": "Lily (Friendly)",
  "4857d1c6-a3b0-4d0a-b363-48cb9a62e496": "Lucy (Friendly)",
  "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb": "Marianne Sitting",
  "9bbf0dbc-d1d4-491b-a4af-549b3715c230": "Matthew (Friendly)",
  "e2336732-dc9b-4c90-8a91-3d80f4b8dd13": "Maya (Friendly)",
  "f27584a5-14df-4d01-83e9-8cedc148a6a4": "Michael (Friendly)",
  "74f992e3-45e6-4fe4-a0b9-e93faca8d4ff": "Natalie (Friendly)",
  "dc6a2ade-fcad-48b4-89ce-8ae807b18c32": "Olivia (Friendly)",
  "7a517e8e-b41f-49e7-b6b3-2cdfb4bbff1e": "Pedro Sitting",
  "3bda0e5e-382f-4c29-b7b0-2b53e223b179": "Rachel (Friendly)",
  "5dd4d830-957a-419f-9334-0dc4399ada5d": "Rika Sitting",
  "33333980-c9d5-40c1-a7cf-d323de265609": "Ryan (Friendly)",
  "38855049-499b-4ff5-a5c0-befc6561d3da": "Sarah (Friendly)",
  "7b888024-f8c9-4205-95e1-78ce01497bda": "Shawn Therapist",
  "9650a758-1085-4d49-8bf3-f347565ec229": "Silas HR",
  "59bd47d1-3053-4e3d-903f-4108eb302d9a": "Sophia (Friendly)",
  "d1b25f7e-ef00-455b-af2f-62c84254924a": "Thaddeus Sitting",
  "6c2017bc-1eef-4071-ba70-0e9d5bcbf00f": "Thomas (Friendly)",
  "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a": "Wayne",
  "a4991f42-d211-4581-9631-639f7fe7c635": "William (Friendly)",
};

/** Membership test for the public-catalog filter. */
export const SEATED_PUBLIC_AVATAR_ID_SET: ReadonlySet<string> = new Set(
  Object.keys(SEATED_PUBLIC_AVATAR_IDS),
);
