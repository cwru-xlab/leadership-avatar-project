"use client";

/**
 * Owner-gated edit route. This UI-side check ("is this id in `mine`?") is a
 * UX convenience only — `/api/scenario/edit` independently enforces
 * ownership server-side (REQ-29) via `loadOwnedScenario` and would 404
 * regardless, so a non-owner who bypasses this page still cannot save.
 *
 * Uses `/api/scenario/list` (not `/api/case/get`) so the ownership answer
 * comes from the owner-scoped `mine` array rather than a raw case fetch.
 */

import BackLink from "@/components/shell/BackLink";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { title } from "@/components/primitives";
import ScenarioBuilder from "@/components/scenario/ScenarioBuilder";
import type { CaseStudy } from "@/types";

export default function EditScenarioPage() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();

  const [scenario, setScenario] = useState<CaseStudy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Ref-guard against React strict mode's double-invoke of the mount effect
  // so we fire exactly one /api/scenario/list request.
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    let isCurrent = true;
    const loadScenario = async () => {
      try {
        const response = await fetch("/api/scenario/list", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          mine?: CaseStudy[];
        };
        if (!isCurrent) return;
        const owned = data.mine?.find((s) => s.id === params.caseId) ?? null;
        if (!owned) {
          setNotFound(true);
        } else {
          setScenario(owned);
        }
      } catch {
        if (isCurrent) setNotFound(true);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };
    void loadScenario();
    return () => {
      isCurrent = false;
    };
  }, [params.caseId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (notFound || !scenario) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <Card className="max-w-lg border border-line shadow-none">
          <CardBody className="items-start gap-4 p-8">
            <CircleAlert className="text-true-blue" size={28} />
            <h1 className="font-display font-medium text-2xl">
              This scenario doesn&apos;t exist, or isn&apos;t yours to edit.
            </h1>
            <Button color="primary" onPress={() => router.push("/case-play")}>
              Back to scenarios
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <BackLink href="/case-play" label="Case studies" />
        <h1 className={title({ fullWidth: true })}>Edit scenario</h1>
      </div>

      <ScenarioBuilder mode="edit" caseId={params.caseId} initial={scenario} />
    </div>
  );
}
