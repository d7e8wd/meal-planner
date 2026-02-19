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

function mapMealToDb(meal: Exclude<MealKey, "dinner">): "breakfast" | "lunch" | "snack" {
  if (meal === "breakfast") return "breakfast";
  if (meal === "lunch") return "lunch";
  return "snack"; // snack1/snack2 both persist as "snack"
}

function buildNotes(
  meal: Exclude<MealKey, "dinner">,
  person: Exclude<PersonKey, "shared">
): string {
  // snacks need slot disambiguation; breakfast/lunch just store person
  if (meal === "snack1" || meal === "snack2") return `${person}|${meal}`;
  return person;
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

    // Leftovers stays UI-only (do not persist / do not add to shopping list)
    if (recipeName === "Leftovers") return;

    const dbMeal = mapMealToDb(meal);
    const notes = buildNotes(meal, person);

    setSavingKey(k);
    try {
      await setPlanEntryForDate({
        planWeekId: props.planWeekId,
        entryDate: dateOnly,
        meal: dbMeal,
        notes,
        recipeName,
      } as any);
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
                {/* Dinner (shared, persisted) */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Dinner</div>
                  <input
                    className={`w-full rounded border px-3 py-2 text-sm ${dinnerBg}`}
                    list="dinner-recipes-list"
                    value={dinnerVal}
                    placeholder="Select recipe"
                    onChange={(e) =>
                      setNameByKey((prev) => ({ ...prev, [dinnerKey]: e.target.value }))
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => saveDinner(d.dateOnly)}
                  />
                  <div className="text-xs text-gray-500">{savingKey === dinnerKey ? "Saving…" : ""}</div>
                  {dinnerVal && !recipeNames.has(dinnerVal) && (
                    <div className="text-xs text-amber-700">Not in recipes list</div>
                  )}
                </div>

                {/* Per-person meals (persisted; snacks enum-safe) */}
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
                            <input
                              className={`w-full rounded border px-3 py-2 text-sm ${bg}`}
                              list="meal-recipes-list"
                              value={val}
                              placeholder="Select"
                              onChange={(e) => handlePerPersonChange(k, e.target.value)}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() =>
                                savePerPersonMeal(
                                  meal.key as Exclude<MealKey, "dinner">,
                                  p.key,
                                  d.dateOnly
                                )
                              }
                            />
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
                            savePerPersonMeal(
                              meal.key as Exclude<MealKey, "dinner">,
                              p.key,
                              d.dateOnly
                            )
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
