"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, Copy, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types/database";
import type { FunctionalRole } from "@/lib/auth";
import type { EmployeeType, TenantUser } from "@/lib/admin";
import type { AccessRole } from "@/lib/access-roles";
import { registerStaff } from "../actions";

const ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];
const TYPES: EmployeeType[] = ["employee", "contractor", "guest"];
const FUNCTIONAL: { role: FunctionalRole; label: string }[] = [
  { role: "canteen_staff", label: "Canteen staff" },
  { role: "canteen_manager", label: "Canteen mgr" },
  { role: "hr_admin", label: "HR" },
  { role: "finance", label: "Finance" },
  { role: "safety_admin", label: "Safety" },
  { role: "campboss", label: "Campboss" },
  { role: "oim", label: "OIM" },
  { role: "system_admin", label: "Sys admin" },
];

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * One-form staff onboarding: creates the auth account (invite email or
 * temporary password), attaches the profile to the tenant, and pre-assigns
 * role, manager and access — no Supabase dashboard involved.
 */
export function RegisterStaffPanel({
  managers,
  accessRoles,
}: {
  managers: TenantUser[];
  accessRoles: AccessRole[];
}) {
  const [pending, startTransition] = useStatusTransition("Registering…");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"invite" | "password">("password");
  const [role, setRole] = useState<UserRole>("employee");
  const [managerId, setManagerId] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeType, setEmployeeType] = useState<EmployeeType>("employee");
  const [functional, setFunctional] = useState<FunctionalRole[]>([]);
  const [accessRoleIds, setAccessRoleIds] = useState<string[]>([]);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setCopied(false);
    startTransition(async () => {
      const res = await registerStaff({
        fullName,
        email,
        mode,
        role,
        managerId: managerId || undefined,
        department,
        employeeType,
        functionalRoles: functional,
        accessRoleIds,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not register staff.");
        return;
      }
      setCreated({ email, tempPassword: res.tempPassword });
      setFullName("");
      setEmail("");
      setManagerId("");
      setDepartment("");
      setRole("employee");
      setEmployeeType("employee");
      setFunctional([]);
      setAccessRoleIds([]);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Register staff</h2>
      </div>

      {created && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-800">
            ✓ Account created for {created.email}
          </p>
          {created.tempPassword ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-green-800">Temporary password (shown once):</span>
              <code className="rounded bg-white px-2 py-1 font-mono text-sm">
                {created.tempPassword}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(created.tempPassword!);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-green-800">
              An invitation email was sent — they&apos;ll set their own password.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <form onSubmit={submit} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required className={field} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Work email (optional)" className={field} />
          <select value={mode} onChange={(e) => setMode(e.target.value as "invite" | "password")} className={field}>
            <option value="password">Create with temporary password</option>
            <option value="invite">Send invitation email</option>
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={`${field} capitalize`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={field}>
            <option value="">Manager — none</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
            ))}
          </select>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department (optional)" className={field} />
          <select value={employeeType} onChange={(e) => setEmployeeType(e.target.value as EmployeeType)} className={`${field} capitalize`}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {accessRoles.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Module access (none = unrestricted)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {accessRoles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAccessRoleIds((s) => toggle(s, r.id))}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    accessRoleIds.includes(r.id)
                      ? "bg-green-600 text-white"
                      : "border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Functional roles (capabilities)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FUNCTIONAL.map((fr) => (
              <button
                key={fr.role}
                type="button"
                onClick={() => setFunctional((s) => toggle(s, fr.role))}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  functional.includes(fr.role)
                    ? "bg-primary text-primary-foreground"
                    : "border text-muted-foreground hover:bg-accent",
                )}
              >
                {fr.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Register staff"}
          </Button>
        </div>
      </form>
    </section>
  );
}
