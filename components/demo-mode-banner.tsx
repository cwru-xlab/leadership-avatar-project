"use client";

import { Chip } from "@heroui/chip";

/** Temporary banner while placeholder env/demo data is active */
export function DemoModeBanner({
  message = "Demo placeholder data — remove once env services are connected.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 flex flex-wrap items-center gap-2">
      <Chip size="sm" color="warning" variant="flat">
        Demo
      </Chip>
      <span>{message}</span>
    </div>
  );
}
