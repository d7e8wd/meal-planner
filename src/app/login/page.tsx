import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div style={{ padding: 40, maxWidth: 480 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Login</h1>
      <p style={{ marginTop: 8, color: "#666" }}>
        Sign in to access your household plan, recipes and shopping list.
      </p>

      <form action={signIn} style={{ marginTop: 18, display: "grid", gap: 12 }}>
        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Email</div>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Password</div>
          <input
            name="password"
            type="password"
            required
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#fff",
            width: 140,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
