"use client";

import BackLink from "@/components/shell/BackLink";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft } from "lucide-react";

import KnowledgeCheckCard, { type AttemptMarkDTO, type KeylessCheckDTO } from "@/components/study-plan/KnowledgeCheckCard";

/**
 * FIXED URL CONTRACT shared with 21-19: `PathPanel` renders
 * `/study-plans/{planId}/checks/{knowledgeCheckId}` for every
 * `KNOWLEDGE_CHECK` path step, and REQ-122 makes a step whose link goes
 * nowhere a failure. Neither path segment name may be renamed.
 *
 * Follows `app/reports/page.tsx`'s existing auth pattern: a client fetch,
 * a 401 renders a "go sign in" prompt rather than an automatic redirect —
 * matching that sibling page rather than inventing a new convention.
 *
 * NO PATH MUTATION HERE. This page does not mark the step complete, does
 * not refetch the path, and does not advance anything — it shows one check.
 * It also makes no direct database call; everything comes through the
 * attempt route.
 */
export default function KnowledgeCheckPage() {
  const params = useParams<{ planId: string; checkId: string }>();
  const router = useRouter();
  const planId = params.planId;
  const checkId = params.checkId;

  const [needsLogin, setNeedsLogin] = useState(false);
  const [notFound, setNotFoundState] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [check, setCheck] = useState<KeylessCheckDTO | null>(null);
  const [initialAttempt, setInitialAttempt] = useState<AttemptMarkDTO | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/study-plans/checks/${checkId}/attempt`,
          { cache: "no-store", credentials: "include" }
        );
        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }
        if (response.status === 404) {
          if (!cancelled) setNotFoundState(true);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          check?: KeylessCheckDTO;
          attempt?: AttemptMarkDTO | null;
          error?: string;
        };
        if (!response.ok || !data.check) {
          if (!cancelled) setLoadError(data.error || "We couldn't load this check.");
          return;
        }
        if (!cancelled) {
          setCheck(data.check);
          setInitialAttempt(data.attempt ?? null);
        }
      } catch {
        if (!cancelled) setLoadError("We couldn't load this check.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [checkId]);

  if (needsLogin) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">Sign in to take this knowledge check.</p>
        <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">This check is not available.</p>
        <Button
          as={Link}
          href={`/study-plans/${planId}`}
          className="mt-5"
          color="primary"
        >
          Back to my study plan
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-copper-deep">{loadError}</p>
        <Button as={Link} href={`/study-plans/${planId}`} className="mt-5" variant="light">
          Back to my study plan
        </Button>
      </div>
    );
  }

  if (!check) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <BackLink href={`/study-plans/${planId}`} label="Study plan" />
      <KnowledgeCheckCard
        planId={planId}
        checkId={checkId}
        check={check}
        initialAttempt={initialAttempt}
      />
    </div>
  );
}
