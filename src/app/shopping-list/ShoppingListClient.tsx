"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addManualItem,
  deleteManualItem,
  resetShoppingListState,
  setManualItemState,
  setShoppingState,
} from "./actions";

type IngredientRow = {
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

type Row = IngredientRow | ManualRow;

function formatQty(qty: number) {
  if (!Number.isFinite(qty)) return "";
  const rounded = Math.round(qty * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

const SECTION_ORDER = [
  "Fruit",
  "Veg",
  "Vegetables",
  "Meat",
  "Fish",
  "Dairy",
  "Bakery",
  "Frozen",
  "Tins",
  "Cans",
  "Dry",
  "Pasta",
  "Rice",
  "Spices",
  "Sauces",
  "Snacks",
  "Drinks",
  "Other",
];

function sectionRank(section: string) {
  const idx = SECTION_ORDER.findIndex((s) => s.toLowerCase() === section.toLowerCase());
  return idx === -1 ? 999 : idx;
}

function rowKey(r: Row) {
  if (r.kind === "ingredient") return `i:${r.ingredient_id}||${r.unit ?? ""}`;
  return `m:${r.manual_item_id}`;
}

function rowCategory(r: Row) {
  return r.kind === "ingredient" ? r.ingredient_category || "Other" : r.category || "Other";
}

function rowName(r: Row) {
  return r.kind === "ingredient" ? r.ingredient_name : r.name;
}

function rowUnit(r: Row) {
  return r.unit ?? "";
}

function rowQtyText(r: Row) {
  if (r.kind === "ingredient") {
    return `${formatQty(r.total_qty)} ${rowUnit(r)}`.trim();
  }
  if (typeof r.qty === "number" && Number.isFinite(r.qty)) {
    return `${formatQty(r.qty)} ${rowUnit(r)}`.trim();
  }
  // manual item with no qty: show unit if provided, else nothing
  return rowUnit(r) ? rowUnit(r) : "";
}

export default function ShoppingListClient(props: {
  weekStart: string;
  dinnersCount: number;
  planWeekId: string;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(props.initialRows);
  const [mode, setMode] = useState<"prelim" | "shop">("prelim");
  const [showCupboard, setShowCupboard] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Add-item form state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCarryForward, setNewCarryForward] = useState(false);

  const visibleRows = useMemo(() => {
    let r = rows;

    if (mode === "shop" && !showCupboard) {
      r = r.filter((x) => !x.in_cupboard);
    }

    return [...r].sort((a, b) => {
      const ca = rowCategory(a);
      const cb = rowCategory(b);

      const sa = sectionRank(ca);
      const sb = sectionRank(cb);
      if (sa !== sb) return sa - sb;

      if (ca !== cb) return ca.localeCompare(cb);

      // trolley items last
      if (a.in_trolley !== b.in_trolley) return a.in_trolley ? 1 : -1;

      return rowName(a).localeCompare(rowName(b));
    });
  }, [rows, mode, showCupboard]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of visibleRows) {
      const key = rowCategory(r) || "Other";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ra = sectionRank(a);
      const rb = sectionRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ section: k, items: map.get(k)! }));
  }, [visibleRows]);

  function updateLocal(predicate: (r: Row) => boolean, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (predicate(r) ? ({ ...r, ...patch } as Row) : r)));
  }

  function toggleCupboard(r: Row, next: boolean) {
    // optimistic update
    updateLocal((x) => rowKey(x) === rowKey(r), { in_cupboard: next });

    startTransition(async () => {
      try {
        if (r.kind === "ingredient") {
          await setShoppingState({
            planWeekId: props.planWeekId,
            ingredientId: r.ingredient_id,
            unit: r.unit,
            inCupboard: next,
          });
        } else {
          await setManualItemState({
            planWeekId: props.planWeekId,
            manualItemId: r.manual_item_id,
            inCupboard: next,
          });
        }
      } catch (e: any) {
        // revert
        updateLocal((x) => rowKey(x) === rowKey(r), { in_cupboard: r.in_cupboard });
        alert(e?.message ?? "Failed saving cupboard state");
      }
    });
  }

  function toggleTrolley(r: Row, next: boolean) {
    updateLocal((x) => rowKey(x) === rowKey(r), { in_trolley: next });

    startTransition(async () => {
      try {
        if (r.kind === "ingredient") {
          await setShoppingState({
            planWeekId: props.planWeekId,
            ingredientId: r.ingredient_id,
            unit: r.unit,
            inTrolley: next,
          });
        } else {
          await setManualItemState({
            planWeekId: props.planWeekId,
            manualItemId: r.manual_item_id,
            inTrolley: next,
          });
        }
      } catch (e: any) {
        updateLocal((x) => rowKey(x) === rowKey(r), { in_trolley: r.in_trolley });
        alert(e?.message ?? "Failed saving trolley state");
      }
    });
  }

  function onReset() {
    const ok = confirm(
      "Reset shopping list?\n\nThis will clear all 'in trolley' and 'in cupboard' ticks for this week, and rebuild the list from the current plan (manual items remain)."
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await resetShoppingListState({ planWeekId: props.planWeekId });
        window.location.reload();
      } catch (e: any) {
        alert(e?.message ?? "Failed to reset shopping list");
      }
    });
  }

  function onAddManual() {
    const name = newName.trim();
    if (!name) {
      alert("Please enter an item name");
      return;
    }

    const qtyNum =
      newQty.trim() === ""
        ? null
        : Number.isFinite(Number(newQty))
        ? Number(newQty)
        : NaN;

    if (qtyNum !== null && !Number.isFinite(qtyNum)) {
      alert("Qty must be a number (or leave it blank)");
      return;
    }

    startTransition(async () => {
      try {
        await addManualItem({
          planWeekId: props.planWeekId,
          name,
          category: newCategory.trim() || "Other",
          qty: qtyNum,
          unit: newUnit.trim(),
          carryForward: newCarryForward,
        });

        // Clear form + reload to pull from server (keeps SSR truth as source)
        setNewName("");
        setNewQty("");
        setNewUnit("");
        setNewCarryForward(false);
        window.location.reload();
      } catch (e: any) {
        alert(e?.message ?? "Failed adding item");
      }
    });
  }

  function onDeleteManual(id: string) {
    const ok = confirm("Delete this manual item?");
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteManualItem({ id });
        window.location.reload();
      } catch (e: any) {
        alert(e?.message ?? "Failed deleting item");
      }
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Shopping List</h1>
        <div className="text-sm text-gray-500">
          Week starting {props.weekStart} • Dinners: {props.dinnersCount}
        </div>
      </div>

      {/* Add manual item */}
      <div className="rounded border p-3 space-y-2">
        <div className="text-sm font-medium">Add item</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="border rounded px-2 py-1 text-sm flex-1 min-w-[180px]"
            placeholder="e.g. toilet roll"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <input
            className="border rounded px-2 py-1 text-sm w-[110px]"
            placeholder="Qty"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
          />

          <input
            className="border rounded px-2 py-1 text-sm w-[110px]"
            placeholder="Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          />

          <input
            className="border rounded px-2 py-1 text-sm w-[150px]"
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={newCarryForward}
              onChange={(e) => setNewCarryForward(e.target.checked)}
            />
            Carry forward
          </label>

          <button
            type="button"
            onClick={onAddManual}
            disabled={isPending}
            className="text-sm border rounded px-3 py-1 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Tip: leave Qty blank for things like “toothpaste” or “bin bags”.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded border overflow-hidden text-sm">
          <button
            className={`px-3 py-2 ${mode === "prelim" ? "bg-gray-900 text-white" : "bg-white"}`}
            onClick={() => setMode("prelim")}
            type="button"
          >
            Prelim check
          </button>
          <button
            className={`px-3 py-2 ${mode === "shop" ? "bg-gray-900 text-white" : "bg-white"}`}
            onClick={() => setMode("shop")}
            type="button"
          >
            Ready to shop
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showCupboard}
            onChange={(e) => setShowCupboard(e.target.checked)}
          />
          Show cupboard items
        </label>

        {isPending ? (
          <span className="text-sm text-gray-500">Saving…</span>
        ) : (
          <span className="text-sm text-gray-500"> </span>
        )}

        <button
          type="button"
          onClick={onReset}
          disabled={isPending}
          className="ml-auto text-sm underline disabled:opacity-50"
          title="Clears all ticks for this week and rebuilds from the current plan (manual items remain)"
        >
          Reset Shopping List
        </button>

        <button type="button" onClick={() => window.print()} className="text-sm underline">
          Print
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-sm">No items found.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.section} className="rounded border overflow-hidden">
              <div className="bg-gray-50 border-b px-3 py-2 text-sm font-medium">{g.section}</div>

              <div className="divide-y">
                {g.items.map((r) => {
                  const crossed = mode === "shop" && r.in_trolley;
                  return (
                    <div key={rowKey(r)} className="flex items-start gap-3 p-3">
                      {/* Trolley checkbox */}
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={!!r.in_trolley}
                          onChange={(e) => toggleTrolley(r, e.target.checked)}
                          aria-label="In trolley"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className={`font-medium ${crossed ? "line-through text-gray-400" : ""}`}>
                          {rowName(r)}
                          {r.kind === "manual" ? (
                            <span className="ml-2 text-[11px] text-gray-400">(manual)</span>
                          ) : null}
                        </div>
                        <div className={`text-xs ${crossed ? "text-gray-300" : "text-gray-500"}`}>
                          {rowQtyText(r)}
                        </div>
                      </div>

                      {/* Right-side controls */}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={!!r.in_cupboard}
                            onChange={(e) => toggleCupboard(r, e.target.checked)}
                            aria-label="In cupboard"
                          />
                          In cupboard
                        </label>

                        {r.kind === "manual" ? (
                          <button
                            type="button"
                            onClick={() => onDeleteManual(r.manual_item_id)}
                            className="text-xs text-gray-400 hover:text-gray-700"
                            title="Delete manual item"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
