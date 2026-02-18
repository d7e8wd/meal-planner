"use client";

import { useState } from "react";
import { clearPlanThisWeek } from "./actions";

export default function ClearPlanButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm"
        disabled={busy}
        onClick={async () => {
          const ok = window.confirm(
            "Clear the entire plan for this week? This will remove all saved entries."
          );
          if (!ok) return;

          setBusy(true);
          setMsg(null);
          try {
            const res = await clearPlanThisWeek();
            setMsg(`Cleared (${res.deleted} entries).`);
            // Hard refresh to re-fetch from server
            window.location.reload();
          } catch (e: any) {
            setMsg(e?.message ?? "Failed to clear plan");
            setBusy(false);
          }
        }}
      >
        {busy ? "Clearing…" : "Clear week"}
      </button>

      {msg && <div className="text-xs text-gray-600">{msg}</div>}
    </div>
  );
}
