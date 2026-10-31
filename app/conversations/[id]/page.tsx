import { cookies } from "next/headers";
import BackLink from "@/components/shell/BackLink";
import { notFound } from "next/navigation";
import Link from "next/link";
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
 *
 * Seeded catalog ids have ownerId: null, so the loader returns null and this
 * page collapses to not-found. Featured conversations are edited only by
 * code review, not through this UI.
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
        {/* Plain styled next/link, not HeroUI Button as={Link}: this is a
            server component, and passing the Link function as a prop to a
            client component throws at render (D15-2). */}
        <BackLink href="/conversations" label="Courageous conversations" />
        <h1 className={title({ fullWidth: true })}>Edit conversation</h1>
        <p className="max-w-2xl text-[15px] text-muted">
          Edits to a published scenario go live after the safety check. A
          failing check keeps your new text saved and privately playable, but
          unpublishes it until you fix the problem.
        </p>
        <p className="max-w-2xl text-sm text-default-500">
          Unpublish is instant and never gated. Publishing again re-runs the
          same automated check — there is no separate draft-versus-live copy.
        </p>
        <p className="max-w-2xl text-sm text-default-500">
          Opening this URL for a classmate&apos;s scenario or a featured id
          shows the standard not-found page, not a permission error.
        </p>
      </div>

      <ConversationBuilder mode="edit" initial={record} />
    </div>
  );
}
