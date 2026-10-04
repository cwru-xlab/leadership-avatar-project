"use client";

/**
 * Create a private difficult conversation. Middleware gates /conversations
 * under STUDENT_ROUTES. Save never auto-publishes — the builder offers
 * Practise it now and Publish it as separate next steps (P15-SC2).
 */

import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft } from "lucide-react";
import { title } from "@/components/primitives";
import ConversationBuilder from "@/components/difficult-conversation/ConversationBuilder";

export default function NewConversationPage() {
  const router = useRouter();

  return (
    <div className="space-y-8 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <Button
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => router.push("/conversations")}
          className="self-start -ml-2 text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to conversations
        </Button>
        <h1 className={title({ fullWidth: true })}>Write your own</h1>
        <p className="max-w-2xl text-default-500">
          Same fields as the featured conversations — situation, shared facts,
          the character&apos;s private stance, your goal, and the stakes. Save
          privately, then practise or publish when you are ready.
        </p>
      </div>

      <ConversationBuilder mode="create" />
    </div>
  );
}
