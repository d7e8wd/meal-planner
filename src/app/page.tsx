import Link from "next/link";

export default function HomePage() {
  return (
    <div
      style={{
        padding: 40,
        maxWidth: 600,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 20 }}>
        Meal Planner
      </h1>

      <p style={{ marginBottom: 30 }}>
        Plan your week, generate a shopping list, and stay organised.
      </p>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/plan">
          <button style={buttonStyle}>Go to Plan</button>
        </Link>

        <Link href="/recipes">
          <button style={buttonStyle}>View Recipes</button>
        </Link>

        <Link href="/shopping-list">
          <button style={buttonStyle}>Shopping List</button>
        </Link>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};
