"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Network, Search, X, Plus, GripVertical } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetencyRoster, CompetencyRosterPerson } from "@/lib/training";
import { setEmployeeCompetency } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function CompetencyHoldersPanel({
  competencies,
  selectedId,
  roster,
}: {
  competencies: { id: string; name: string }[];
  selectedId: string | null;
  roster: CompetencyRoster;
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<CompetencyRosterPerson[]>(roster.people);
  const [q, setQ] = useState("");
  const [over, setOver] = useState<"holders" | "available" | null>(null);

  const comp = roster.competency;
  const maxLevel = comp?.max_level ?? 5;

  function patch(id: string, level: number) {
    setError(null);
    const prev = people;
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, level } : p)));
    startTransition(async () => {
      const res = await setEmployeeCompetency(id, comp!.id, level);
      if (!res.ok) {
        setPeople(prev); // revert
        setError(res.error ?? "Failed.");
      }
    });
  }

  const needle = q.trim().toLowerCase();
  const match = (p: CompetencyRosterPerson) => !needle || p.name.toLowerCase().includes(needle);
  const holders = people.filter((p) => p.level > 0).filter(match).sort((a, b) => a.name.localeCompare(b.name));
  const available = people.filter((p) => p.level === 0).filter(match).sort((a, b) => a.name.localeCompare(b.name));
  const holderCount = people.filter((p) => p.level > 0).length;

  function onDrop(target: "holders" | "available") {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const person = people.find((p) => p.id === id);
      if (!person) return;
      if (target === "holders" && person.level === 0) patch(id, 1);
      if (target === "available" && person.level > 0) patch(id, 0);
    };
  }

  function Card({ p, inHolders }: { p: CompetencyRosterPerson; inHolders: boolean }) {
    return (
      <div
        draggable={!pending}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
        className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm shadow-sm"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
        {inHolders ? (
          <>
            <select
              value={p.level}
              disabled={pending}
              onChange={(e) => patch(p.id, Number(e.target.value))}
              title="Level"
              className="rounded border bg-background px-1 py-0.5 text-xs"
            >
              {Array.from({ length: maxLevel }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  L{i + 1}
                </option>
              ))}
            </select>
            <button
              disabled={pending}
              title="Remove from holders"
              onClick={() => patch(p.id, 0)}
              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            disabled={pending}
            title="Mark as holder"
            onClick={() => patch(p.id, 1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Network className="h-5 w-5 text-primary" /> Competency Holders
        </h2>
        <p className="text-sm text-muted-foreground">
          Drag people into <span className="font-medium">Holders</span> to record that they hold a competency — the whole
          workforce is shown so it&apos;s easy to spot who&apos;s missing.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-muted-foreground">
          Competency
          <select
            value={selectedId ?? ""}
            onChange={(e) => router.push(`/training?view=competency-holders${e.target.value ? `&competency=${e.target.value}` : ""}`)}
            className={cn(field, "mt-0.5 block w-full min-w-[16rem]")}
          >
            <option value="">— choose a competency —</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {selectedId && comp && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className={cn(field, "w-56 pl-8")} />
          </div>
        )}
      </div>

      {!selectedId || !comp ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Pick a competency to manage its holders.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Holders */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver("holders");
            }}
            onDragLeave={() => setOver(null)}
            onDrop={onDrop("holders")}
            className={cn(
              "rounded-lg border-2 p-3 transition-colors",
              over === "holders" ? "border-primary bg-primary/5" : "border-dashed",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Holders</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{holderCount}</span>
            </div>
            <div className="space-y-1.5">
              {holders.map((p) => (
                <Card key={p.id} p={p} inHolders />
              ))}
              {holders.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Drag people here, or click the + on someone in the other column.
                </p>
              )}
            </div>
          </div>

          {/* Available / missing */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver("available");
            }}
            onDragLeave={() => setOver(null)}
            onDrop={onDrop("available")}
            className={cn(
              "rounded-lg border-2 p-3 transition-colors",
              over === "available" ? "border-amber-400 bg-amber-50" : "border-dashed",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Everyone else (not a holder)</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{available.length}</span>
            </div>
            <div className="space-y-1.5">
              {available.map((p) => (
                <Card key={p.id} p={p} inHolders={false} />
              ))}
              {available.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  {needle ? "No matches." : "Everyone holds this competency."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
