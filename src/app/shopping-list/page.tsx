import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startOfWeekMonday, toDateOnly } from "@/lib/week";
import ShoppingListClient from "./ShoppingListClient";

export const dynamic = "force-dynamic";

type IngredientAggRow = {
  kind: "ingredient";
  ingredient_id: string;
  ingredient_name: string;
  ingredient_category: string;
  unit: string;
  total_qty: number;
  in_cupboard: boolean;
  in_trolley: boolean;
};

type ManualRow = {
  kind: "manual";
  manual_item_id: string;
  name: string;
  category: string;
  unit: string;
  qty: number | null;
  in_cupboard: boolean;
  in_trolley: boolean;
};

type DinnerRow = {
  recipe_id: string | null;
  servings_override: number | null;
};

type RecipeRow = {
  id: string;
  servings_default: number | null;
};

type StateRow = {
  ingredient_id: string;
  unit: string;
  in_cupboard: boolean | null;
  in_trolley: boolean | null;
};

type ManualItemRow = {
  id: string;
  name: string;
  category: string | null;
  qty: number | null;
  unit: string | null;
  carry_forward: boolean | null;
};

type ManualStateRow = {
  manual_item_id: string;
  in_cupboard: boolean | null;
  in_trolley: boolean | null;
};

export default async function ShoppingListPage() {
  const supabase = await createClient();

  // household
  const { data: hmData, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);

  if (hmErr) return <div className="p-6">{hmErr.message}</div>;

  const householdId = hmData?.[0]?.household_id;
  if (!householdId) return <div className="p-6">No household found.</div>;

  // current week
  const weekStart = toDateOnly(startOfWeekMonday(new Date()));

  const { data: pw, error: pwErr } = await supabase
    .from("plan_weeks")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (pwErr) return <div className="p-6">{pwErr.message}</div>;

  if (!pw?.id) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Shopping List</h1>
          <Link className="text-sm underline" href="/plan">
            Back to plan
          </Link>
        </div>
        <div>No plan week found for {weekStart}. Add dinners first.</div>
      </div>
    );
  }

  // dinner entries for the week (include servings_override for scaling)
  const { data: dinnersRaw, error: dErr } = await supabase
    .from("plan_entries")
    .select("recipe_id, servings_override")
    .eq("plan_week_id", pw.id)
    .eq("meal", "dinner");

  if (dErr) return <div className="p-6">{dErr.message}</div>;

  const dinners = (dinnersRaw ?? []) as DinnerRow[];

  const recipeIds = dinners.map((d) => d.recipe_id).filter(Boolean) as string[];
  const uniqueRecipeIds = Array.from(new Set(recipeIds));

  // Fetch manual items for this week (independent of dinners)
  const { data: manualItemsRaw, error: miErr } = await supabase
    .from("manual_shopping_items")
    .select("id, name, category, qty, unit, carry_forward")
    .eq("plan_week_id", pw.id)
    .order("created_at", { ascending: true });

  if (miErr) return <div className="p-6">{miErr.message}</div>;

  const manualItems = (manualItemsRaw ?? []) as ManualItemRow[];

  // Fetch manual tick state for this week
  const { data: manualStateRaw, error: msErr } = await supabase
    .from("manual_shopping_state")
    .select("manual_item_id, in_cupboard, in_trolley")
    .eq("plan_week_id", pw.id);

  if (msErr) return <div className="p-6">{msErr.message}</div>;

  const manualState = (manualStateRaw ?? []) as ManualStateRow[];
  const manualStateById = new Map<string, { in_cupboard: boolean; in_trolley: boolean }>();
  for (const s of manualState) {
    manualStateById.set(s.manual_item_id, {
      in_cupboard: !!s.in_cupboard,
      in_trolley: !!s.in_trolley,
    });
  }

  // If no dinners AND no manual items, show empty state
  if (uniqueRecipeIds.length === 0 && manualItems.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Shopping List</h1>
          <Link className="text-sm underline" href="/plan">
            Back to plan
          </Link>
        </div>
        <div>No dinners selected yet for week starting {weekStart}, and no manual items added.</div>
      </div>
    );
  }

  // --- Recipe-driven aggregation (only if we have dinners) ---
  let ingredientRows: IngredientAggRow[] = [];

  if (uniqueRecipeIds.length > 0) {
    // Fetch recipe defaults so we can scale (override/default)
    const { data: recipesRaw, error: rErr } = await supabase
      .from("recipes")
      .select("id, servings_default")
      .in("id", uniqueRecipeIds);

    if (rErr) return <div className="p-6">{rErr.message}</div>;

    const recipes = (recipesRaw ?? []) as RecipeRow[];
    const servingsDefaultByRecipe = new Map<string, number>();

    for (const r of recipes) {
      const def = Number(r.servings_default ?? 0);
      servingsDefaultByRecipe.set(r.id, def > 0 ? def : 1);
    }

    // Sum multipliers per recipe across dinners in the week:
    // totalMultiplier(recipe) = Σ (overrideOrDefault / default)
    const recipeMultiplierSum = new Map<string, number>();
    for (const d of dinners) {
      const recipeId = d.recipe_id;
      if (!recipeId) continue;

      const def = servingsDefaultByRecipe.get(recipeId) ?? 1;
      const override = Number(d.servings_override ?? 0);
      const usedServings = override > 0 ? override : def;

      const mult = usedServings / def;
      recipeMultiplierSum.set(recipeId, (recipeMultiplierSum.get(recipeId) ?? 0) + mult);
    }

    // Pull recipe items + ingredient names for those recipes
    const { data: items, error: itErr } = await supabase
      .from("recipe_items")
      .select("recipe_id, ingredient_id, qty, unit, ingredient:ingredients(name, category)")
      .in("recipe_id", uniqueRecipeIds);

    if (itErr) return <div className="p-6">{itErr.message}</div>;

    // Fetch existing checkbox state for this week
    const { data: stateRaw, error: sErr } = await supabase
      .from("shopping_list_state")
      .select("ingredient_id, unit, in_cupboard, in_trolley")
      .eq("plan_week_id", pw.id);

    if (sErr) return <div className="p-6">{sErr.message}</div>;

    const state = (stateRaw ?? []) as StateRow[];
    const stateByKey = new Map<string, { in_cupboard: boolean; in_trolley: boolean }>();
    for (const s of state) {
      const key = `${s.ingredient_id}||${s.unit ?? ""}`;
      stateByKey.set(key, {
        in_cupboard: !!s.in_cupboard,
        in_trolley: !!s.in_trolley,
      });
    }

    // Aggregate by ingredient_id + unit (stable), but keep display name/category
    const agg = new Map<string, Omit<IngredientAggRow, "kind">>();

    for (const it of items ?? []) {
      const recipeId = (it as any).recipe_id as string;
      const multiplier = recipeMultiplierSum.get(recipeId) ?? 1;

      const ingredientId = (it as any).ingredient_id as string;
      const ingredientName = (it as any).ingredient?.name ?? "Unknown ingredient";
      const ingredientCategory = (it as any).ingredient?.category ?? "Other";
      const unit = (it as any).unit ?? "";
      const baseQty = Number((it as any).qty ?? 0);

      const qty = baseQty * multiplier;
      const key = `${ingredientId}||${unit}`;

      const existing = agg.get(key);
      if (existing) {
        existing.total_qty += qty;
      } else {
        const st = stateByKey.get(key);
        agg.set(key, {
          ingredient_id: ingredientId,
          ingredient_name: ingredientName,
          ingredient_category: ingredientCategory,
          unit,
          total_qty: qty,
          in_cupboard: st?.in_cupboard ?? false,
          in_trolley: st?.in_trolley ?? false,
        });
      }
    }

    ingredientRows = Array.from(agg.values()).map((r) => ({ kind: "ingredient", ...r }));
  }

  // Manual rows (always included)
  const manualRows: ManualRow[] = manualItems.map((m) => {
    const st = manualStateById.get(m.id);
    return {
      kind: "manual",
      manual_item_id: m.id,
      name: m.name,
      category: (m.category ?? "Other") || "Other",
      unit: (m.unit ?? "") || "",
      qty: m.qty ?? null,
      in_cupboard: st?.in_cupboard ?? false,
      in_trolley: st?.in_trolley ?? false,
    };
  });

  const rows = [...ingredientRows, ...manualRows];

  return (
    <div className="space-y-4">
      <div className="px-6 pt-6">
        <Link className="text-sm underline" href="/plan">
          Back to plan
        </Link>
      </div>

      <ShoppingListClient
        weekStart={weekStart}
        dinnersCount={recipeIds.length}
        planWeekId={pw.id}
        initialRows={rows}
      />
    </div>
  );
}
