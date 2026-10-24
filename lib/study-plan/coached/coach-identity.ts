/**
 * Coach identity (REQ-113, 22-CONTEXT.md "Coach identity").
 *
 * Every student has a coach even if they never open Settings: when the three
 * `User.coach*` columns are not all set, the default coach is used.
 *
 * DEFAULT_COACH choice (Claude's discretion per 22-CONTEXT.md): "Ann", the
 * seated public-catalog look `Ann Therapist` from `lib/avatar-roster.ts`,
 * paired with HER OWN catalog default voice. LiveAvatar rejects avatar/voice
 * pairs it has not validated (see the comment in
 * `app/api/interview/interviewers/route.ts`), so the voice id below was read
 * from `/v1/avatars/public` -> Ann Therapist -> `default_voice` ("Ann - IA")
 * on 2026-10-23 and pinned, rather than guessed.
 *
 * CHURN WARNING (from `lib/avatar-roster.ts`): hardcoding catalog ids breaks
 * silently when the account churns. If Ann Therapist vanishes upstream the
 * default coach stops starting; re-resolve the pair from the catalog.
 */
import { prisma } from "../../prisma";

export interface CoachIdentity {
  name: string;
  avatarId: string;
  voiceId: string;
  isDefault: boolean;
}

export const DEFAULT_COACH: Readonly<Omit<CoachIdentity, "isDefault">> = {
  name: "Ann",
  avatarId: "513fd1b7-7ef9-466d-9af2-344e51eeb833", // Ann Therapist
  voiceId: "de5574fc-009e-4a01-a881-9919ef8f5a0c", // Ann's own default voice ("Ann - IA")
};

export async function resolveCoachForUser(
  userId: string,
): Promise<CoachIdentity> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { coachAvatarId: true, coachVoiceId: true, coachName: true },
  });

  if (user?.coachAvatarId && user.coachVoiceId && user.coachName) {
    return {
      name: user.coachName,
      avatarId: user.coachAvatarId,
      voiceId: user.coachVoiceId,
      isDefault: false,
    };
  }

  return { ...DEFAULT_COACH, isDefault: true };
}
