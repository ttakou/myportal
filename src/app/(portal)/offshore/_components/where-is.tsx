"use client";

import { useRouter } from "next/navigation";
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
  return (
    <div className="w-full max-w-md">
      <label className="text-xs font-medium text-muted-foreground">Who are you looking for?</label>
      <div className="mt-1">
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
          placeholder="Type a name"
        />
      </div>
    </div>
  );
}
