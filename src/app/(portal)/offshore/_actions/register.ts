"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";

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
  const gate = await requireOffshore("manage");
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
