"use server";

import { createClient } from "@/lib/supabase/server";

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
