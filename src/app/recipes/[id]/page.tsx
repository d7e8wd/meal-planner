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
      .select("id,name,servings_default,instructions")
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
    setRecipe(r as Recipe);
    setInstructions((r.instructions ?? "") as string);

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
    setItems((it ?? []) as RecipeItem[]);

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

    const { error } = await supabase
      .from("recipes")
      .update({ instructions })
      .eq("id", recipe.id);

    setSavingInstructions(false);

    if (error) {
      setMessage("Error saving instructions: " + error.message);
      return;
    }

    setMessage("Instructions saved.");
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

      {/* ✅ NEW: Add to plan */}
      <div style={{ marginTop: 14 }}>
        <AddToPlan recipeId={recipeId} />
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
                    <option value="each">each</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="tsp">tsp</option>
                    <option value="tbsp">tbsp</option>
                    <option value="pinch">pinch</option>
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
                <option value="each">each</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="tsp">tsp</option>
                <option value="tbsp">tbsp</option>
                <option value="pinch">pinch</option>
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
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 12,
                  borderTop: "1px solid #eee",
                }}
              >
                <div style={{ flex: 1, fontWeight: 600 }}>
                  {it.ingredient?.name ?? it.ingredient_id}
                  <div style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>
                    {it.ingredient?.category ?? ""}
                  </div>
                </div>
                <div style={{ width: 140, textAlign: "right", color: "#333" }}>
                  {it.qty} {it.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
