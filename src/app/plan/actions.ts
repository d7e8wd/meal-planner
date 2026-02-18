"use server";

import { createClient } from "@/lib/supabase/server";
import { startOfWeekMonday, toDateOnly } from "@/lib/week";

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
 * Save dinner for a date in a given plan week.
 * - If recipeName is empty => delete dinner entry for that date.
 * - Else => find recipe_id by name (case-insensitive) within household, then upsert.
 */
export async function setDinnerForDate(input: {
  planWeekId: string;
  entryDate: string; // YYYY-MM-DD
  recipeName: string; // can be "" to clear
}) {
  const supabase = await createClient();

  const recipeName = (input.recipeName ?? "").trim();

  // Get household (for recipe lookup security)
  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) throw new Error(hmErr.message);
  const householdId = hmData?.[0]?.household_id;
  if (!householdId) throw new Error("No household found.");

  // Find existing dinner entry
  const { data: existingEntry, error: selErr } = await supabase
    .from("plan_entries")
    .select("id")
    .eq("plan_week_id", input.planWeekId)
    .eq("entry_date", input.entryDate)
    .eq("meal", "dinner")
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  // Clear
  if (!recipeName) {
    if (existingEntry?.id) {
      const { error: delErr } = await supabase
        .from("plan_entries")
        .delete()
        .eq("id", existingEntry.id);

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
      .update({ recipe_id: recipe.id })
      .eq("id", existingEntry.id);

    if (updErr) throw new Error(updErr.message);
    return { ok: true, action: "updated" as const };
  } else {
    const { error: insErr } = await supabase.from("plan_entries").insert({
      plan_week_id: input.planWeekId,
      entry_date: input.entryDate,
      meal: "dinner",
      recipe_id: recipe.id,
      servings_override: null,
    });

    if (insErr) throw new Error(insErr.message);
    return { ok: true, action: "inserted" as const };
  }
}
