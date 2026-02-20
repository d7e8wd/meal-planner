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

// IMPORTANT: DB enum values (confirmed)
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
  const tags = (recipe.meal_tags ?? []).map((t) => String(t).toLowerCase());
  return tags.includes(tag);
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

  // ----- Mobile picker modal state -----
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState<string>("");
  const [pickerMeal, setPickerMeal] = useState<MealKey>("dinner");
  const [pickerPerson, setPickerPerson] = useState<PersonKey>("shared");
  const [pickerDate, setPickerDate] = useState<string>("");
  const [pickerQuery, setPickerQuery] = useState<string>("");

  const pickerTag = useMemo(() => mealTagForUiKey(pickerMeal), [pickerMeal]);

  const pickerOptions = useMemo(() => {
    const q = normalise(pickerQuery);

    const tagged = props.recipes.filter((r) => hasTag(r, pickerTag));
    const base = tagged.length > 0 ? tagged : props.recipes;

    const filtered = q ? base.filter((r) => normalise(r.name).includes(q)) : base;
    return filtered.slice(0, 40);
  }, [props.recipes, pickerQuery, pickerTag]);

  function openPicker(opts: { key: string; meal: MealKey; person: PersonKey; dateOnly: string }) {
    setPickerKey(opts.key);
    setPickerMeal(opts.meal);
    setPickerPerson(opts.person);
    setPickerDate(opts.dateOnly);
    setPickerQuery("");
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerKey("");
    setPickerQuery("");
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
        person,
        recipeName,
        // NOTE: snack1/snack2 distinction is already handled server-side via notes in your agreed approach,
        // but if your server action expects notes keys, it will derive from person + slot.
      });
    } catch (e: any) {
      alert(e?.message ?? `Failed to save ${meal}`);
    } finally {
      setSavingKey(null);
    }
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

  async function chooseValueFromPicker(chosen: string) {
    const key = pickerKey;
    if (!key) return;

    setNameByKey((prev) => ({ ...prev, [key]: chosen }));
    if (autofilledKeys.has(key)) {
      setAutofilledKeys((old) => {
        const n = new Set(old);
        n.delete(key);
        return n;
      });
    }

    try {
      setSavingKey(key);

      if (pickerMeal === "dinner") {
        await setDinnerForDate({
          planWeekId: props.planWeekId,
          entryDate: pickerDate,
          recipeName: chosen,
        });
      } else {
        const uiMeal = pickerMeal as Exclude<MealKey, "dinner">;
        const dbMeal = uiMealToDbMeal(uiMeal);
        const person = pickerPerson as Exclude<PersonKey, "shared">;

        await setPlanEntryForDate({
          planWeekId: props.planWeekId,
          entryDate: pickerDate,
          meal: dbMeal,
          person,
          recipeName: chosen,
        });
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    } finally {
      setSavingKey(null);
      closePicker();
    }
  }

  return (
    <>
      {/* MOBILE PICKER MODAL */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="p-4 border-b flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Pick {pickerMeal === "snack1" || pickerMeal === "snack2" ? "Snack" : pickerMeal}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {pickerPerson !== "shared" ? pickerPerson : "shared"} · {pickerDate}
              </div>
            </div>
            <button onClick={closePicker} className="rounded border px-3 py-2 text-sm">
              Close
            </button>
          </div>

          <div className="p-4 space-y-3">
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full rounded border px-3 py-2 text-sm"
            />

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => chooseValueFromPicker("Leftovers")}
                className="rounded border px-3 py-2 text-sm"
              >
                Leftovers
              </button>

              {pickerQuery.trim().length > 0 && (
                <button
                  onClick={() => chooseValueFromPicker(pickerQuery.trim())}
                  className="rounded border px-3 py-2 text-sm"
                >
                  Use “{pickerQuery.trim()}”
                </button>
              )}

              <button
                onClick={() => chooseValueFromPicker("")}
                className="rounded border px-3 py-2 text-sm text-gray-600"
              >
                Clear
              </button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              {pickerOptions.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No matches.</div>
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  {pickerOptions.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => chooseValueFromPicker(r.name)}
                      className="w-full text-left px-3 py-3 border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">
                        Servings: {r.servings_default ?? "—"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500">Filtered by tag: {pickerTag}</div>
          </div>
        </div>
      )}

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
                {/* Dinner */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Dinner</div>

                  <button
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-sm text-left ${dinnerBg}`}
                    onClick={() =>
                      openPicker({
                        key: dinnerKey,
                        meal: "dinner",
                        person: "shared",
                        dateOnly: d.dateOnly,
                      })
                    }
                  >
                    {dinnerVal ? dinnerVal : <span className="text-gray-400">Select recipe</span>}
                  </button>

                  <div className="text-xs text-gray-500">{savingKey === dinnerKey ? "Saving…" : ""}</div>

                  {dinnerVal && !recipeNames.has(dinnerVal) && (
                    <div className="text-xs text-amber-700">Not in recipes list</div>
                  )}
                </div>

                {/* Per-person meals */}
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
                              onClick={() =>
                                openPicker({
                                  key: k,
                                  meal: meal.key,
                                  person: p.key,
                                  dateOnly: d.dateOnly,
                                })
                              }
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
                        list="dinner-recipes-list"
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
                          list="meal-recipes-list"
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

        <datalist id="dinner-recipes-list">
          {props.recipes.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>

        <datalist id="meal-recipes-list">
          <option value="Leftovers" />
          {props.recipes.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
      </div>
    </>
  );
}