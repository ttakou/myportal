"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { idDocLabel, type DirectoryEntry } from "@/types/visitors";
import { setDirectoryNotes, setDoNotAdmit } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function DirectoryPanel({ entries, query }: { entries: DirectoryEntry[]; query: string }) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(query);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [noting, setNoting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reveal = useProgressiveReveal(entries.length);
  const flagged = entries.filter((e) => e.do_not_admit).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/visitors/directory?q=${encodeURIComponent(q.trim())}` : "/visitors/directory");
        }}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, ID number or phone" className={`${field} w-80 pl-8`} />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        <span className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "person" : "people"}
          {flagged > 0 ? ` · ${flagged} do-not-admit` : ""}
        </span>
      </form>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Identity &amp; contact</th>
              <th className="px-4 py-3 font-medium">Visits</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium text-right">Admission</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.slice(0, reveal.count).map((e) => (
              <tr key={e.id} className={cn(e.do_not_admit && "bg-destructive/5")}>
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {e.do_not_admit && <ShieldAlert className="mr-1 inline h-4 w-4 text-destructive" />}
                    {e.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.company ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {e.id_document_number ? (
                    <div>
                      {idDocLabel(e.id_document_type) ?? "ID"}: {e.id_document_number}
                    </div>
                  ) : null}
                  {[e.phone, e.email].filter(Boolean).join(" · ") || (e.id_document_number ? "" : "—")}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-medium">{e.visits}</div>
                  {e.last_visit_date && (
                    <div className="text-muted-foreground">
                      last {e.last_visit_date}
                      {e.last_host_name ? ` · ${e.last_host_name}` : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {noting === e.id ? (
                    <form
                      className="flex gap-1"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        run(() => setDirectoryNotes(e.id, note), () => setNoting(null));
                      }}
                    >
                      <input value={note} onChange={(ev) => setNote(ev.target.value)} className={`${field} w-56`} placeholder="Who to call, what they come for…" />
                      <Button size="sm" type="submit" disabled={pending}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="text-left text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setNoting(e.id);
                        setNote(e.notes ?? "");
                      }}
                    >
                      {e.notes ?? "add a note"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-end gap-1">
                    {e.do_not_admit ? (
                      <>
                        <span className="text-xs text-destructive">{e.do_not_admit_reason ?? "Flagged"}</span>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setDoNotAdmit(e.id, false))}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Clear flag
                        </Button>
                      </>
                    ) : flagging === e.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          run(() => setDoNotAdmit(e.id, true, reason), () => setFlagging(null));
                        }}
                      >
                        <input value={reason} onChange={(ev) => setReason(ev.target.value)} className={`${field} w-48`} placeholder="Reason (shown to reception)" required />
                        <Button size="sm" variant="destructive" type="submit" disabled={pending}>
                          Flag
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setFlagging(null)}>
                          Back
                        </Button>
                      </form>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          setFlagging(e.id);
                          setReason("");
                        }}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" /> Do not admit
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nobody matches. The directory fills itself from each registration.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore ref={reveal.sentinelRef} hasMore={reveal.hasMore} remaining={reveal.remaining} onClick={reveal.showMore} label="Show more people" />
    </div>
  );
}
