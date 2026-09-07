"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SearchSelect } from "@/components/ui/search-select";

/**
 * Pick a person; the page answers where they are.
 *
 * The choice goes into the URL so the answer can be sent to somebody, and so
 * the back button returns to the previous person rather than to a blank box.
 */
export function WhereIsPicker({
  people,
  selectedId,
}: {
  people: { id: string; name: string; crew: string | null }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  // The picker takes no styling of its own, so a bare one rendered as grey
  // placeholder text on a white page — nothing to say "type here". A bordered
  // box the width of the card, with a search mark and a real label.
  return (
    <div className="rounded-lg border bg-card p-4">
      <label htmlFor="where-is-person" className="text-sm font-medium">
        Who are you looking for?
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <SearchSelect
          value={selectedId ?? ""}
          onChange={(v) => {
            const params = new URLSearchParams({ view: "whereis" });
            if (v) params.set("person", v);
            router.push(`/offshore?${params.toString()}`);
          }}
          options={people}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => (p.crew ? `${p.name} · ${p.crew}` : p.name)}
          placeholder="Start typing a name — e.g. Talla"
          wrapperClassName="w-full"
          className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {people.length} people on the offshore roster. The list narrows as you type; pick one to see
        where they are.
      </p>
    </div>
  );
}
