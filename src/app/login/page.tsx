import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : "";

  return (
    <div style={{ padding: 40, maxWidth: 480 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Login</h1>
      <p style={{ marginTop: 8, color: "#666" }}>
        Sign in to access your household plan, recipes and shopping list.
      </p>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "#fff4f4",
            border: "1px solid #f5c2c2",
            borderRadius: 10,
            color: "#8a1f1f",
          }}
        >
          {error}
        </div>
      ) : null}

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
