"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Add-line state
  const [ingredientText, setIngredientText] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [unit, setUnit] = useState<string>("each");
  const [message, setMessage] = useState<string | null>(null);

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

  const ingredientByLabel = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const i of ingredients) {
      const label = `${i.name} (${i.category})`;
      map.set(label, i);
    }
    return map;
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

  async function loadAll() {
    setLoading(true);
    setMessage(null);

    const { data: r, error: rErr } = await supabase
      .from("recipes")
      .select("id,name,servings_default,instructions,meal_tags")
      .eq("id", recipeId)
      .maybeSingle();

    if (rErr) {
      setMessage("Error loading recipe: " + rErr.message);
      setLoading(false);
      return;
    }
    if (!r) {
      setRecipe(null);
      setLoading(false);
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
      setLoading(false);
      return;
    }

    // Supabase join can return ingredient as an array; normalise to a single object.
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
      setLoading(false);
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
      // Remove edits for rows that no longer exist
      for (const key of Object.keys(next)) {
        if (!normalisedItems.some((x) => x.id === key)) delete next[key];
      }
      return next;
    });

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
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

    setIngredientText("");
    setQty(1);
    setUnit("each");
    await loadAll();
    setMessage("Added.");
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

    await loadAll();

    const label = `${inserted!.name} (${inserted!.category})`;
    setIngredientText(label);
    setUnit(inserted!.default_unit || "each");
    setMessage(`Added ingredient: ${inserted!.name}`);
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

    // Store exactly as lowercase strings, multi-select allowed
    const cleaned = Array.from(
      new Set(
        mealTags
          .map((t) => String(t).trim().toLowerCase())
          .filter((t) => t.length > 0)
      )
    );

    const { error } = await supabase
      .from("recipes")
      .update({ meal_tags: cleaned })
      .eq("id", recipe.id);

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

    await loadAll();
  }

  async function deleteRow(it: RecipeItem) {
    const ok = confirm(`Remove "${it.ingredient?.name ?? "this item"}" from the recipe?`);
    if (!ok) return;

    const { error } = await supabase.from("recipe_items").delete().eq("id", it.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadAll();
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!recipe) return <div style={{ padding: 40 }}>Recipe not found.</div>;

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <a href="/recipes" style={{ textDecoration: "none" }}>
        ← Back to recipes
      </a>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>{recipe.name}</h1>
      <div style={{ marginTop: 6, color: "#666" }}>
        Default servings: {recipe.servings_default ?? "—"}
      </div>

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
            <input
              list="ingredient-options"
              value={ingredientText}
              onChange={(e) => {
                const v = e.target.value;
                setIngredientText(v);
                const sel = ingredientByLabel.get(v);
                if (sel) setUnit(sel.default_unit || "each");
              }}
              placeholder="Search ingredients (e.g. onion)…"
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            />
            <datalist id="ingredient-options">
              {ingredients.map((i) => {
                const label = `${i.name} (${i.category})`;
                return <option key={i.id} value={label} />;
              })}
            </datalist>
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #ccc",
                      borderRadius: 8,
                    }}
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
                    style={{
                      width: "100%",
                      padding: 10,
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
                </label>

                <button
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

          {message && (
            <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 10 }}>{message}</div>
          )}
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
                    justifyContent: "space-between",
                    gap: 12,
                    padding: 12,
                    borderTop: idx === 0 ? "none" : "1px solid #eee",
                    alignItems: "center",
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
                      <div style={{ fontSize: 12, color: "#b00020", marginTop: 6 }}>
                        {ed.error}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={ed.qty}
                      onChange={(e) => patchEditRow(it.id, { qty: e.target.value, error: null })}
                      style={{
                        width: 90,
                        padding: 8,
                        border: "1px solid #ccc",
                        borderRadius: 8,
                        textAlign: "right",
                      }}
                    />

                    <select
                      value={ed.unit}
                      onChange={(e) => patchEditRow(it.id, { unit: e.target.value, error: null })}
                      style={{ width: 110, padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => saveRow(it)}
                      disabled={ed.saving}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: ed.saving ? "#eee" : "#fff",
                        minWidth: 70,
                      }}
                    >
                      {ed.saving ? "Saving…" : "Save"}
                    </button>

                    <button
                      onClick={() => deleteRow(it)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "#fff",
                        color: "#666",
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
