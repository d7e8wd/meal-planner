"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseServerClient() {
  const cookieStore = cookies(); // no await here; Next provides the per-request store

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // ✅ In a Server Action this MUST work; if it throws, we WANT to know.
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password are required."));
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/plan");
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
