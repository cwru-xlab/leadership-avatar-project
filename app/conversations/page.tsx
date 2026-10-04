"use client";

/**
 * Three-section discovery page for difficult conversations — CONTEXT.md locked
 * order: Featured (seeded) → Your conversations → From other students.
 * Provenance comes from the section heading, not a mixed-list badge.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, MessageCircleWarning, PenLine, Plus } from "lucide-react";
import { title } from "@/components/primitives";
import ConversationCard, {
  type ConversationDiscoveryCard,
} from "@/components/difficult-conversation/ConversationCard";

export default function ConversationsIndexPage() {
  const router = useRouter();

  const [seeded, setSeeded] = useState<ConversationDiscoveryCard[]>([]);
  const [mine, setMine] = useState<ConversationDiscoveryCard[]>([]);
  const [fromOthers, setFromOthers] = useState<ConversationDiscoveryCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const didLoad = useRef(false);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/difficult-conversation/list", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load conversations");
      }

      const data = await response.json();
      setSeeded((data.seeded ?? []) as ConversationDiscoveryCard[]);
      setMine((data.mine ?? []) as ConversationDiscoveryCard[]);
      setFromOthers((data.fromOthers ?? []) as ConversationDiscoveryCard[]);
      setNextCursor(
        typeof data.nextCursor === "string" ? data.nextCursor : null
      );
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setError("Failed to load conversations. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreOthers = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/difficult-conversation/list?cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!response.ok) throw new Error("Failed to load more");
      const data = await response.json();
      const page = (data.fromOthers ?? []) as ConversationDiscoveryCard[];
      setFromOthers((prev) => [...prev, ...page]);
      setNextCursor(
        typeof data.nextCursor === "string" ? data.nextCursor : null
      );
    } catch (err) {
      console.error("Failed to load more conversations:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    void loadList();
  }, [loadList]);

  return (
    <div className="space-y-10 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <Button
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => router.push("/")}
          className="self-start -ml-2 text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to Dashboard
        </Button>
        <h1 className={title({ fullWidth: true })}>Difficult Conversations</h1>
        <p className="max-w-2xl text-default-500">
          Practice a tense conversation before you have to have it for real —
          pick a featured situation, write your own, or try one a classmate has
          shared.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Spinner size="lg" />
          <p className="text-default-500">Loading conversations...</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Section 1: Featured (seeded) — locked first */}
          <section aria-labelledby="featured-heading" className="space-y-4">
            <div>
              <h2
                id="featured-heading"
                className="text-xl font-semibold text-default-900"
              >
                Featured conversations
              </h2>
              <p className="text-sm text-default-500">
                Built-in situations. Pick one and go.
              </p>
            </div>

            {seeded.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {seeded.map((conversation) => (
                  <ConversationCard
                    key={conversation.id}
                    conversation={conversation}
                    onChanged={loadList}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-default-100 flex items-center justify-center">
                  <MessageCircleWarning className="w-8 h-8 text-default-400" />
                </div>
                <p className="text-default-600 font-medium">
                  Featured conversations are not available yet.
                </p>
              </div>
            )}
          </section>

          {/* Section 2: student's own */}
          <section aria-labelledby="mine-heading" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2
                  id="mine-heading"
                  className="text-xl font-semibold text-default-900"
                >
                  Your conversations
                </h2>
                <p className="text-sm text-default-500">
                  Private until you publish. Practice any of them right away.
                </p>
              </div>
              <Button
                color="primary"
                startContent={<Plus className="w-4 h-4" />}
                onPress={() => router.push("/conversations/new")}
              >
                Write your own
              </Button>
            </div>

            {mine.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {mine.map((conversation) => (
                  <ConversationCard
                    key={conversation.id}
                    conversation={conversation}
                    onChanged={loadList}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-default-200 rounded-xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-default-100 flex items-center justify-center">
                  <PenLine className="w-8 h-8 text-default-400" />
                </div>
                <p className="text-default-600 font-medium mb-1">
                  You haven&apos;t written a conversation yet.
                </p>
                <p className="text-default-500 text-sm mb-4">
                  Build a situation with the same fields the featured ones use,
                  then practice it privately.
                </p>
                <Button
                  color="primary"
                  startContent={<Plus className="w-4 h-4" />}
                  onPress={() => router.push("/conversations/new")}
                >
                  Write your own
                </Button>
              </div>
            )}
          </section>

          {/* Section 3: from other students */}
          <section aria-labelledby="others-heading" className="space-y-4">
            <div>
              <h2
                id="others-heading"
                className="text-xl font-semibold text-default-900"
              >
                From other students
              </h2>
              <p className="text-sm text-default-500">
                Published by classmates. You can practice them — only the author
                can edit or unpublish.
              </p>
            </div>

            {fromOthers.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {fromOthers.map((conversation) => (
                    <ConversationCard
                      key={conversation.id}
                      conversation={conversation}
                      onChanged={loadList}
                    />
                  ))}
                </div>
                {nextCursor && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="flat"
                      isLoading={loadingMore}
                      onPress={() => void loadMoreOthers()}
                    >
                      Load more
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-default-500 py-6">
                Nobody has published one yet.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
