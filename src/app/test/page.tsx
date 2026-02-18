"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const [message, setMessage] = useState("Loading...");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Not logged in.");
        return;
      }

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("households")
        .select("*");

      if (error) {
        setMessage("Error: " + error.message);
      } else {
        setMessage("Households found: " + data.length);
      }
    };

    load();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Test</h1>
      <p>User: {email ?? "None"}</p>
      <p>{message}</p>
    </div>
  );
}
