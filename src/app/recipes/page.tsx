"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Recipe = {
  id: string;
  name: string;
  servings_default: number | null;
  created_at: string;
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [servings, setServings] = useState(2);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecipes = async () => {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("recipes")
      .select("id,name,servings_default,created_at")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setMessage("Error loading: " + error.message);
    } else {
      setRecipes((data ?? []) as Recipe[]);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const createRecipe = async () => {
    setMessage(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Please enter a name.");
      return;
    }

    setCreating(true);

    // Find user's household_id via membership (same pattern as /ingredients)
    const { data: membership, error: memErr } = await supabase
      .from("household_members")
      .select("household_id")
      .limit(1)
      .maybeSingle();

    if (memErr) {
      setCreating(false);
      setMessage("Error finding household: " + memErr.message);
      return;
    }

    if (!membership?.household_id) {
      setCreating(false);
      setMessage("No household found for this user. Run /bootstrap first.");
      return;
    }

    const { error } = await supabase.from("recipes").insert({
      household_id: membership.household_id,
      name: trimmed,
      servings_default: servings,
      instructions: "",
    });

    setCreating(false);

    if (error) {
      setMessage("Error creating recipe: " + error.message);
      return;
    }

    setName("");
    setServings(2);
    await loadRecipes();
    setMessage("Recipe created.");
  };

  return (
    <div style={{ padding: 40, maxWidth: 800 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Recipes</h1>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Add recipe
        </h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Thai green curry"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Servings</div>
            <input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
              style={{
                width: 120,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </label>

          <button
            onClick={createRecipe}
            disabled={creating}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              width: 180,
              background: creating ? "#eee" : "#fff",
            }}
          >
            {creating ? "Creating…" : "Create recipe"}
          </button>

          {message && (
            <div
              style={{
                padding: 12,
                background: "#f5f5f5",
                borderRadius: 10,
              }}
            >
              {message}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
          Your recipes
        </h2>

        {loading ? (
          <p>Loading…</p>
        ) : recipes.length === 0 ? (
          <p>No recipes yet.</p>
        ) : (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {recipes.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: 12,
                  borderTop: "1px solid #eee",
                }}
              >
                <div>
                  <a
                    href={`/recipes/${r.id}`}
                    style={{ fontWeight: 700, textDecoration: "none" }}
                  >
                    {r.name}
                  </a>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    Servings: {r.servings_default ?? "—"}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#666" }}>
                  {new Date(r.created_at).toLocaleDateString("en-GB")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
