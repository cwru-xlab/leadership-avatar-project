"use client";

/**
 * Create a private difficult conversation. Middleware gates /conversations
 * under STUDENT_ROUTES. Save never auto-publishes — the builder offers
 * Practise it now and Publish it as separate next steps (P15-SC2).
 *
 * Authored records are structurally identical to seeded ones: the same six
 * content fields plus title, student role, default difficulty, and avatar.
 * The character's private stance is collected here and shown only to the
 * owner in this builder — never on catalog cards or in briefing.
 */

import BackLink from "@/components/shell/BackLink";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft } from "lucide-react";
import ConversationBuilder from "@/components/difficult-conversation/ConversationBuilder";

export default function NewConversationPage() {
  const router = useRouter();

  return (
    <div className="space-y-8 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <BackLink href="/conversations" label="Courageous conversations" />
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">Write your own</h1>
        <p className="max-w-[58ch] text-[15px] text-muted">
          Same fields as the featured conversations — situation, shared facts,
          the character&apos;s private stance, your goal, and the stakes. Save
          privately, then practise or publish when you are ready.
        </p>
        <ul className="max-w-[58ch] text-sm text-muted list-disc pl-5 space-y-1">
          <li>Saving keeps it private so you can practise immediately.</li>
          <li>Publishing is a separate step and runs an automated safety check.</li>
          <li>You stay the owner — you can edit or unpublish at any time.</li>
          <li>
            A blocked publish names the problem and the fix; the scenario stays
            playable by you alone until it passes.
          </li>
        </ul>
      </div>

      <ConversationBuilder mode="create" />

      <p className="max-w-[58ch] text-xs text-muted">
        Tip: write the character&apos;s private stance as their real excuse or
        bottom line — that is what makes the practice hard, and players never
        see it before or during the session.
      </p>
    </div>
  );
}
