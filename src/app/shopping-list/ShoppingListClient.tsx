"use client";

import { useMemo, useState, useTransition } from "react";
import { setShoppingState } from "./actions";

type Row = {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_category: string;
  unit: string;
  total_qty: number;

  // persisted state
  in_cupboard: boolean;
  in_trolley: boolean;
};

function formatQty(qty: number) {
  if (!Number.isFinite(qty)) return "";
  // Simple MVP formatting: whole numbers if close, else 2dp
  const rounded = Math.round(qty * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

// “Supermarket sections” for now = your ingredient_category, with a preferred order.
// You can tweak this list any time without touching DB.
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

  const visibleRows = useMemo(() => {
    let r = rows;

    // Ready-to-shop mode hides cupboard items by default
    if (mode === "shop" && !showCupboard) {
      r = r.filter((x) => !x.in_cupboard);
    }

    // Sort:
    // 1) section order
    // 2) within section: in_trolley last
    // 3) then name
    return [...r].sort((a, b) => {
      const sa = sectionRank(a.ingredient_category);
      const sb = sectionRank(b.ingredient_category);
      if (sa !== sb) return sa - sb;

      if (a.ingredient_category !== b.ingredient_category) {
        return a.ingredient_category.localeCompare(b.ingredient_category);
      }

      // trolley items last
      if (a.in_trolley !== b.in_trolley) return a.in_trolley ? 1 : -1;

      return a.ingredient_name.localeCompare(b.ingredient_name);
    });
  }, [rows, mode, showCupboard]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of visibleRows) {
      const key = r.ingredient_category || "Other";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    // order group keys by rank then alpha
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ra = sectionRank(a);
      const rb = sectionRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ section: k, items: map.get(k)! }));
  }, [visibleRows]);

  function updateLocal(ingredientId: string, unit: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) =>
        r.ingredient_id === ingredientId && r.unit === unit ? { ...r, ...patch } : r
      )
    );
  }

  function toggleCupboard(r: Row, next: boolean) {
    updateLocal(r.ingredient_id, r.unit, { in_cupboard: next });

    startTransition(async () => {
      try {
        await setShoppingState({
          planWeekId: props.planWeekId,
          ingredientId: r.ingredient_id,
          unit: r.unit,
          inCupboard: next,
        });
      } catch (e: any) {
        // revert if save fails
        updateLocal(r.ingredient_id, r.unit, { in_cupboard: r.in_cupboard });
        alert(e?.message ?? "Failed saving cupboard state");
      }
    });
  }

  function toggleTrolley(r: Row, next: boolean) {
    updateLocal(r.ingredient_id, r.unit, { in_trolley: next });

    startTransition(async () => {
      try {
        await setShoppingState({
          planWeekId: props.planWeekId,
          ingredientId: r.ingredient_id,
          unit: r.unit,
          inTrolley: next,
        });
      } catch (e: any) {
        updateLocal(r.ingredient_id, r.unit, { in_trolley: r.in_trolley });
        alert(e?.message ?? "Failed saving trolley state");
      }
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Shopping List</h1>
        <div className="text-sm text-gray-500">
          Week starting {props.weekStart} • Dinners: {props.dinnersCount}
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
          onClick={() => window.print()}
          className="ml-auto text-sm underline"
        >
          Print
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-sm">No ingredients found.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.section} className="rounded border overflow-hidden">
              <div className="bg-gray-50 border-b px-3 py-2 text-sm font-medium">
                {g.section}
              </div>

              <div className="divide-y">
                {g.items.map((r) => {
                  const crossed = mode === "shop" && r.in_trolley;
                  return (
                    <div key={`${r.ingredient_id}||${r.unit}`} className="flex items-start gap-3 p-3">
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
                          {r.ingredient_name}
                        </div>
                        <div className={`text-xs ${crossed ? "text-gray-300" : "text-gray-500"}`}>
                          {formatQty(r.total_qty)} {r.unit}
                          {r.unit ? "" : ""}
                        </div>
                      </div>

                      {/* Cupboard checkbox */}
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!r.in_cupboard}
                          onChange={(e) => toggleCupboard(r, e.target.checked)}
                          aria-label="In cupboard"
                        />
                        In cupboard
                      </label>
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
