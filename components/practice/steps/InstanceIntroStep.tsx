"use client";

/**
 * Student-authored INSTANCE intro step — name, background, characters.
 * Ported from `app/case-play/[caseId]/page.tsx`'s `"intro"` PageState by
 * reading that file (not editing it). Plan 13-11 wires this into
 * `/practice/case-study/[instanceId]`; it exists here so that change stays
 * small and the wizard step vocabulary is complete.
 */

import AvatarImage from "@/components/AvatarImage";
import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { ArrowRight, Users } from "lucide-react";

export interface InstanceIntroAvatar {
  id: string;
  name: string;
  role: string;
  portraitUrl?: string | null;
}

export interface InstanceIntroStepProps {
  nav: SetupStepNav;
  name: string;
  background: string;
  avatars: InstanceIntroAvatar[];
  /** Optional portrait map keyed by avatar id (case-play loads these async). */
  avatarPortraits?: Record<string, string | undefined>;
  /** Continue label — case-play uses a mode-specific CTA; default is Continue. */
  continueLabel?: string;
}

export default function InstanceIntroStep({
  nav,
  name,
  background,
  avatars,
  avatarPortraits = {},
  continueLabel = "Continue",
}: InstanceIntroStepProps) {
  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="instance-intro-heading">
      <div>
        <p className="text-sm font-semibold text-[#0a7391]">
          Step {nav.stepNumber} of {nav.totalSteps}
        </p>
        <h2
          id="instance-intro-heading"
          className="mt-1 font-serif text-3xl tracking-[-0.03em]"
        >
          {name}
        </h2>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-xl font-semibold">Background Information</h3>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-wrap leading-relaxed text-default-700">
            {background}
          </p>
        </CardBody>
      </Card>

      {avatars.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <h3 className="text-xl font-semibold">People You Can Talk To</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3">
              {avatars.map((avatar) => (
                <div
                  key={avatar.id}
                  className="flex items-center gap-4 rounded-lg bg-default-50 p-4"
                >
                  <AvatarImage
                    portrait={avatarPortraits[avatar.id] ?? avatar.portraitUrl ?? undefined}
                    name={avatar.name}
                    size={48}
                    className="shrink-0"
                  />
                  <div>
                    <p className="font-semibold">{avatar.name}</p>
                    <p className="text-sm text-default-500">{avatar.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          color="primary"
          size="lg"
          endContent={<ArrowRight size={17} />}
          onPress={nav.goNext}
        >
          {continueLabel}
        </Button>
      </div>
    </section>
  );
}
