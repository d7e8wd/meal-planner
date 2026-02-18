import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>
        <nav
          style={{
            display: "flex",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid #eee",
            flexWrap: "wrap",
          }}
        >
          <NavLink href="/">Home</NavLink>
          <NavLink href="/ingredients">Ingredients</NavLink>
          <NavLink href="/recipes">Recipes</NavLink>
          <NavLink href="/plan">Plan</NavLink>
          <NavLink href="/shopping-list">Shopping List</NavLink>
        </nav>

        <div>{children}</div>
      </body>
    </html>
  );
}

/** Simple “tab” link that highlights when you’re on that page */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #ddd",
      }}
      // We'll make the active styling in Step 2 (needs a client component)
    >
      {children}
    </Link>
  );
}
