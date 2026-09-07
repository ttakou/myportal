"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { gapsHeadline, type ProfileGap } from "@/lib/offshore/profile-gaps";
import type { MyOffshoreProfile } from "@/lib/offshore/my-profile";
import { declareOffshoreProfile } from "@/app/(portal)/offshore/actions";

const field = "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm";

/**
 * "Complete your offshore profile": the safety details the roster has no
 * record of, asked of the one person who knows them. Only the gaps are shown;
 * the prompt disappears once they are closed.
 */
export function OffshoreProfilePrompt({ profile }: { profile: MyOffshoreProfile }) {
  const router = useRouter();
  const [pending, start] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [medical, setMedical] = useState("");
  const [bosiet, setBosiet] = useState("");
  const [huet, setHuet] = useState("");
  const [contact, setContact] = useState("");
  const [b2b, setB2b] = useState("");

  const gaps = profile.gaps;
  if (gaps.length === 0) return null;
  const has = (k: ProfileGap["key"]) => gaps.some((g) => g.key === k);

  function submit() {
    setError(null);
    start(async () => {
      const res = await declareOffshoreProfile({
        medicalExpiry: medical,
        bosietExpiry: bosiet,
        huetExpiry: huet,
        emergencyContact: contact,
        backToBackId: b2b,
      });
      if (!res.ok) setError(res.error ?? "Could not save.");
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <div className="flex flex-wrap items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Complete your offshore profile — {gapsHeadline(gaps)}</p>
          <p className="text-sm">
            The muster roll, the compliance report and crew-change reminders read these. Nobody else
            can fill them in for you.
          </p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {gaps.map((g) => (
              <li key={g.key} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                <span>
                  <strong>{g.label}</strong>
                  {g.state === "expired" ? ` expired on ${g.date}` : " not recorded"} · {g.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <ClipboardCheck className="mr-1.5 h-4 w-4" /> Fill in now
          </Button>
        )}
      </div>

      {open && (
        <form
          className="mt-4 space-y-3 rounded-md border border-amber-200 bg-white/70 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {has("medical") && (
              <label className="text-xs font-medium">
                Offshore medical valid until
                <input type="date" value={medical} onChange={(e) => setMedical(e.target.value)} className={field} />
              </label>
            )}
            {has("bosiet") && (
              <label className="text-xs font-medium">
                BOSIET valid until
                <input type="date" value={bosiet} onChange={(e) => setBosiet(e.target.value)} className={field} />
              </label>
            )}
            {has("huet") && (
              <label className="text-xs font-medium">
                HUET valid until
                <input type="date" value={huet} onChange={(e) => setHuet(e.target.value)} className={field} />
              </label>
            )}
          </div>
          {has("emergency_contact") && (
            <label className="block text-xs font-medium">
              Emergency contact — name, relationship and phone
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. Marie Mforsong, wife, +237 6 00 00 00 00"
                className={field}
              />
            </label>
          )}
          {has("back_to_back") && (
            <label className="block text-xs font-medium">
              Back-to-back — the person who relieves you at crew change
              <SearchSelect
                value={b2b}
                onChange={(v) => setB2b(v ?? "")}
                options={profile.people}
                getOptionValue={(p) => p.id}
                getOptionLabel={(p) => (p.crew ? `${p.name} · ${p.crew}` : p.name)}
                placeholder="Start typing a name"
                wrapperClassName="w-full"
                className={field}
              />
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Later
            </Button>
            <span className="text-xs">Leave blank what you do not have to hand; you can come back.</span>
          </div>
        </form>
      )}
    </section>
  );
}
