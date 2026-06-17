"use server";

import { getPobAsOf, getRoomHistory } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { PobAsOf, RoomHistoryRow } from "@/types/offshore";
import { canManageOffshore } from "./_shared";

export async function fetchPobAsOf(
  date: string,
): Promise<{ ok: boolean; pob?: PobAsOf; error?: string }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!date) return { ok: false, error: "Pick a date." };
  return { ok: true, pob: await getPobAsOf(date) };
}

export async function fetchRoomHistory(
  from: string,
  to: string,
): Promise<{ ok: boolean; rows?: RoomHistoryRow[]; error?: string }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!from || !to) return { ok: false, error: "Pick a date range." };
  return { ok: true, rows: await getRoomHistory(from, to) };
}
