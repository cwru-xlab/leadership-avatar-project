import { heygenJsonError } from "@/lib/heygen-server";
import { loadInterviewerCatalog } from "@/lib/interview/avatar-catalog";

export type { InterviewerOption } from "@/lib/interview/avatar-catalog";

/**
 * Lists the interviewer profiles available to this LiveAvatar account. The
 * merge, liveness filter and cache live in `lib/interview/avatar-catalog.ts`.
 */
export async function GET() {
  const result = await loadInterviewerCatalog();
  if (!result.ok) {
    return heygenJsonError(result.code, result.message, result.status);
  }
  return new Response(JSON.stringify({ interviewers: result.interviewers }), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=600",
      "Content-Type": "application/json",
    },
  });
}
