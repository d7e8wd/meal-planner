"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";


type Ingredient = {
  id: string;
  name: string;
  category: string;
  default_unit: string;
};

export default function IngredientsPage() {
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [defaultUnit, setDefaultUnit] = useState("each");
  const [message, setMessage] = useState<string | null>(null);

  const loadIngredients = async () => {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("ingredients")
      .select("id,name,category,default_unit")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    setLoading(false);

    if (error) setMessage("Error loading: " + error.message);
    else setIngredients((data ?? []) as Ingredient[]);
  };

  useEffect(() => {
    loadIngredients();
  }, []);

  const addIngredient = async () => {
    setMessage(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Please enter a name.");
      return;
    }

    // Find user's household_id via membership
    const { data: membership, error: memErr } = await supabase
      .from("household_members")
      .select("household_id")
      .limit(1)
      .maybeSingle();

    if (memErr) {
      setMessage("Error finding household: " + memErr.message);
      return;
    }
    if (!membership?.household_id) {
      setMessage("No household found for this user. Run /bootstrap first.");
      return;
    }

    const { error } = await supabase.from("ingredients").insert({
      household_id: membership.household_id,
      is_global: false,
      name: trimmed,
      category,
      default_unit: defaultUnit,
    });

    if (error) {
      setMessage("Error adding: " + error.message);
      return;
    }

    setName("");
    await loadIngredients();
    setMessage("Added.");
  };

  return (
    <div style={{ padding: 40, maxWidth: 800 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ingredients</h1>

      <div style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Add ingredient</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Onion"
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 220px" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Category</div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Veg, Dairy, Meat, Pantry"
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
              />
            </label>

            <label style={{ flex: "0 0 160px" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Default unit</div>
              <select
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
              >
                <option value="each">each</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="tsp">tsp</option>
                <option value="tbsp">tbsp</option>
              </select>
            </label>
          </div>

          <button
            onClick={addIngredient}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", width: 160 }}
          >
            Add
          </button>

          {message && (
            <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 10 }}>{message}</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>All ingredients</h2>

        {loading ? (
          <p>Loading…</p>
        ) : ingredients.length === 0 ? (
          <p>No ingredients yet.</p>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
            {ingredients.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 12,
                  borderTop: "1px solid #eee",
                }}
              >
                <div style={{ flex: 1, fontWeight: 600 }}>{i.name}</div>
                <div style={{ width: 160, color: "#666" }}>{i.category}</div>
                <div style={{ width: 80, color: "#666" }}>{i.default_unit}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
