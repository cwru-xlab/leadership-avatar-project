import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The one way back up a level: an arrow and the destination's name
 * ("Study plans", not "Back to study plans"). Server-safe (no client hooks),
 * so server pages can render it too.
 */
export default function BackLink({ href, label, ariaLabel }: { href: string; label: string; ariaLabel?: string }) {
  return (
    <Link
      aria-label={ariaLabel}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-true-blue hover:text-cwru-blue"
      href={href}
    >
      <ArrowLeft aria-hidden size={16} />
      {label}
    </Link>
  );
}
