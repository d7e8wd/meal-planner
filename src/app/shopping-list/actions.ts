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

export async function setManualItemState(params: {
  planWeekId: string;
  manualItemId: string;
  inCupboard?: boolean;
  inTrolley?: boolean;
}) {
  const supabase = await createClient();

  const payload: any = {
    plan_week_id: params.planWeekId,
    manual_item_id: params.manualItemId,
    updated_at: new Date().toISOString(),
  };

  if (typeof params.inCupboard === "boolean") payload.in_cupboard = params.inCupboard;
  if (typeof params.inTrolley === "boolean") payload.in_trolley = params.inTrolley;

  const { error } = await supabase
    .from("manual_shopping_state")
    .upsert(payload, {
      onConflict: "plan_week_id,manual_item_id",
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function addManualItem(params: {
  planWeekId: string;
  name: string;
  category?: string;
  qty?: number | null;
  unit?: string | null;
  carryForward?: boolean;
}) {
  const supabase = await createClient();

  const name = (params.name ?? "").trim();
  if (!name) throw new Error("Item name is required");

  const category = (params.category ?? "Other").trim() || "Other";
  const unit = (params.unit ?? "").trim();

  const qty =
    typeof params.qty === "number" && Number.isFinite(params.qty) ? params.qty : null;

  const { error } = await supabase.from("manual_shopping_items").insert({
    plan_week_id: params.planWeekId,
    name,
    category,
    qty,
    unit,
    carry_forward: !!params.carryForward,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/shopping-list");
}

export async function deleteManualItem(params: { id: string }) {
  const supabase = await createClient();

  const { error } = await supabase.from("manual_shopping_items").delete().eq("id", params.id);

  if (error) throw new Error(error.message);

  revalidatePath("/shopping-list");
}

export async function resetShoppingListState(params: { planWeekId: string }) {
  const supabase = await createClient();

  // Clear recipe-driven tick state
  const { error: e1 } = await supabase
    .from("shopping_list_state")
    .delete()
    .eq("plan_week_id", params.planWeekId);

  if (e1) throw new Error(e1.message);

  // Clear manual-item tick state (but DO NOT delete the manual items themselves)
  const { error: e2 } = await supabase
    .from("manual_shopping_state")
    .delete()
    .eq("plan_week_id", params.planWeekId);

  if (e2) throw new Error(e2.message);

  revalidatePath("/shopping-list");
}
