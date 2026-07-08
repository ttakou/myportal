"use client";

import { useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PERMISSION_MATRIX,
  PERM_CAPABILITIES,
  PERM_CAPABILITY_LABEL,
  PERM_ROLES,
  PERM_ROLE_LABEL,
  type PermCapability,
  type PermissionMatrix,
  type PermRole,
} from "@/types/perf-permissions";
import { savePermissionMatrix } from "../permission-actions";

export function PermissionMatrixEditor({ initial }: { initial: PermissionMatrix }) {
  const [matrix, setMatrix] = useState<PermissionMatrix>(initial);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(role: PermRole, cap: PermCapability) {
    setSaved(false);
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [cap]: !m[role][cap] } }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await savePermissionMatrix(matrix);
      if (!res.ok) setError(res.error ?? "Could not save.");
      else setSaved(true);
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Role &times; capability matrix</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setSaved(false);
              setMatrix(DEFAULT_PERMISSION_MATRIX);
            }}
          >
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </Button>
          <Button size="sm" disabled={pending} onClick={save}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Permissions saved.</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="sticky left-0 bg-card py-2 pr-3 font-medium">Capability</th>
              {PERM_ROLES.map((role) => (
                <th key={role} className="px-2 py-2 align-bottom">
                  <span className="block whitespace-nowrap text-xs font-medium text-muted-foreground">
                    {PERM_ROLE_LABEL[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_CAPABILITIES.map((cap) => (
              <tr key={cap} className="border-b last:border-0">
                <td className="sticky left-0 bg-card py-1.5 pr-3 font-medium">
                  {PERM_CAPABILITY_LABEL[cap]}
                </td>
                {PERM_ROLES.map((role) => (
                  <td key={role} className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={matrix[role][cap]}
                      disabled={pending}
                      onChange={() => toggle(role, cap)}
                      aria-label={`${PERM_ROLE_LABEL[role]}: ${PERM_CAPABILITY_LABEL[cap]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A user&apos;s effective rights are the union across every role they hold for a given
        appraisal. Roles the system can&apos;t yet derive from data (functional / project manager,
        HR business partner, executive) are listed for configuration and take effect as those
        relationships are wired up.
      </p>
    </section>
  );
}
