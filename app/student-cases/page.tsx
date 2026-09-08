"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — students now use /practice */
export default function StudentCasesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/practice");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-20 text-default-500">
      Redirecting to Practice…
    </div>
  );
}
