import { createClient } from "@/lib/supabase/server";
import type { Feedback } from "@/types/feedback";

const SELECT =
  "id, service_date, food_quality, quantity_rating, issue_type, comment, status, created_at," +
  " author:profiles!canteen_feedback_profile_id_fkey(full_name)";

function mapRow(row: Record<string, any>): Feedback {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    person_name: author?.full_name ?? null,
    service_date: row.service_date,
    food_quality: row.food_quality,
    quantity_rating: row.quantity_rating,
    issue_type: row.issue_type,
    comment: row.comment,
    status: row.status,
    created_at: row.created_at,
  };
}

export async function getMyFeedback(): Promise<Feedback[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("canteen_feedback")
    .select(SELECT)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, any>));
}

export async function getAllFeedback(): Promise<Feedback[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_feedback")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getAllFeedback:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, any>));
}
