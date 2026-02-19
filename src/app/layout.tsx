import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const isLoggedIn = !!data.user;

  return (
    <html lang="en-GB">
      <body>
        <nav
          style={{
            display: "flex",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid #eee",
            alignItems: "center",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            Home
          </Link>

          {isLoggedIn ? (
            <>
              <Link href="/ingredients" style={{ textDecoration: "none" }}>
                Ingredients
              </Link>
              <Link href="/recipes" style={{ textDecoration: "none" }}>
                Recipes
              </Link>
              <Link href="/plan" style={{ textDecoration: "none" }}>
                Plan
              </Link>
              <Link href="/shopping-list" style={{ textDecoration: "none" }}>
                Shopping List
              </Link>

              <div style={{ marginLeft: "auto" }}>
                <form action="/login" method="get">
                  <button
                    type="submit"
                    style={{
                      border: "1px solid #333",
                      borderRadius: 10,
                      padding: "6px 10px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Account
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ marginLeft: "auto" }}>
              <Link href="/login" style={{ textDecoration: "none" }}>
                Login
              </Link>
            </div>
          )}
        </nav>

        <div>{children}</div>
      </body>
    </html>
  );
}
