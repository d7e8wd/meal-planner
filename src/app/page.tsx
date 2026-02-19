import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // 🔒 Must be logged in to see home
  if (!data.user) redirect("/login");

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Meal Planner</h1>
      <p style={{ marginTop: 8, color: "#666" }}>
        Plan your week, generate a shopping list, and stay organised.
      </p>

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/plan"
          style={{
            textDecoration: "none",
            border: "1px solid #333",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          Go to Plan
        </Link>

        <Link
          href="/recipes"
          style={{
            textDecoration: "none",
            border: "1px solid #333",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          View Recipes
        </Link>

        <Link
          href="/shopping-list"
          style={{
            textDecoration: "none",
            border: "1px solid #333",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          Shopping List
        </Link>
      </div>
    </div>
  );
}
