"use client";

/**
 * Three-section discovery page for difficult conversations — CONTEXT.md locked
 * order: Featured (seeded) → Your conversations → From other students.
 * Provenance comes from the section heading, not a mixed-list badge.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, MessageCircleWarning, PenLine, Plus } from "lucide-react";
import ConversationCard, {
  type ConversationDiscoveryCard,
} from "@/components/difficult-conversation/ConversationCard";

export default function ConversationsIndexPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"featured" | "mine" | "others">("featured");
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

  const tabs = [
    { id: "featured", label: "Featured", count: seeded.length },
    { id: "mine", label: "Yours", count: mine.length },
    { id: "others", label: "From classmates", count: fromOthers.length },
  ] as const;

  const grid = (items: ConversationDiscoveryCard[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((conversation) => (
        <ConversationCard key={conversation.id} conversation={conversation} onChanged={loadList} />
      ))}
    </div>
  );

  const empty = (icon: React.ReactNode, heading: string, body?: string, action?: React.ReactNode) => (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-light-blue/32 text-cwru-blue">{icon}</span>
      <p className="font-display text-xl font-medium text-cwru-blue">{heading}</p>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );

  const writeButton = (
    <Button
      className="h-11 rounded-lg font-semibold"
      color="primary"
      startContent={<Plus className="h-4 w-4" />}
      onPress={() => router.push("/conversations/new")}
    >
      Write your own
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:text-cwru-blue" href="/">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Practice
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
            Courageous conversations
          </h1>
          <p className="max-w-2xl text-[15px] text-muted">
            Rehearse a hard conversation before you have it for real.
          </p>
        </div>
        {writeButton}
      </header>

      <div aria-label="Conversation sources" className="flex gap-7 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-selected={tab === t.id}
            className={`-mb-px h-11 border-b-2 text-[15px] ${
              tab === t.id ? "border-true-blue font-semibold text-cwru-blue" : "border-transparent font-medium text-muted hover:text-ink"
            }`}
            role="tab"
            type="button"
            onClick={() => setTab(t.id)}
          >
            {t.label} {!loading && <span className="font-normal text-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Spinner size="lg" />
          <p className="text-muted">Loading conversations...</p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-copper/40 bg-copper/[0.08] p-4 text-ink">
          {error}
        </div>
      ) : tab === "featured" ? (
        // Featured (seeded) situations are the default view.
        seeded.length > 0 ? (
          grid(seeded)
        ) : (
          empty(<MessageCircleWarning className="h-7 w-7" />, "Featured conversations are not available yet.")
        )
      ) : tab === "mine" ? (
        mine.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Private until you publish. Practice any of them right away.</p>
            {grid(mine)}
          </div>
        ) : (
          empty(
            <PenLine className="h-7 w-7" />,
            "You haven't written a conversation yet.",
            "Build a situation with the same fields the featured ones use, then practice it privately.",
            writeButton,
          )
        )
      ) : fromOthers.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Published by classmates. You can practice them — only the author can edit or unpublish.
          </p>
          {grid(fromOthers)}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button variant="bordered" isLoading={loadingMore} onPress={() => void loadMoreOthers()}>
                Load more
              </Button>
            </div>
          )}
        </div>
      ) : (
        empty(<MessageCircleWarning className="h-7 w-7" />, "Nobody has published one yet.")
      )}
    </div>
  );
}
