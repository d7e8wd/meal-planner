import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  const isLoggedIn = !!data.user;

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Meal Planner</h1>

      <p style={{ marginTop: 8, color: "#666" }}>
        Plan your week, generate a shopping list, and stay organised.
      </p>

      {isLoggedIn ? (
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
      ) : (
        <>
          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/login"
              style={{
                textDecoration: "none",
                border: "1px solid #333",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              Log in
            </Link>

            <Link
              href="/signup"
              style={{
                textDecoration: "none",
                border: "1px solid #333",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#f7f7f7",
              }}
            >
              Create account
            </Link>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              border: "1px solid #ddd",
              borderRadius: 12,
              color: "#555",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>What this app does</div>
            <div>• Build and organise recipes</div>
            <div>• Plan meals by week</div>
            <div>• Generate shopping lists automatically</div>
            <div>• Browse public recipes shared by other users</div>
          </div>
        </>
      )}
    </div>
  );
}