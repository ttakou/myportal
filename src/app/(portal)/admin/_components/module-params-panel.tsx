"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TenantModule } from "@/lib/admin";
import {
  MODULE_PARAMS,
  withDefaults,
  type ModuleParamDef,
  type ModuleParamValue,
} from "@/lib/module-params";
import { updateModuleSettings } from "../actions";

/**
 * Per-module parameter forms, rendered from the MODULE_PARAMS registry.
 * Only modules that define parameters appear; canteen keeps its dedicated
 * panel below.
 */
export function ModuleParamsPanel({ modules }: { modules: TenantModule[] }) {
  const configurable = modules.filter((m) => (MODULE_PARAMS[m.slug] ?? []).length > 0);
  if (configurable.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Module parameters</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {configurable.map((m) => (
          <ModuleForm key={m.service_id} module={m} />
        ))}
      </div>
    </section>
  );
}

function ModuleForm({ module }: { module: TenantModule }) {
  const defs = MODULE_PARAMS[module.slug] ?? [];
  const [values, setValues] = useState(() => withDefaults(module.slug, module.settings));
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set(key: string, value: ModuleParamValue) {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateModuleSettings(module.service_id, module.slug, values);
      if (!res.ok) setError(res.error ?? "Could not save settings.");
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-medium">
        {module.name}
        {!module.is_active && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">(module disabled)</span>
        )}
      </p>

      <div className="mt-3 space-y-3">
        {defs.map((def) => (
          <ParamField key={def.key} def={def} value={values[def.key]} onChange={set} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {error && <span className="text-sm text-destructive">{error}</span>}
        {saved && !error && <span className="text-sm text-green-600">Saved</span>}
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function ParamField({
  def,
  value,
  onChange,
}: {
  def: ModuleParamDef;
  value: ModuleParamValue;
  onChange: (key: string, value: ModuleParamValue) => void;
}) {
  const field = "rounded-md border bg-background px-3 py-1.5 text-sm";

  if (def.type === "boolean") {
    const on = value === true;
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{def.label}</p>
          {def.help && <p className="text-xs text-muted-foreground">{def.help}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => onChange(def.key, !on)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{def.label}</p>
        {def.help && <p className="text-xs text-muted-foreground">{def.help}</p>}
      </div>
      {def.type === "number" ? (
        <input
          type="number"
          value={String(value)}
          min={def.min}
          max={def.max}
          onChange={(e) => onChange(def.key, Number(e.target.value))}
          className={`${field} w-24 text-right`}
        />
      ) : def.type === "select" ? (
        <select
          value={String(value)}
          onChange={(e) => onChange(def.key, e.target.value)}
          className={field}
        >
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={String(value)}
          onChange={(e) => onChange(def.key, e.target.value)}
          className={`${field} w-48`}
        />
      )}
    </div>
  );
}
