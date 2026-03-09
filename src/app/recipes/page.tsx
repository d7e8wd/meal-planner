"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

type Recipe = {
  id: string;
  household_id: string;
  name: string;
  servings_default: number | null;
  created_at: string;
  meal_tags: string[] | null;
  is_public: boolean;
};

type MealTag = "breakfast" | "lunch" | "dinner" | "snack";

function normaliseTag(t: unknown): MealTag | null {
  const s = String(t ?? "").trim().toLowerCase();
  if (s === "breakfast" || s === "lunch" || s === "dinner" || s === "snack") return s;
  return null;
}

function hasTag(r: Recipe, tag: MealTag) {
  const tags = (r.meal_tags ?? []).map(normaliseTag).filter(Boolean) as MealTag[];
  return tags.includes(tag);
}

function sortRecipes(recipes: Recipe[], myHouseholdId: string | null) {
  return [...recipes].sort((a, b) => {
    const aMine = a.household_id === myHouseholdId ? 1 : 0;
    const bMine = b.household_id === myHouseholdId ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine; // mine first
    return a.name.localeCompare(b.name);
  });
}

function renderRecipeRow(r: Recipe, isMine: boolean) {
  return (
    <div
      key={r.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: 12,
        borderTop: "1px solid #eee",
        alignItems: "baseline",
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <a
          href={`/recipes/${r.id}`}
          style={{
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: 8,
          }}
          title={r.name}
        >
          {r.name}
        </a>

        {!isMine && r.is_public && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#555",
              background: "#f3f3f3",
              border: "1px solid #ddd",
              borderRadius: 999,
              padding: "2px 8px",
              whiteSpace: "nowrap",
            }}
          >
            Public
          </span>
        )}

        <div style={{ fontSize: 13, color: "#666" }}>
          Servings: {r.servings_default ?? "—"}
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#666" }}>
        {new Date(r.created_at).toLocaleDateString("en-GB")}
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={!!props.defaultOpen}
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: 12,
          background: "#f7f7f7",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontWeight: 700,
        }}
      >
        <span>{props.title}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#555",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 999,
            padding: "2px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {props.count}
        </span>
      </summary>

      <div>{props.children}</div>
    </details>
  );
}

export default function RecipesPage() {
  const router = useRouter();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [myHouseholdId, setMyHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [servings, setServings] = useState(2);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecipes = async () => {
    setLoading(true);
    setMessage(null);

    const { data: membership, error: memErr } = await supabase
      .from("household_members")
      .select("household_id")
      .limit(1)
      .maybeSingle();

    if (memErr) {
      setLoading(false);
      setMessage("Error finding household: " + memErr.message);
      return;
    }

    setMyHouseholdId(membership?.household_id ?? null);

    const { data, error } = await supabase
      .from("recipes")
      .select("id,household_id,name,servings_default,created_at,meal_tags,is_public")
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

    const { data: created, error } = await supabase
      .from("recipes")
      .insert({
        household_id: membership.household_id,
        name: trimmed,
        servings_default: servings,
        instructions: "",
      })
      .select("id")
      .single();

    setCreating(false);

    if (error) {
      setMessage("Error creating recipe: " + error.message);
      return;
    }

    const newId = created?.id;
    if (!newId) {
      setMessage("Recipe created, but could not read its ID.");
      await loadRecipes();
      return;
    }

    setName("");
    setServings(2);
    router.push(`/recipes/${newId}`);
  };

  const grouped = useMemo(() => {
    const dinner = sortRecipes(recipes.filter((r) => hasTag(r, "dinner")), myHouseholdId);
    const lunch = sortRecipes(recipes.filter((r) => hasTag(r, "lunch")), myHouseholdId);
    const breakfast = sortRecipes(recipes.filter((r) => hasTag(r, "breakfast")), myHouseholdId);
    const snack = sortRecipes(recipes.filter((r) => hasTag(r, "snack")), myHouseholdId);

    const taggedIds = new Set<string>();
    for (const r of recipes) {
      const tags = (r.meal_tags ?? []).map(normaliseTag).filter(Boolean) as MealTag[];
      if (tags.length) taggedIds.add(r.id);
    }

    const other = sortRecipes(recipes.filter((r) => !taggedIds.has(r.id)), myHouseholdId);

    return { dinner, lunch, breakfast, snack, other };
  }, [recipes, myHouseholdId]);

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
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Add recipe</h2>

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
            type="button"
            onClick={createRecipe}
            disabled={creating}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              width: 220,
              background: creating ? "#eee" : "#fff",
            }}
          >
            {creating ? "Creating…" : "Create + edit recipe"}
          </button>

          {message && (
            <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 10 }}>
              {message}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Your recipes</h2>

        {loading ? (
          <p>Loading…</p>
        ) : recipes.length === 0 ? (
          <p>No recipes yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <Section title="Dinner" count={grouped.dinner.length} defaultOpen>
              {grouped.dinner.length ? (
                grouped.dinner.map((r) => renderRecipeRow(r, r.household_id === myHouseholdId))
              ) : (
                <div style={{ padding: 12, color: "#666" }}>No dinner recipes.</div>
              )}
            </Section>

            <Section title="Lunch" count={grouped.lunch.length}>
              {grouped.lunch.length ? (
                grouped.lunch.map((r) => renderRecipeRow(r, r.household_id === myHouseholdId))
              ) : (
                <div style={{ padding: 12, color: "#666" }}>No lunch recipes.</div>
              )}
            </Section>

            <Section title="Breakfast" count={grouped.breakfast.length}>
              {grouped.breakfast.length ? (
                grouped.breakfast.map((r) => renderRecipeRow(r, r.household_id === myHouseholdId))
              ) : (
                <div style={{ padding: 12, color: "#666" }}>No breakfast recipes.</div>
              )}
            </Section>

            <Section title="Snack" count={grouped.snack.length}>
              {grouped.snack.length ? (
                grouped.snack.map((r) => renderRecipeRow(r, r.household_id === myHouseholdId))
              ) : (
                <div style={{ padding: 12, color: "#666" }}>No snack recipes.</div>
              )}
            </Section>

            <Section title="Other" count={grouped.other.length}>
              {grouped.other.length ? (
                grouped.other.map((r) => renderRecipeRow(r, r.household_id === myHouseholdId))
              ) : (
                <div style={{ padding: 12, color: "#666" }}>No untagged recipes.</div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}