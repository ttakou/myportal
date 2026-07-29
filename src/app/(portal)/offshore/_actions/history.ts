"use server";

import { getPobAsOf, getRoomHistory, getRotationStaffList, getStaffRotationHistory } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { PobAsOf, RoomHistoryRow, RotationStaffOption, StaffRotationHistory } from "@/types/offshore";
import { requireOffshore } from "./_shared";

export async function fetchPobAsOf(
  date: string,
): Promise<{ ok: boolean; pob?: PobAsOf; error?: string }> {
  const gate = await requireOffshore("view");
  if (gate) return gate;
  if (!date) return { ok: false, error: "Pick a date." };
  return { ok: true, pob: await getPobAsOf(date) };
}

export async function fetchRoomHistory(
  from: string,
  to: string,
): Promise<{ ok: boolean; rows?: RoomHistoryRow[]; error?: string }> {
  const gate = await requireOffshore("view");
  if (gate) return gate;
  if (!from || !to) return { ok: false, error: "Pick a date range." };
  return { ok: true, rows: await getRoomHistory(from, to) };
}

export async function fetchRotationStaff(): Promise<{ ok: boolean; staff?: RotationStaffOption[]; error?: string }> {
  const gate = await requireOffshore("view");
  if (gate) return gate;
  return { ok: true, staff: await getRotationStaffList() };
}

export async function fetchStaffRotation(
  profileId: string,
): Promise<{ ok: boolean; history?: StaffRotationHistory; error?: string }> {
  const gate = await requireOffshore("view");
  if (gate) return gate;
  if (!profileId) return { ok: false, error: "Pick a staff member." };
  return { ok: true, history: await getStaffRotationHistory(profileId) };
}
