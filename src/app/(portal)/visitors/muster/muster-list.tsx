"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Radio, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Visitor } from "@/types/visitors";

export function MusterList({ initial, date }: { initial: Visitor[]; date: string }) {
  const [onSite, setOnSite] = useState<Visitor[]>(initial);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("visitors")
      .select(
        "id, full_name, company, purpose, visit_date, status, badge_no, vehicle_type, vehicle_plate, check_in_at, check_out_at, host:profiles!visitors_host_id_fkey(full_name)",
      )
      .eq("status", "checked_in")
      .eq("visit_date", date)
      .order("check_in_at", { ascending: true });
    if (data) {
      setOnSite(
        data.map((row: Record<string, unknown>) => {
          const host = Array.isArray(row.host) ? row.host[0] : row.host;
          return {
            ...(row as unknown as Visitor),
            host_name: (host as { full_name?: string })?.full_name ?? null,
          };
        }),
      );
      setUpdatedAt(new Date());
    }
  }, [date]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("visitor-muster")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitors" },
        () => refetch(),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Persons on site</p>
            <p className="text-3xl font-semibold tabular-nums">{onSite.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Radio className={cn("h-3.5 w-3.5", live && "animate-pulse")} />
            {live ? "Live" : "Connecting…"}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          Updated {updatedAt.toLocaleTimeString()}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Visitor</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">Badge</th>
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Checked in</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {onSite.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium">{v.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.company ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.host_name ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{v.badge_no ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[v.vehicle_type, v.vehicle_plate].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {v.check_in_at
                    ? new Date(v.check_in_at).toLocaleTimeString()
                    : "—"}
                </td>
              </tr>
            ))}
            {onSite.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No visitors currently on site.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
