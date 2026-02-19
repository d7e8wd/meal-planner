"use server";

import { createClient } from "@/lib/supabase/server";
import { startOfWeekMonday, toDateOnly } from "@/lib/week";

type DbMeal = "breakfast" | "lunch" | "dinner" | "snack";

export async function clearPlanThisWeek() {
  const supabase = await createClient();

  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) throw new Error(hmErr.message);

  const householdId = hmData?.[0]?.household_id;
  if (!householdId) throw new Error("No household found.");

  const weekStart = toDateOnly(startOfWeekMonday(new Date()));

  const { data: pw, error: pwErr } = await supabase
    .from("plan_weeks")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (pwErr) throw new Error(pwErr.message);
  if (!pw?.id) return { deleted: 0 };

  const { error: delErr, count } = await supabase
    .from("plan_entries")
    .delete({ count: "exact" })
    .eq("plan_week_id", pw.id);

  if (delErr) throw new Error(delErr.message);

  return { deleted: count ?? 0 };
}

/**
 * Generalised plan entry save.
 *
 * Persists:
 * - dinner (shared) using meal="dinner" and notes ignored
 * - breakfast/lunch using meal enum values and notes="charlie" | "lucy" (or any string key)
 * - snacks using meal="snack" and notes to disambiguate slot, e.g. "charlie|snack1"
 *
 * Rules:
 * - recipeName empty => delete matching entry
 * - recipeName present => lookup recipe_id by name (case-insensitive) in household, then upsert
 */
export async function setPlanEntryForDate(input: {
  planWeekId: string;
  entryDate: string; // YYYY-MM-DD
  meal: DbMeal;
  recipeName: string; // "" clears
  notes?: string | null; // required for non-dinner entries
}) {
  const supabase = await createClient();

  const recipeName = (input.recipeName ?? "").trim();
  const isDinner = input.meal === "dinner";

  // For non-dinner rows we require a notes key so entries don't collide
  const notes = (input.notes ?? "").trim();
  if (!isDinner && !notes) {
    throw new Error(`notes is required for meal "${input.meal}"`);
  }

  // Get household (for recipe lookup security)
  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) throw new Error(hmErr.message);

  const householdId = hmData?.[0]?.household_id;
  if (!householdId) throw new Error("No household found.");

  // Identify existing entry
  let sel = supabase
    .from("plan_entries")
    .select("id")
    .eq("plan_week_id", input.planWeekId)
    .eq("entry_date", input.entryDate)
    .eq("meal", input.meal);

  if (!isDinner) {
    sel = sel.eq("notes", notes);
  }

  const { data: existingEntry, error: selErr } = await sel.maybeSingle();
  if (selErr) throw new Error(selErr.message);

  // Clear
  if (!recipeName) {
    if (existingEntry?.id) {
      const { error: delErr } = await supabase.from("plan_entries").delete().eq("id", existingEntry.id);
      if (delErr) throw new Error(delErr.message);
    }
    return { ok: true, action: "cleared" as const };
  }

  // Lookup recipe_id by name (case-insensitive)
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select("id")
    .eq("household_id", householdId)
    .ilike("name", recipeName)
    .maybeSingle();

  if (rErr) throw new Error(rErr.message);
  if (!recipe?.id) throw new Error(`Recipe not found: "${recipeName}"`);

  if (existingEntry?.id) {
    const { error: updErr } = await supabase
      .from("plan_entries")
      .update({
        recipe_id: recipe.id,
        ...(isDinner ? {} : { notes }),
      })
      .eq("id", existingEntry.id);

    if (updErr) throw new Error(updErr.message);
    return { ok: true, action: "updated" as const };
  }

  const insertPayload: any = {
    plan_week_id: input.planWeekId,
    entry_date: input.entryDate,
    meal: input.meal,
    recipe_id: recipe.id,
    servings_override: null,
  };

  if (!isDinner) insertPayload.notes = notes;

  const { error: insErr } = await supabase.from("plan_entries").insert(insertPayload);
  if (insErr) throw new Error(insErr.message);

  return { ok: true, action: "inserted" as const };
}

/**
 * Backwards-compatible dinner helper used by current UI.
 */
export async function setDinnerForDate(input: {
  planWeekId: string;
  entryDate: string;
  recipeName: string;
}) {
  return setPlanEntryForDate({
    planWeekId: input.planWeekId,
    entryDate: input.entryDate,
    meal: "dinner",
    recipeName: input.recipeName,
  });
}
