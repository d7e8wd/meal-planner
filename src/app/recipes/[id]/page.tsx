"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AddToPlan from "./AddToPlan";

type Recipe = {
  id: string;
  name: string;
  servings_default: number | null;
  instructions: string | null;
  meal_tags: string[] | null;
};

type Ingredient = {
  id: string;
  name: string;
  category: string;
  default_unit: string;
};

type RecipeItem = {
  id: string;
  qty: number;
  unit: string;
  ingredient_id: string;
  ingredient: { id: string; name: string; category: string } | null;
};

function normaliseName(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function stripCategoryLabel(s: string) {
  const m = s.match(/^(.*)\s+\([^()]+\)\s*$/);
  return m ? m[1].trim() : s.trim();
}

function norm(s: string) {
  return (s ?? "").trim().toLowerCase();
}

const UNIT_OPTIONS = [
  "each",
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "pinch",
  "jar",
  "tub",
  "tin",
  "can",
  "bottle",
  "packet",
  "pack",
  "bag",
  "box",
  "cube",
  "sachet",
  "slice",
  "clove",
  "bunch",
] as const;

const TAG_OPTIONS = ["breakfast", "lunch", "dinner", "snack"] as const;

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const recipeId = params.id;

  // Only for initial load (do NOT flip this during add/save/delete)
  const [initialLoading, setInitialLoading] = useState(true);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Add-line state
  const [ingredientText, setIngredientText] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [unit, setUnit] = useState<string>("each");
  const [message, setMessage] = useState<string | null>(null);

  // Inline dropdown state (replaces <datalist>)
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const ingredientInputRef = useRef<HTMLInputElement | null>(null);
  const blurCloseTimer = useRef<number | null>(null);

  // Inline add-new-ingredient state
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newCategory, setNewCategory] = useState("Other");
  const [newDefaultUnit, setNewDefaultUnit] = useState("each");

  // Instructions editor
  const [instructions, setInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  // Meal tags editor
  const [mealTags, setMealTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Per-row edit state
  const [editById, setEditById] = useState<
    Record<
      string,
      {
        qty: string;
        unit: string;
        saving: boolean;
        error: string | null;
      }
    >
  >({});

  // Mobile detection for ingredient-row wrapping
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const ingredientByLabel = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const i of ingredients) {
      const label = `${i.name} (${i.category})`;
      map.set(label, i);
    }
    return map;
  }, [ingredients]);

  const ingredientOptions = useMemo(() => {
    return ingredients.map((i) => {
      const label = `${i.name} (${i.category})`;
      const search = `${i.name} ${i.category}`.toLowerCase();
      return { ingredient: i, label, search };
    });
  }, [ingredients]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of ingredients) set.add(i.category || "Other");
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (!arr.includes("Other")) arr.push("Other");
    return arr;
  }, [ingredients]);

  const selectedIngredient = useMemo(() => {
    return ingredientByLabel.get(ingredientText) ?? null;
  }, [ingredientByLabel, ingredientText]);

  const typedName = useMemo(() => {
    return normaliseName(stripCategoryLabel(ingredientText));
  }, [ingredientText]);

  const showAddIngredientPanel = useMemo(() => {
    return typedName.length > 0 && !selectedIngredient;
  }, [typedName, selectedIngredient]);

  const filteredIngredientOptions = useMemo(() => {
    const q = norm(ingredientText);
    const base = q ? ingredientOptions.filter((o) => o.search.includes(q)) : ingredientOptions;
    return base.slice(0, 50);
  }, [ingredientOptions, ingredientText]);

  function openPicker() {
    if (blurCloseTimer.current) {
      window.clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
    setIsPickerOpen(true);
  }

  function scheduleClosePicker() {
    if (blurCloseTimer.current) window.clearTimeout(blurCloseTimer.current);
    blurCloseTimer.current = window.setTimeout(() => {
      setIsPickerOpen(false);
      blurCloseTimer.current = null;
    }, 120);
  }

  function selectIngredientOption(label: string, ing: Ingredient) {
    setIngredientText(label);
    setUnit(ing.default_unit || "each");
    setIsPickerOpen(false);
    requestAnimationFrame(() => ingredientInputRef.current?.focus());
  }

  async function fetchAll(soft: boolean) {
    if (!soft) {
      setInitialLoading(true);
      setMessage(null);
    }

    const { data: r, error: rErr } = await supabase
      .from("recipes")
      .select("id,name,servings_default,instructions,meal_tags")
      .eq("id", recipeId)
      .maybeSingle();

    if (rErr) {
      setMessage("Error loading recipe: " + rErr.message);
      if (!soft) setInitialLoading(false);
      return;
    }
    if (!r) {
      setRecipe(null);
      if (!soft) setInitialLoading(false);
      return;
    }

    const rec = r as Recipe;
    setRecipe(rec);
    setInstructions((rec.instructions ?? "") as string);
    setMealTags(((rec.meal_tags ?? []) as string[]) ?? []);

    const { data: it, error: itErr } = await supabase
      .from("recipe_items")
      .select("id,qty,unit,ingredient_id, ingredient:ingredients(id,name,category)")
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });

    if (itErr) {
      setMessage("Error loading items: " + itErr.message);
      if (!soft) setInitialLoading(false);
      return;
    }

    const normalisedItems: RecipeItem[] = (it ?? []).map((row: any) => ({
      id: row.id,
      qty: row.qty,
      unit: row.unit,
      ingredient_id: row.ingredient_id,
      ingredient: Array.isArray(row.ingredient) ? row.ingredient[0] : row.ingredient,
    }));

    setItems(normalisedItems);

    const { data: ing, error: ingErr } = await supabase
      .from("ingredients")
      .select("id,name,category,default_unit")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (ingErr) {
      setMessage("Error loading ingredients: " + ingErr.message);
      if (!soft) setInitialLoading(false);
      return;
    }

    setIngredients((ing ?? []) as Ingredient[]);

    // Initialise edit state for current rows (don’t clobber existing edits)
    setEditById((prev) => {
      const next = { ...prev };
      for (const row of normalisedItems) {
        if (!next[row.id]) {
          next[row.id] = {
            qty: String(row.qty ?? ""),
            unit: row.unit ?? "each",
            saving: false,
            error: null,
          };
        }
      }
      for (const key of Object.keys(next)) {
        if (!normalisedItems.some((x) => x.id === key)) delete next[key];
      }
      return next;
    });

    if (!soft) setInitialLoading(false);
  }

  useEffect(() => {
    fetchAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  async function addItem() {
    setMessage(null);

    const sel = ingredientByLabel.get(ingredientText);
    if (!sel) {
      setMessage("Pick an ingredient from the list, or add it below.");
      return;
    }
    if (!qty || qty <= 0) {
      setMessage("Quantity must be > 0.");
      return;
    }

    const finalUnit = unit || sel.default_unit || "each";

    const { error } = await supabase.from("recipe_items").insert({
      recipe_id: recipeId,
      ingredient_id: sel.id,
      qty,
      unit: finalUnit,
      sort_order: items.length + 1,
    });

    if (error) {
      setMessage("Error adding item: " + error.message);
      return;
    }

    // Keep user in place; do not flip page to "Loading…"
    setIngredientText("");
    setQty(1);
    setUnit("each");

    await fetchAll(true);
    setMessage("Added.");
    requestAnimationFrame(() => ingredientInputRef.current?.focus());
  }

  async function addNewIngredientToHousehold() {
    setMessage(null);

    const name = normaliseName(typedName);
    if (!name) return;

    setAddingIngredient(true);

    const { data: membership, error: memErr } = await supabase
      .from("household_members")
      .select("household_id")
      .limit(1)
      .maybeSingle();

    if (memErr) {
      setAddingIngredient(false);
      setMessage("Error finding household: " + memErr.message);
      return;
    }
    if (!membership?.household_id) {
      setAddingIngredient(false);
      setMessage("No household found for this user. Run /bootstrap first.");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("ingredients")
      .insert({
        household_id: membership.household_id,
        is_global: false,
        name,
        category: newCategory || "Other",
        default_unit: newDefaultUnit || "each",
      })
      .select("id,name,category,default_unit")
      .maybeSingle();

    setAddingIngredient(false);

    if (error) {
      setMessage("Error adding ingredient: " + error.message);
      return;
    }

    await fetchAll(true);

    const label = `${inserted!.name} (${inserted!.category})`;
    setIngredientText(label);
    setUnit(inserted!.default_unit || "each");
    setMessage(`Added ingredient: ${inserted!.name}`);
    requestAnimationFrame(() => ingredientInputRef.current?.focus());
  }

  async function saveRecipeInstructions() {
    if (!recipe) return;
    setMessage(null);
    setSavingInstructions(true);

    const { error } = await supabase.from("recipes").update({ instructions }).eq("id", recipe.id);

    setSavingInstructions(false);

    if (error) {
      setMessage("Error saving instructions: " + error.message);
      return;
    }

    setMessage("Instructions saved.");
  }

  async function saveMealTags() {
    if (!recipe) return;
    setMessage(null);
    setSavingTags(true);

    const cleaned = Array.from(
      new Set(mealTags.map((t) => String(t).trim().toLowerCase()).filter((t) => t.length > 0))
    );

    const { error } = await supabase.from("recipes").update({ meal_tags: cleaned }).eq("id", recipe.id);

    setSavingTags(false);

    if (error) {
      setMessage("Error saving tags: " + error.message);
      return;
    }

    setMessage("Tags saved.");
  }

  function patchEditRow(id: string, patch: Partial<(typeof editById)[string]>) {
    setEditById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { qty: "", unit: "each", saving: false, error: null }),
        ...patch,
      },
    }));
  }

  async function saveRow(it: RecipeItem) {
    const ed = editById[it.id];
    if (!ed) return;

    const qtyNum = Number(ed.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      patchEditRow(it.id, { error: "Qty must be a number > 0" });
      return;
    }

    patchEditRow(it.id, { saving: true, error: null });

    const { error } = await supabase
      .from("recipe_items")
      .update({ qty: qtyNum, unit: ed.unit ?? "each" })
      .eq("id", it.id);

    patchEditRow(it.id, { saving: false });

    if (error) {
      patchEditRow(it.id, { error: error.message });
      return;
    }

    await fetchAll(true);
  }

  async function deleteRow(it: RecipeItem) {
    const ok = confirm(`Remove "${it.ingredient?.name ?? "this item"}" from the recipe?`);
    if (!ok) return;

    const { error } = await supabase.from("recipe_items").delete().eq("id", it.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchAll(true);
  }

  // Close picker when tapping outside
  useEffect(() => {
    function onDocDown(e: MouseEvent | TouchEvent) {
      if (!isPickerOpen) return;
      const target = e.target as Node;
      const wrapper = ingredientInputRef.current?.parentElement;
      if (wrapper && !wrapper.contains(target)) setIsPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, [isPickerOpen]);

  if (initialLoading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!recipe) return <div style={{ padding: 40 }}>Recipe not found.</div>;

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <a href="/recipes" style={{ textDecoration: "none" }}>
        ← Back to recipes
      </a>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>{recipe.name}</h1>
      <div style={{ marginTop: 6, color: "#666" }}>Default servings: {recipe.servings_default ?? "—"}</div>

      <div style={{ marginTop: 14 }}>
        <AddToPlan recipeId={recipeId} />
      </div>

      {/* Meal tags */}
      <div style={{ marginTop: 22, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Meal tags</h2>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {TAG_OPTIONS.map((t) => {
            const checked = mealTags.includes(t);
            return (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? Array.from(new Set([...mealTags, t]))
                      : mealTags.filter((x) => x !== t);
                    setMealTags(next);
                  }}
                />
                <span style={{ textTransform: "capitalize" }}>{t}</span>
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={saveMealTags}
            disabled={savingTags}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              width: 180,
              background: savingTags ? "#eee" : "#fff",
            }}
          >
            {savingTags ? "Saving…" : "Save tags"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Instructions</h2>

        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Write the method here…"
          rows={10}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 8,
            fontFamily: "inherit",
          }}
        />

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={saveRecipeInstructions}
            disabled={savingInstructions}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              width: 180,
              background: savingInstructions ? "#eee" : "#fff",
            }}
          >
            {savingInstructions ? "Saving…" : "Save instructions"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Add ingredient line</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Ingredient (type to search)</div>

            <div style={{ position: "relative" }}>
              <input
                ref={ingredientInputRef}
                value={ingredientText}
                onChange={(e) => {
                  const v = e.target.value;
                  setIngredientText(v);
                  const sel = ingredientByLabel.get(v);
                  if (sel) setUnit(sel.default_unit || "each");
                  setIsPickerOpen(true);
                }}
                onFocus={() => openPicker()}
                onBlur={() => scheduleClosePicker()}
                placeholder="Search ingredients (e.g. onion)…"
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
              />

              {isPickerOpen && filteredIngredientOptions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {filteredIngredientOptions.map((opt, i) => (
                    <div
                      key={opt.ingredient.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectIngredientOption(opt.label, opt.ingredient);
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        borderTop: i === 0 ? "none" : "1px solid #f2f2f2",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{opt.ingredient.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{opt.ingredient.category}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </label>

          {showAddIngredientPanel && (
            <div style={{ padding: 12, border: "1px dashed #bbb", borderRadius: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Not found: <span style={{ fontFamily: "monospace" }}>{typedName}</span>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 240px" }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>Category</div>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ flex: "0 0 160px" }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>Default unit</div>
                  <select
                    value={newDefaultUnit}
                    onChange={(e) => setNewDefaultUnit(e.target.value)}
                    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={addNewIngredientToHousehold}
                  disabled={addingIngredient}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    width: 220,
                    height: 42,
                    alignSelf: "end",
                    background: addingIngredient ? "#eee" : "#fff",
                  }}
                >
                  {addingIngredient ? "Adding…" : `Add "${typedName}"`}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "0 0 160px" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Qty</div>
              <input
                type="number"
                step="0.1"
                min="0"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
              />
            </label>

            <label style={{ flex: "0 0 160px" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Unit</div>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={addItem}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                width: 160,
                height: 42,
                alignSelf: "end",
              }}
            >
              Add line
            </button>
          </div>

          {message && <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 10 }}>{message}</div>}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Ingredients</h2>

        {items.length === 0 ? (
          <p>No ingredient lines yet.</p>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
            {items.map((it, idx) => {
              const ed =
                editById[it.id] ?? {
                  qty: String(it.qty ?? ""),
                  unit: it.unit ?? "each",
                  saving: false,
                  error: null,
                };

              return (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between",
                    gap: isMobile ? 10 : 12,
                    padding: 12,
                    borderTop: idx === 0 ? "none" : "1px solid #eee",
                    alignItems: isMobile ? "stretch" : "center",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.ingredient?.name ?? it.ingredient_id}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>
                      {it.ingredient?.category ?? ""}
                    </div>
                    {ed.error ? (
                      <div style={{ fontSize: 12, color: "#b00020", marginTop: 6 }}>{ed.error}</div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: isMobile ? "flex-start" : "flex-end",
                    }}
                  >
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={ed.qty}
                      onChange={(e) => patchEditRow(it.id, { qty: e.target.value, error: null })}
                      style={{
                        width: isMobile ? "48%" : 90,
                        minWidth: isMobile ? 120 : 90,
                        padding: 8,
                        border: "1px solid #ccc",
                        borderRadius: 8,
                        textAlign: "right",
                      }}
                    />

                    <select
                      value={ed.unit}
                      onChange={(e) => patchEditRow(it.id, { unit: e.target.value, error: null })}
                      style={{
                        width: isMobile ? "48%" : 110,
                        minWidth: isMobile ? 140 : 110,
                        padding: 8,
                        border: "1px solid #ccc",
                        borderRadius: 8,
                      }}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => saveRow(it)}
                      disabled={ed.saving}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: ed.saving ? "#eee" : "#fff",
                        minWidth: isMobile ? "48%" : 70,
                      }}
                    >
                      {ed.saving ? "Saving…" : "Save"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteRow(it)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "#fff",
                        color: "#666",
                        minWidth: isMobile ? "48%" : undefined,
                      }}
                      title="Remove this line"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}