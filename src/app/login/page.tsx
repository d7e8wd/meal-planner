"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithPassword } from "./actions";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      await loginWithPassword(email, password);
      router.refresh();
      router.push("/recipes");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Login</h1>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <input
            type="password"
            placeholder="Password"
            className="w-full border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {errorMsg && <div className="text-red-600 text-sm">{errorMsg}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded px-3 py-2"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
