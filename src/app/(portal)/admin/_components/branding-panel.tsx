"use client";

import { useRef, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ImageUp, Palette, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TenantBranding } from "@/lib/branding";
import { updateTenantBranding, uploadTenantLogo } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/** Tenant branding: logo upload + name and brand colours. System admins. */
export function BrandingPanel({ branding }: { branding: TenantBranding }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(branding.logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(branding.name);
  const [primary, setPrimary] = useState(branding.primary);
  const [primaryDark, setPrimaryDark] = useState(branding.primaryDark);
  const [charcoal, setCharcoal] = useState(branding.charcoal);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 2_000_000) {
      setError("Logo must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      startTransition(async () => {
        const res = await uploadTenantLogo({ dataUrl, contentType: file.type });
        if (!res.ok) setError(res.error ?? "Upload failed.");
        else {
          setLogoUrl(res.url ?? null);
          flash();
        }
      });
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setError(null);
    startTransition(async () => {
      const res = await updateTenantBranding({ logoUrl: null });
      if (!res.ok) setError(res.error ?? "Could not remove logo.");
      else {
        setLogoUrl(null);
        flash();
      }
    });
  }

  function saveDetails() {
    setError(null);
    startTransition(async () => {
      const res = await updateTenantBranding({ name, primary, primaryDark, charcoal });
      if (!res.ok) setError(res.error ?? "Could not save.");
      else flash();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Branding</h2>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Logo</p>
          <div className="flex h-20 items-center justify-center rounded-md border bg-muted/30 p-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Tenant logo" className="max-h-16 w-auto object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">No logo set</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={onFile}
              className="hidden"
            />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
              <ImageUp className="h-4 w-4" /> Upload logo
            </Button>
            {logoUrl && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={removeLogo}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP · max 2 MB.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground">
            Brand name
            <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Primary" value={primary} onChange={setPrimary} />
            <ColorField label="Primary dark" value={primaryDark} onChange={setPrimaryDark} />
            <ColorField label="Charcoal" value={charcoal} onChange={setCharcoal} />
          </div>
          <Button size="sm" disabled={pending} onClick={saveDetails}>
            Save branding
          </Button>
        </div>
      </div>
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <span className="mt-1 flex items-center gap-1">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        />
      </span>
    </label>
  );
}
