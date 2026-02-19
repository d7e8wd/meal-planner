"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setShoppingState(params: {
  planWeekId: string;
  ingredientId: string;
  unit: string;
  inCupboard?: boolean;
  inTrolley?: boolean;
}) {
  const supabase = await createClient();

  // Upsert a single row keyed by (plan_week_id, ingredient_id, unit)
  const payload: any = {
    plan_week_id: params.planWeekId,
    ingredient_id: params.ingredientId,
    unit: params.unit ?? "",
  };

  if (typeof params.inCupboard === "boolean") payload.in_cupboard = params.inCupboard;
  if (typeof params.inTrolley === "boolean") payload.in_trolley = params.inTrolley;

  const { error } = await supabase
    .from("shopping_list_state")
    .upsert(payload, {
      onConflict: "plan_week_id,ingredient_id,unit",
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function resetShoppingListState(params: { planWeekId: string }) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("shopping_list_state")
    .delete()
    .eq("plan_week_id", params.planWeekId);

  if (error) {
    throw new Error(error.message);
  }

  // Ensure any server-rendered shopping list data is re-fetched
  revalidatePath("/shopping-list");
}

