import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WhoAmIPage() {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  const user = userData?.user ?? null;

  const { data: hm, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id, role")
    .limit(10);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Who am I (server check)</h1>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Supabase auth.getUser()</h2>
        {userErr ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>{userErr.message}</pre>
        ) : user ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              { id: user.id, email: user.email, aud: user.aud, role: user.role },
              null,
              2
            )}
          </pre>
        ) : (
          <div>NO USER (server thinks you are logged out)</div>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>household_members rows visible</h2>
        {hmErr ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>{hmErr.message}</pre>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(hm ?? [], null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
