import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/button";
import { ArrowLeft } from "lucide-react";

import { title } from "@/components/primitives";
import ConversationBuilder from "@/components/difficult-conversation/ConversationBuilder";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { loadOwnedDifficultConversation } from "@/lib/difficult-conversation/store";

/**
 * Owner-only edit. Loads through loadOwnedDifficultConversation so a
 * non-owner, unknown id, or seeded (ownerless) id all render the same
 * not-found — never a 403, never "you don't own this".
 */
export default async function EditConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(siteConfig.auth.cookie.name)?.value || "";
  const user = await getCurrentUser(token);

  if (!user) {
    notFound();
  }

  const record = await loadOwnedDifficultConversation(id, user.id);
  if (!record) {
    notFound();
  }

  return (
    <div className="space-y-8 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <Button
          as={Link}
          href="/conversations"
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="w-4 h-4" />}
          className="self-start -ml-2 text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to conversations
        </Button>
        <h1 className={title({ fullWidth: true })}>Edit conversation</h1>
        <p className="max-w-2xl text-default-500">
          Edits to a published scenario go live after the safety check. A
          failing check keeps your new text saved and privately playable, but
          unpublishes it until you fix the problem.
        </p>
      </div>

      <ConversationBuilder mode="edit" initial={record} />
    </div>
  );
}
