"use client";

import { useMemo, useState } from "react";
import { setDinnerForDate, setPlanEntryForDate } from "./actions";

type Day = { dateOnly: string; dow: string; label: string };

type Recipe = {
  id: string;
  name: string;
  servings_default: number | null;
  meal_tags: string[] | null;
};

type MealKey = "breakfast" | "lunch" | "dinner" | "snack1" | "snack2";
type PersonKey = "charlie" | "lucy" | "shared";

// DB enum (confirmed)
type DbMeal = "breakfast" | "lunch" | "dinner" | "snack";

const MEALS: { key: MealKey; label: string; perPerson: boolean }[] = [
  { key: "breakfast", label: "Breakfast", perPerson: true },
  { key: "lunch", label: "Lunch", perPerson: true },
  { key: "dinner", label: "Dinner", perPerson: false },
  { key: "snack1", label: "Snack 1", perPerson: true },
  { key: "snack2", label: "Snack 2", perPerson: true },
];

const PEOPLE: { key: Exclude<PersonKey, "shared">; label: string }[] = [
  { key: "charlie", label: "Charlie" },
  { key: "lucy", label: "Lucy" },
];

function cellBg(isEmpty: boolean, isAutofilled: boolean) {
  if (isEmpty) return "bg-red-50";
  if (isAutofilled) return "bg-yellow-50";
  return "bg-green-50";
}

function normalise(s: string) {
  return (s ?? "").trim().toLowerCase();
}

function uiMealToDbMeal(meal: MealKey): DbMeal {
  if (meal === "snack1" || meal === "snack2") return "snack";
  return meal;
}

function mealTagForUiKey(meal: MealKey): "breakfast" | "lunch" | "dinner" | "snack" {
  if (meal === "snack1" || meal === "snack2") return "snack";
  return meal;
}

function hasTag(recipe: Recipe, tag: "breakfast" | "lunch" | "dinner" | "snack") {
  const tags = (recipe.meal_tags ?? []).map((t) => String(t).toLowerCase().trim());
  return tags.includes(tag);
}

function notesFor(meal: Exclude<MealKey, "dinner">, person: Exclude<PersonKey, "shared">): string {
  if (meal === "snack1" || meal === "snack2") return `${person}|${meal}`;
  return person;
}

function recipeListForTag(recipes: Recipe[], tag: "breakfast" | "lunch" | "dinner" | "snack") {
  const tagged = recipes.filter((r) => hasTag(r, tag));
  return tagged.length > 0 ? tagged : recipes;
}

export default function PlanGridClient(props: {
  planWeekId: string;
  days: Day[];
  recipes: Recipe[];
  initialNameByKey: Record<string, string>;
  lunchLeftoversFillByDate: Record<string, string>;
}) {
  // Apply initial leftovers autofill once; track which keys were autofilled so they show yellow
  const init = useMemo(() => {
    const next = { ...props.initialNameByKey };
    const auto = new Set<string>();

    for (const d of props.days) {
      const fillName = props.lunchLeftoversFillByDate[d.dateOnly] ?? "";
      if (!fillName) continue;

      for (const person of PEOPLE) {
        const k = `lunch|${person.key}|${d.dateOnly}`;
        if (!next[k]) {
          next[k] = fillName;
          auto.add(k);
        }
      }
    }

    return { next, auto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nameByKey, setNameByKey] = useState<Record<string, string>>(init.next);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [autofilledKeys, setAutofilledKeys] = useState<Set<string>>(init.auto);

  const recipeNames = useMemo(() => new Set(props.recipes.map((r) => r.name)), [props.recipes]);

  const recipeServingsByName = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of props.recipes) m.set(normalise(r.name), r.servings_default ?? null);
    return m;
  }, [props.recipes]);

  const dayIndexByDate = useMemo(() => {
    const m = new Map<string, number>();
    props.days.forEach((d, idx) => m.set(d.dateOnly, idx));
    return m;
  }, [props.days]);

  // Desktop datalist sources (tag-filtered)
  const recipesDinner = useMemo(() => recipeListForTag(props.recipes, "dinner"), [props.recipes]);
  const recipesBreakfast = useMemo(
    () => recipeListForTag(props.recipes, "breakfast"),
    [props.recipes]
  );
  const recipesLunch = useMemo(() => recipeListForTag(props.recipes, "lunch"), [props.recipes]);
  const recipesSnack = useMemo(() => recipeListForTag(props.recipes, "snack"), [props.recipes]);

  // --- Mobile bottom-sheet picker (scrollable) ---
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState<string>("");
  const [sheetQuery, setSheetQuery] = useState<string>("");

  const sheetMeta = useMemo(() => {
    if (!sheetKey) return null;
    const parts = sheetKey.split("|");
    if (parts.length !== 3) return null;
    return { meal: parts[0] as MealKey, person: parts[1] as PersonKey, dateOnly: parts[2] as string };
  }, [sheetKey]);

  const sheetTag = useMemo(() => {
    if (!sheetMeta) return "dinner" as const;
    return mealTagForUiKey(sheetMeta.meal);
  }, [sheetMeta]);

  const sheetOptions = useMemo(() => {
    if (!sheetMeta) return [];
    const base = recipeListForTag(props.recipes, sheetTag);
    const q = normalise(sheetQuery);
    const filtered = q ? base.filter((r) => normalise(r.name).includes(q)) : base;
    return filtered.slice(0, 60);
  }, [props.recipes, sheetMeta, sheetQuery, sheetTag]);

  function openSheet(key: string) {
    setSheetKey(key);
    setSheetQuery("");
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSheetKey("");
    setSheetQuery("");
  }

  function handlePerPersonChange(key: string, nextVal: string) {
    setNameByKey((prev) => ({ ...prev, [key]: nextVal }));
    if (autofilledKeys.has(key)) {
      setAutofilledKeys((old) => {
        const n = new Set(old);
        n.delete(key);
        return n;
      });
    }
  }

  async function saveDinner(dateOnly: string) {
    const k = `dinner|shared|${dateOnly}`;
    const recipeName = (nameByKey[k] ?? "").trim();

    setSavingKey(k);
    try {
      await setDinnerForDate({
        planWeekId: props.planWeekId,
        entryDate: dateOnly,
        recipeName,
      });

      // After saving dinner, auto-fill NEXT DAY lunch (UI-only) if servings > 2
      const idx = dayIndexByDate.get(dateOnly);
      if (idx !== undefined) {
        const nextDay = props.days[idx + 1];
        if (nextDay) {
          const servings = recipeServingsByName.get(normalise(recipeName)) ?? null;
          if (recipeName && servings !== null && servings > 2) {
            setNameByKey((prev) => {
              const updated = { ...prev };
              const newAutos: string[] = [];

              for (const person of PEOPLE) {
                const lk = `lunch|${person.key}|${nextDay.dateOnly}`;
                if (!updated[lk]) {
                  updated[lk] = recipeName;
                  newAutos.push(lk);
                }
              }

              if (newAutos.length) {
                setAutofilledKeys((old) => {
                  const n = new Set(old);
                  newAutos.forEach((x) => n.add(x));
                  return n;
                });
              }

              return updated;
            });
          }
        }
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to save dinner");
    } finally {
      setSavingKey(null);
    }
  }

  async function savePerPersonMeal(
    meal: Exclude<MealKey, "dinner">,
    person: Exclude<PersonKey, "shared">,
    dateOnly: string
  ) {
    const k = `${meal}|${person}|${dateOnly}`;
    const recipeName = (nameByKey[k] ?? "").trim();

    setSavingKey(k);
    try {
      await setPlanEntryForDate({
        planWeekId: props.planWeekId,
        entryDate: dateOnly,
        meal: uiMealToDbMeal(meal),
        recipeName,
        notes: notesFor(meal, person),
      });
    } catch (e: any) {
      alert(e?.message ?? `Failed to save ${meal}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function chooseFromSheet(chosen: string) {
    if (!sheetMeta) return;

    const { meal, person, dateOnly } = sheetMeta;
    const key = sheetKey;

    // Update UI
    handlePerPersonChange(key, chosen);

    try {
      setSavingKey(key);

      if (meal === "dinner") {
        await setDinnerForDate({
          planWeekId: props.planWeekId,
          entryDate: dateOnly,
          recipeName: chosen,
        });
      } else {
        const m = meal as Exclude<MealKey, "dinner">;
        const p = person as Exclude<PersonKey, "shared">;

        await setPlanEntryForDate({
          planWeekId: props.planWeekId,
          entryDate: dateOnly,
          meal: uiMealToDbMeal(m),
          recipeName: chosen,
          notes: notesFor(m, p),
        });
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    } finally {
      setSavingKey(null);
      closeSheet();
    }
  }

  const BottomSheet = () => {
    if (!sheetOpen || !sheetMeta) return null;

    const current = nameByKey[sheetKey] ?? "";

    return (
      <div className="fixed inset-0 z-50 md:hidden">
        {/* backdrop */}
        <button
          type="button"
          className="absolute inset-0 bg-black/30"
          onClick={closeSheet}
          aria-label="Close picker"
        />

        {/* sheet */}
        <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-lg border-t">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Pick {sheetMeta.meal === "snack1" || sheetMeta.meal === "snack2" ? "Snack" : sheetMeta.meal}
              </div>
              <div className="text-xs text-gray-500 truncate">
                Filter: <span className="font-medium">{sheetTag}</span> · {sheetMeta.person} · {sheetMeta.dateOnly}
              </div>
            </div>

            <button type="button" onClick={closeSheet} className="rounded border px-3 py-2 text-sm">
              Done
            </button>
          </div>

          <div className="p-3 space-y-2">
            <input
              value={sheetQuery}
              onChange={(e) => setSheetQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded border px-3 py-2 text-sm"
              autoFocus
            />

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => chooseFromSheet("Leftovers")}
              >
                Leftovers
              </button>

              {current.trim() !== "" && (
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm text-gray-700"
                  onClick={() => chooseFromSheet("")}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-[45vh] overflow-auto">
                {sheetOptions.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No matches.</div>
                ) : (
                  sheetOptions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => chooseFromSheet(r.name)}
                      className="w-full text-left px-3 py-3 border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">Servings: {r.servings_default ?? "—"}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="pb-2 text-xs text-gray-500">
              Showing {Math.min(sheetOptions.length, 60)} results.
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <BottomSheet />

      {/* MOBILE */}
      <div className="block md:hidden space-y-4">
        {props.days.map((d) => {
          const dinnerKey = `dinner|shared|${d.dateOnly}`;
          const dinnerVal = nameByKey[dinnerKey] ?? "";
          const dinnerEmpty = dinnerVal.trim() === "";
          const dinnerBg = cellBg(dinnerEmpty, false);

          return (
            <div key={d.dateOnly} className="rounded-lg border overflow-hidden">
              <div className="bg-gray-50 border-b p-3">
                <div className="text-sm font-medium">
                  {d.dow} <span className="text-gray-500 font-normal">{d.label}</span>
                </div>
              </div>

              <div className="p-3 space-y-4">
                {/* Dinner: use same bottom sheet too (so iOS can scroll dinners) */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Dinner</div>

                  <button
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-sm text-left ${dinnerBg}`}
                    onClick={() => openSheet(dinnerKey)}
                  >
                    {dinnerVal ? dinnerVal : <span className="text-gray-400">Select recipe</span>}
                  </button>

                  <div className="text-xs text-gray-500">{savingKey === dinnerKey ? "Saving…" : ""}</div>

                  {dinnerVal && !recipeNames.has(dinnerVal) && (
                    <div className="text-xs text-amber-700">Not in recipes list</div>
                  )}
                </div>

                {/* Per-person meals (mobile uses bottom sheet) */}
                {MEALS.filter((m) => m.perPerson).map((meal) => (
                  <div key={meal.key} className="space-y-2">
                    <div className="text-sm font-medium">{meal.label}</div>

                    <div className="grid grid-cols-1 gap-2">
                      {PEOPLE.map((p) => {
                        const k = `${meal.key}|${p.key}|${d.dateOnly}`;
                        const val = nameByKey[k] ?? "";
                        const isEmpty = val.trim() === "";
                        const isAutofilled = autofilledKeys.has(k);
                        const bg = cellBg(isEmpty, isAutofilled);

                        return (
                          <div key={k} className="space-y-1">
                            <div className="text-xs text-gray-500">{p.label}</div>

                            <button
                              type="button"
                              className={`w-full rounded border px-3 py-2 text-sm text-left ${bg}`}
                              onClick={() => openSheet(k)}
                            >
                              {val ? val : <span className="text-gray-400">Select</span>}
                            </button>

                            <div className="text-xs text-gray-500">{savingKey === k ? "Saving…" : ""}</div>

                            {val && val !== "Leftovers" && !recipeNames.has(val) && (
                              <div className="text-xs text-amber-700">Not in recipes list</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="grid grid-cols-8 bg-gray-50 border-b">
          <div className="p-3 text-sm font-medium">Meal</div>
          {props.days.map((d) => (
            <div key={d.dateOnly} className="p-3 text-sm font-medium">
              <div>{d.dow}</div>
              <div className="text-gray-500">{d.label}</div>
            </div>
          ))}
        </div>

        {MEALS.map((meal) => {
          if (!meal.perPerson) {
            return (
              <div key={meal.key} className="grid grid-cols-8 border-b last:border-b-0">
                <div className="p-3 text-sm font-medium border-r">{meal.label}</div>

                {props.days.map((d) => {
                  const k = `${meal.key}|shared|${d.dateOnly}`;
                  const val = nameByKey[k] ?? "";
                  const isEmpty = val.trim() === "";
                  const bg = cellBg(isEmpty, false);

                  return (
                    <div key={k} className="p-3 border-r last:border-r-0 text-sm">
                      <input
                        className={`w-full rounded border px-2 py-1 text-sm ${bg}`}
                        list="dinner-recipes-list-desktop"
                        value={val}
                        placeholder="Select recipe"
                        onChange={(e) => setNameByKey((prev) => ({ ...prev, [k]: e.target.value }))}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={() => saveDinner(d.dateOnly)}
                      />
                      <div className="mt-1 text-xs text-gray-500">{savingKey === k ? "Saving…" : ""}</div>
                      {val && !recipeNames.has(val) && (
                        <div className="mt-1 text-xs text-amber-700">Not in recipes list</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          const listId =
            meal.key === "breakfast"
              ? "breakfast-recipes-list-desktop"
              : meal.key === "lunch"
              ? "lunch-recipes-list-desktop"
              : "snack-recipes-list-desktop";

          return (
            <div key={meal.key} className="border-b last:border-b-0">
              {PEOPLE.map((p, idx) => (
                <div key={p.key} className="grid grid-cols-8">
                  <div className="p-3 text-sm font-medium border-r">
                    {meal.label}
                    <div className="text-xs text-gray-500">{p.label}</div>
                  </div>

                  {props.days.map((d) => {
                    const k = `${meal.key}|${p.key}|${d.dateOnly}`;
                    const val = nameByKey[k] ?? "";
                    const isEmpty = val.trim() === "";
                    const isAutofilled = autofilledKeys.has(k);
                    const bg = cellBg(isEmpty, isAutofilled);

                    return (
                      <div
                        key={k}
                        className={[
                          "p-3 border-r last:border-r-0 text-sm",
                          idx === 0 ? "border-b" : "",
                        ].join(" ")}
                      >
                        <input
                          className={`w-full rounded border px-2 py-1 text-sm ${bg}`}
                          list={listId}
                          value={val}
                          placeholder="Select"
                          onChange={(e) => handlePerPersonChange(k, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() =>
                            savePerPersonMeal(meal.key as Exclude<MealKey, "dinner">, p.key, d.dateOnly)
                          }
                        />

                        <div className="mt-1 text-xs text-gray-500">{savingKey === k ? "Saving…" : ""}</div>

                        {val && val !== "Leftovers" && !recipeNames.has(val) && (
                          <div className="mt-1 text-xs text-amber-700">Not in recipes list</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}

        {/* Desktop datalists (filtered by meal tag) */}
        <datalist id="dinner-recipes-list-desktop">
          {recipesDinner.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>

        <datalist id="breakfast-recipes-list-desktop">
          <option value="Leftovers" />
          {recipesBreakfast.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>

        <datalist id="lunch-recipes-list-desktop">
          <option value="Leftovers" />
          {recipesLunch.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>

        <datalist id="snack-recipes-list-desktop">
          <option value="Leftovers" />
          {recipesSnack.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
      </div>
    </>
  );
}