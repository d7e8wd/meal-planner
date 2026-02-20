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
  // breakfast/lunch: "charlie" / "lucy"
  // snack1/snack2: "charlie|snack1" etc
  if (meal === "snack1" || meal === "snack2") return `${person}|${meal}`;
  return person;
}

function recipeListForTag(recipes: Recipe[], tag: "breakfast" | "lunch" | "dinner" | "snack") {
  const tagged = recipes.filter((r) => hasTag(r, tag));
  // If nothing is tagged yet, fall back to all recipes (better than an empty list)
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

  // Precomputed filtered lists for desktop datalists
  const recipesDinner = useMemo(() => recipeListForTag(props.recipes, "dinner"), [props.recipes]);
  const recipesBreakfast = useMemo(
    () => recipeListForTag(props.recipes, "breakfast"),
    [props.recipes]
  );
  const recipesLunch = useMemo(() => recipeListForTag(props.recipes, "lunch"), [props.recipes]);
  const recipesSnack = useMemo(() => recipeListForTag(props.recipes, "snack"), [props.recipes]);

  // --- Compact mobile picker state (inline under the active field) ---
  const [mobilePickerKey, setMobilePickerKey] = useState<string | null>(null);
  const [mobilePickerQuery, setMobilePickerQuery] = useState<string>("");

  const mobilePickerMeta = useMemo(() => {
    if (!mobilePickerKey) return null;
    // key format is always `${meal}|${person}|${dateOnly}`
    const parts = mobilePickerKey.split("|");
    if (parts.length !== 3) return null;
    const meal = parts[0] as MealKey;
    const person = parts[1] as PersonKey;
    const dateOnly = parts[2] as string;
    return { meal, person, dateOnly };
  }, [mobilePickerKey]);

  const mobilePickerOptions = useMemo(() => {
    if (!mobilePickerMeta) return [];
    const tag = mealTagForUiKey(mobilePickerMeta.meal);
    const base = recipeListForTag(props.recipes, tag);
    const q = normalise(mobilePickerQuery);
    const filtered = q ? base.filter((r) => normalise(r.name).includes(q)) : base;
    return filtered.slice(0, 30);
  }, [props.recipes, mobilePickerMeta, mobilePickerQuery]);

  function openMobilePicker(key: string) {
    setMobilePickerKey(key);
    setMobilePickerQuery("");
  }

  function closeMobilePicker() {
    setMobilePickerKey(null);
    setMobilePickerQuery("");
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

  async function chooseMobileValue(chosen: string) {
    if (!mobilePickerKey || !mobilePickerMeta) return;

    const key = mobilePickerKey;
    const { meal, person, dateOnly } = mobilePickerMeta;

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
      closeMobilePicker();
    }
  }

  function MobileInlinePicker() {
    if (!mobilePickerKey || !mobilePickerMeta) return null;

    const current = nameByKey[mobilePickerKey] ?? "";
    const tag = mealTagForUiKey(mobilePickerMeta.meal);

    return (
      <div className="mt-2 rounded-lg border bg-white p-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs text-gray-500">
            Filter: <span className="font-medium">{tag}</span>
          </div>
          <button
            type="button"
            onClick={closeMobilePicker}
            className="text-xs underline text-gray-600"
          >
            Close
          </button>
        </div>

        <input
          value={mobilePickerQuery}
          onChange={(e) => setMobilePickerQuery(e.target.value)}
          placeholder="Search…"
          className="w-full rounded border px-2 py-1 text-sm"
          autoFocus
        />

        <div className="mt-2 flex gap-2 flex-wrap">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => chooseMobileValue("Leftovers")}
          >
            Leftovers
          </button>

          {current.trim() !== "" && (
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs text-gray-700"
              onClick={() => chooseMobileValue("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-2 max-h-44 overflow-auto rounded border">
          {mobilePickerOptions.length === 0 ? (
            <div className="p-2 text-sm text-gray-500">No matches.</div>
          ) : (
            mobilePickerOptions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => chooseMobileValue(r.name)}
                className="w-full text-left px-2 py-2 border-b last:border-b-0 hover:bg-gray-50"
              >
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">Servings: {r.servings_default ?? "—"}</div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <>
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
                {/* Dinner (mobile uses normal input; iOS datalist is poor but dinner is one field) */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Dinner</div>
                  <input
                    className={`w-full rounded border px-3 py-2 text-sm ${dinnerBg}`}
                    list="dinner-recipes-list"
                    value={dinnerVal}
                    placeholder="Select recipe"
                    onChange={(e) => setNameByKey((prev) => ({ ...prev, [dinnerKey]: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => saveDinner(d.dateOnly)}
                  />
                  <div className="text-xs text-gray-500">{savingKey === dinnerKey ? "Saving…" : ""}</div>
                  {dinnerVal && !recipeNames.has(dinnerVal) && (
                    <div className="text-xs text-amber-700">Not in recipes list</div>
                  )}
                </div>

                {/* Per-person meals: tap-to-open compact inline picker */}
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

                        const pickerOpenHere = mobilePickerKey === k;

                        return (
                          <div key={k} className="space-y-1">
                            <div className="text-xs text-gray-500">{p.label}</div>

                            <button
                              type="button"
                              className={`w-full rounded border px-3 py-2 text-sm text-left ${bg}`}
                              onClick={() => (pickerOpenHere ? closeMobilePicker() : openMobilePicker(k))}
                            >
                              {val ? val : <span className="text-gray-400">Select</span>}
                            </button>

                            <div className="text-xs text-gray-500">{savingKey === k ? "Saving…" : ""}</div>

                            {pickerOpenHere && <MobileInlinePicker />}

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

        {/* Desktop-style datalists still exist; mobile per-person uses picker instead */}
        <datalist id="dinner-recipes-list">
          {recipesDinner.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
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
              : "snack-recipes-list-desktop"; // snack1/snack2 both use snack

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