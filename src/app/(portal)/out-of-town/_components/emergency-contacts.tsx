"use client";

import { useMemo, useState, useTransition } from "react";
import { Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONTACT_CATEGORY_LABEL,
  type ContactCategory,
  type EmergencyContact,
} from "@/types/trips";
import { addEmergencyContact, deleteEmergencyContact } from "../actions";

const CATEGORIES = Object.keys(CONTACT_CATEGORY_LABEL) as ContactCategory[];

export function EmergencyContacts({
  contacts,
  canManage,
}: {
  contacts: EmergencyContact[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState<ContactCategory>("hospital");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  // Group contacts by destination for a tidy directory.
  const grouped = useMemo(() => {
    const m = new Map<string, EmergencyContact[]>();
    for (const c of contacts) {
      const list = m.get(c.destination) ?? [];
      list.push(c);
      m.set(c.destination, list);
    }
    return Array.from(m.entries());
  }, [contacts]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Emergency contacts by destination</h2>
        {canManage && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {canManage && adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addEmergencyContact({ destination, category, name, phone, note }),
              () => {
                setDestination("");
                setName("");
                setPhone("");
                setNote("");
                setCategory("hospital");
                setAdding(false);
              },
            );
          }}
          className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <select value={category} onChange={(e) => setCategory(e.target.value as ContactCategory)} className="rounded-md border bg-background px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CONTACT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
            <Button type="submit" size="sm" disabled={pending}>Save</Button>
          </div>
        </form>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No destination contacts yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {grouped.map(([dest, list]) => (
            <div key={dest} className="rounded-xl border bg-card">
              <header className="border-b px-4 py-2 font-medium">{dest}</header>
              <ul className="divide-y">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        {CONTACT_CATEGORY_LABEL[c.category]}
                      </span>{" "}
                      <span className="font-medium">{c.name}</span>
                      {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3.5 w-3.5" />
                          {c.phone}
                        </a>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteEmergencyContact(c.id))}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete contact"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
