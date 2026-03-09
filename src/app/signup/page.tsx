import Link from "next/link";
import { signUp } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : "";
  const success = typeof sp.success === "string" ? sp.success : "";

  return (
    <div style={{ padding: 40, maxWidth: 480 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Create account</h1>
      <p style={{ marginTop: 8, color: "#666" }}>
        Create an account to start your own household plan, recipes and shopping list.
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

      {success ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "#f4fff6",
            border: "1px solid #bfe3c7",
            borderRadius: 10,
            color: "#1f6b33",
          }}
        >
          {success}
        </div>
      ) : null}

      <form action={signUp} style={{ marginTop: 18, display: "grid", gap: 12 }}>
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
            minLength={6}
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
            width: 160,
            cursor: "pointer",
          }}
        >
          Create account
        </button>
      </form>

      <div style={{ marginTop: 16, fontSize: 14, color: "#666" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Log in
        </Link>
      </div>
    </div>
  );
}