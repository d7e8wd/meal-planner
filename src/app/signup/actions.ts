"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    redirect("/signup?error=Please+enter+an+email+and+password");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If email confirmation is enabled, user may need to verify first.
  if (!data.session) {
    redirect(
      "/signup?success=Account+created.+Please+check+your+email+to+confirm+your+account."
    );
  }

  // Logged in immediately
  redirect("/bootstrap");
}