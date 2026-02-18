"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function BootstrapPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createHousehold = async () => {
    setBusy(true);
    setMessage(null);

    const { data, error } = await supabase.rpc("bootstrap_household", {
      household_name: "Jones Household",
      person1: "Charlie",
      person2: "Julie",
    });

    setBusy(false);

    if (error) {
      setMessage("Error: " + error.message);
    } else {
      setMessage("Household created successfully. ID: " + data);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Bootstrap Household</h1>

      <button
        onClick={createHousehold}
        disabled={busy}
        style={{ marginTop: 20, padding: "10px 14px", borderRadius: 10, border: "1px solid #333" }}
      >
        Create Household
      </button>

      {message && (
        <div style={{ marginTop: 20, padding: 12, background: "#f5f5f5", borderRadius: 10 }}>
          {message}
        </div>
      )}
    </div>
  );
}
