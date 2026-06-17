import type { Database } from "@/types/supabase";

/** A table's Row type, e.g. `Tables<"offshore_trips">`. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** A table's Insert type. */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** A database enum, e.g. `Enums<"offshore_status">`. */
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
