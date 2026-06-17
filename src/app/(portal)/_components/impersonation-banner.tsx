"use client";

import { useStatusTransition } from "@/components/activity";
import { UserCog } from "lucide-react";
import { stopImpersonation } from "@/app/(portal)/admin/actions";

/** Banner shown while a super-admin is acting as another user. */
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, start] = useStatusTransition("Switching…", "load");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950">
      <span className="inline-flex items-center gap-1.5">
        <UserCog className="h-4 w-4" /> You are acting as <strong>{name}</strong>
        <span className="hidden font-normal opacity-80 sm:inline">· auto-ends after 30 min</span>
      </span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await stopImpersonation();
            window.location.href = "/admin";
          })
        }
        className="rounded-full bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-50 hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Stop impersonating"}
      </button>
    </div>
  );
}
