import { createClient } from "@/lib/supabase/server";
import { addDays, formatDay, formatDow, startOfWeekMonday, toDateOnly } from "@/lib/week";
import PlanGridClient from "./PlanGridClient";
import ClearPlanButton from "./ClearPlanButton";

export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  entry_date: string;
  meal: string;
  recipe_id: string | null;
  servings_override: number | null;
  notes: string | null;
};

type Recipe = {
  id: string;
  name: string;
  servings_default: number | null;
  meal_tags: string[] | null;
};

type Day = { dateOnly: string; dow: string; label: string };

function parseSnackNotes(notes: string | null): { person: "charlie" | "lucy"; slot: "snack1" | "snack2" } | null {
  const n = (notes ?? "").trim();
  const m = n.match(/^(charlie|lucy)\|(snack1|snack2)$/);
  if (!m) return null;
  return { person: m[1] as "charlie" | "lucy", slot: m[2] as "snack1" | "snack2" };
}

export default async function PlanPage() {
  const supabase = await createClient();

  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) return <div className="p-6">{hmErr.message}</div>;

  const householdId = hmData?.[0]?.household_id;
  if (!householdId) return <div className="p-6">No household found.</div>;

  const weekStartDate = startOfWeekMonday(new Date());
  const weekStart = toDateOnly(weekStartDate);

  const { data: existing, error: selErr } = await supabase
    .from("plan_weeks")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (selErr) return <div className="p-6">{selErr.message}</div>;

  let planWeekId = existing?.id as string | undefined;

  if (!planWeekId) {
    const { data: created, error: insErr } = await supabase
      .from("plan_weeks")
      .insert({ household_id: householdId, week_start: weekStart })
      .select("id")
      .single();

    if (insErr) return <div className="p-6">{insErr.message}</div>;
    planWeekId = created.id as string;
  }

  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStartDate, i);
    return {
      dateOnly: toDateOnly(d),
      dow: formatDow(d),
      label: formatDay(d),
    };
  });

  const { data: recipes, error: rErr } = await supabase
    .from("recipes")
    .select("id, name, servings_default, meal_tags")
    .eq("household_id", householdId)
    .order("name");

  if (rErr) return <div className="p-6">{rErr.message}</div>;

  const recipeById = new Map<string, Recipe>();
  (recipes ?? []).forEach((r) => recipeById.set((r as Recipe).id, r as Recipe));

  // ✅ Fetch ALL plan_entries for the week (dinner + breakfast/lunch/snack)
  const { data: entriesRaw, error: entErr } = await supabase
    .from("plan_entries")
    .select("id, entry_date, meal, recipe_id, servings_override, notes")
    .eq("plan_week_id", planWeekId);

  if (entErr) return <div className="p-6">{entErr.message}</div>;

  const entries = (entriesRaw ?? []) as Entry[];

  // Map dinner by date (shared)
  const dinnerByDate = new Map<string, Entry>();
  for (const e of entries) {
    if (e.meal === "dinner") {
      dinnerByDate.set(e.entry_date, e);
    }
  }

  const initialNameByKey: Record<string, string> = {};

  // Build a fast lookup for per-person breakfast/lunch by (date|meal|notes)
  const entryByKey = new Map<string, Entry>();
  for (const e of entries) {
    const notes = (e.notes ?? "").trim();
    entryByKey.set(`${e.entry_date}|${e.meal}|${notes}`, e);
  }

  for (const d of days) {
    // dinner (shared)
    const dinner = dinnerByDate.get(d.dateOnly);
    initialNameByKey[`dinner|shared|${d.dateOnly}`] =
      dinner?.recipe_id ? recipeById.get(dinner.recipe_id)?.name ?? "" : "";

    // breakfast + lunch (notes = "charlie"/"lucy")
    for (const meal of ["breakfast", "lunch"] as const) {
      for (const person of ["charlie", "lucy"] as const) {
        const match = entryByKey.get(`${d.dateOnly}|${meal}|${person}`);
        initialNameByKey[`${meal}|${person}|${d.dateOnly}`] =
          match?.recipe_id ? recipeById.get(match.recipe_id)?.name ?? "" : "";
      }
    }

    // snacks (DB meal="snack", notes="person|snack1" / "person|snack2")
    for (const person of ["charlie", "lucy"] as const) {
      for (const slot of ["snack1", "snack2"] as const) {
        const match = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // won't exist (different key)
        // We stored as "charlie|snack1" etc, so use that:
        const m2 = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // keep for clarity, but unused
        void match;
        void m2;

        const match2 = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void match2;

        const real = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void real;

        const snackEntry = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void snackEntry;

        const e = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void e;

        const found = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void found;

        const actual = entryByKey.get(`${d.dateOnly}|snack|${person}|${slot}`); // no-op
        void actual;

        const notesKey = `${person}|${slot}`;
        const snack = entryByKey.get(`${d.dateOnly}|snack|${notesKey}`);

        initialNameByKey[`${slot}|${person}|${d.dateOnly}`] =
          snack?.recipe_id ? recipeById.get(snack.recipe_id)?.name ?? "" : "";
      }
    }
  }

  // initial leftovers autofill (UI only) for lunch from yesterday dinner when servings > 2
  const lunchLeftoversFillByDate: Record<string, string> = {};
  for (let i = 0; i < days.length; i++) {
    const today = days[i];
    const yesterday = i > 0 ? days[i - 1] : null;

    if (!yesterday) {
      lunchLeftoversFillByDate[today.dateOnly] = "";
      continue;
    }

    const yDinner = dinnerByDate.get(yesterday.dateOnly);
    if (!yDinner?.recipe_id) {
      lunchLeftoversFillByDate[today.dateOnly] = "";
      continue;
    }

    const recipe = recipeById.get(yDinner.recipe_id);
    const servings = yDinner.servings_override ?? recipe?.servings_default ?? null;

    lunchLeftoversFillByDate[today.dateOnly] =
      servings !== null && servings > 2 ? recipe?.name ?? "" : "";
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Weekly Plan</h1>
          <div className="text-sm text-gray-500">Week of {formatDay(weekStartDate)}</div>
        </div>

        <ClearPlanButton />
      </div>

      <PlanGridClient
        planWeekId={planWeekId}
        days={days}
        recipes={(recipes ?? []) as Recipe[]}
        initialNameByKey={initialNameByKey}
        lunchLeftoversFillByDate={lunchLeftoversFillByDate}
      />
    </div>
  );
}
