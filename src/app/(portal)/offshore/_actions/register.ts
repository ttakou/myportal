"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, requireOffshoreDispatch, rev, tenantId } from "./_shared";

export interface RegisterEmpResult extends ActionResult {
  tempPassword?: string;
}

/**
 * Create an account for someone not yet in the system and (optionally) drop
 * them straight into a crew. Email is optional — a placeholder login is used
 * and profiles.email stays null until set later.
 */
export async function registerOffshoreEmployee(input: {
  fullName: string;
  email?: string;
  company?: string;
  crewId?: string;
}): Promise<RegisterEmpResult> {
  const gate = await requireOffshoreDispatch("manage");
  if (gate) return gate;
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Name is required." };
  const real = (input.email ?? "").trim().toLowerCase();
  if (real && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(real))
    return { ok: false, error: "Enter a valid email or leave it blank." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  if (real) {
    const { data: dup } = await admin.from("profiles").select("id").eq("email", real).maybeSingle();
    if (dup) return { ok: false, error: "An account with that email already exists." };
  }

  const hasEmail = real.length > 0;
  const loginEmail = hasEmail ? real : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
  const tempPassword = randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "7a";

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (cErr || !created?.user) return { ok: false, error: cErr?.message ?? "Could not create account." };
  const userId = created.user.id;

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: hasEmail ? real : null,
      full_name: fullName,
      tenant_id: tenant,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (pErr) return { ok: false, error: `Account created but profile setup failed: ${pErr.message}` };

  if (input.crewId) {
    await admin.from("offshore_staff").upsert(
      {
        tenant_id: tenant,
        profile_id: userId,
        crew_id: input.crewId,
        company: input.company?.trim() || null,
      },
      { onConflict: "profile_id" },
    );
  }

  rev();
  return { ok: true, tempPassword: hasEmail ? undefined : tempPassword };
}

/**
 * Register a NON-ROTATIONAL worker — someone who goes offshore but sits outside
 * the crew rotation (a vendor technician, an inspector, a short-term contractor).
 *
 * Two entry points in one action: pass `profileId` for somebody already in the
 * system, or a `fullName` to create the account first. Either way the person
 * lands on the offshore roster with `is_rotational = false` and no crew, so the
 * rotation maths skips them but POB, muster and manifests see a real staff
 * member rather than a "casual visitor".
 *
 * Gated by `requireOffshore("create")`: admin / Campboss / OIM pass by role,
 * and so does any access role holding the offshore `create` verb — the seeded
 * Receptionist, Radio Operator and Operations Supervisor roles (0164). The
 * roster insert deliberately runs through the *user's* client so the policies
 * from 0164 are the real gate, not merely this check.
 */
export async function registerNonRotationalStaff(input: {
  profileId?: string;
  fullName?: string;
  email?: string;
  company?: string;
  position?: string;
  employeeType?: "employee" | "contractor";
}): Promise<RegisterEmpResult> {
  const gate = await requireOffshore("create");
  if (gate) return gate;

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const company = input.company?.trim() || null;
  const position = input.position?.trim() || null;

  // --- Existing person: just add the roster row (RLS enforces the verb). -----
  if (input.profileId) {
    const { error } = await supabase.from("offshore_staff").upsert(
      {
        tenant_id: tenant,
        profile_id: input.profileId,
        crew_id: null,
        is_rotational: false,
        company,
        position,
      },
      { onConflict: "profile_id" },
    );
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  }

  // --- New person: create the account, then the roster row. ------------------
  const fullName = (input.fullName ?? "").trim();
  if (!fullName) return { ok: false, error: "Choose a person or enter a name." };
  const real = (input.email ?? "").trim().toLowerCase();
  if (real && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(real))
    return { ok: false, error: "Enter a valid email or leave it blank." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  if (real) {
    const { data: dup } = await admin.from("profiles").select("id").eq("email", real).maybeSingle();
    if (dup) return { ok: false, error: "An account with that email already exists." };
  }

  const hasEmail = real.length > 0;
  const loginEmail = hasEmail ? real : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
  const tempPassword =
    randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "7a";

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (cErr || !created?.user) return { ok: false, error: cErr?.message ?? "Could not create account." };
  const userId = created.user.id;

  // A plain employee account: no functional roles, no access roles, no manager
  // — same deliberately-minimal shape reception's gate registration creates.
  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: hasEmail ? real : null,
      full_name: fullName,
      tenant_id: tenant,
      is_active: true,
      employee_type: input.employeeType ?? "employee",
    },
    { onConflict: "id" },
  );
  if (pErr) return { ok: false, error: `Account created but profile setup failed: ${pErr.message}` };

  const { error: sErr } = await supabase.from("offshore_staff").upsert(
    {
      tenant_id: tenant,
      profile_id: userId,
      crew_id: null,
      is_rotational: false,
      company,
      position,
    },
    { onConflict: "profile_id" },
  );
  if (sErr) return { ok: false, error: `Account created but roster entry failed: ${sErr.message}` };

  rev();
  return { ok: true, tempPassword: hasEmail ? undefined : tempPassword };
}
