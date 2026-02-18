"use server";

import { createClient } from "@/lib/supabase/server";
import { startOfWeekMonday, toDateOnly } from "@/lib/week";

export async function addRecipeToDinnerThisWeek(input: {
  entryDate: string; // YYYY-MM-DD
  recipeId: string;
  servingsOverride?: number | null;
}) {
  const supabase = await createClient();

  // 1) household
  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) throw new Error("household_members error: " + hmErr.message);

  const householdId = hmData?.[0]?.household_id;
  if (!householdId) throw new Error("No household found for user.");

  // 2) current week_start
  const weekStartDate = startOfWeekMonday(new Date());
  const weekStart = toDateOnly(weekStartDate);

  // 3) get/create plan week in plan_weeks (FK target)
  const { data: existing, error: selErr } = await supabase
    .from("plan_weeks")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (selErr) throw new Error("plan_weeks select error: " + selErr.message);

  let planWeekId: string | null = (existing?.id as string) ?? null;

  if (!planWeekId) {
    const { data: created, error: insErr } = await supabase
      .from("plan_weeks")
      .insert({ household_id: householdId, week_start: weekStart })
      .select("id")
      .single();

    if (insErr) throw new Error("plan_weeks insert error: " + insErr.message);

    planWeekId = (created?.id as string) ?? null;
  }

  if (!planWeekId) {
    throw new Error("Failed to obtain plan week id (planWeekId is null).");
  }

  // 4) upsert dinner entry (select then update/insert — no schema changes)
  const { data: existingEntry, error: entrySelErr } = await supabase
    .from("plan_entries")
    .select("id")
    .eq("plan_week_id", planWeekId)
    .eq("entry_date", input.entryDate)
    .eq("meal", "dinner")
    .maybeSingle();

  if (entrySelErr) throw new Error("plan_entries select error: " + entrySelErr.message);

  if (existingEntry?.id) {
    const { error: updErr } = await supabase
      .from("plan_entries")
      .update({
        recipe_id: input.recipeId,
        servings_override: input.servingsOverride ?? null,
      })
      .eq("id", existingEntry.id);

    if (updErr) throw new Error("plan_entries update error: " + updErr.message);
  } else {
    const { error: insEntryErr } = await supabase.from("plan_entries").insert({
      plan_week_id: planWeekId,
      entry_date: input.entryDate,
      meal: "dinner",
      recipe_id: input.recipeId,
      servings_override: input.servingsOverride ?? null,
    });

    if (insEntryErr) throw new Error("plan_entries insert error: " + insEntryErr.message);
  }
}
