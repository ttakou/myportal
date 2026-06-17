import { createClient } from "@/lib/supabase/server";
import type { Feedback, Objective } from "@/types/performance";

export async function getMyObjectives(): Promise<Objective[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("okr_objectives")
    .select("id, title, period, status, okr_key_results(id, title, target, current, unit)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map((o: Record<string, any>) => {
    const krs = (o.okr_key_results ?? []).map((k: Record<string, any>) => ({
      id: k.id,
      title: k.title,
      target: Number(k.target),
      current: Number(k.current),
      unit: k.unit,
    }));
    const progress =
      krs.length === 0
        ? 0
        : Math.round(
            (krs.reduce(
              (s: number, k: { current: number; target: number }) =>
                s + (k.target > 0 ? Math.min(1, k.current / k.target) : 0),
              0,
            ) /
              krs.length) *
              100,
          );
    return {
      id: o.id,
      title: o.title,
      period: o.period,
      status: o.status,
      key_results: krs,
      progress,
    };
  });
}

export async function getFeedbackReceived(): Promise<Feedback[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("perf_feedback")
    .select("id, body, created_at, from:profiles!perf_feedback_from_id_fkey(full_name)")
    .eq("to_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map((f: Record<string, any>) => {
    const from = Array.isArray(f.from) ? f.from[0] : f.from;
    return {
      id: f.id,
      from_name: from?.full_name ?? null,
      to_name: null,
      body: f.body,
      created_at: f.created_at,
    };
  });
}
