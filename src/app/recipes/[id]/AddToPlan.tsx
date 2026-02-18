"use client";

import { useMemo, useState } from "react";
import { startOfWeekMonday, addDays, toDateOnly, formatDow, formatDay } from "@/lib/week";
import { addRecipeToDinnerThisWeek } from "../addToPlan/actions";

export default function AddToPlan(props: { recipeId: string }) {
  const days = useMemo(() => {
    const ws = startOfWeekMonday(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i);
      return {
        dateOnly: toDateOnly(d),
        label: `${formatDow(d)} ${formatDay(d)}`,
      };
    });
  }, []);

  const [selectedDate, setSelectedDate] = useState(days[0]?.dateOnly ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="rounded border p-3 space-y-2">
      <div className="text-sm font-medium">Add to plan</div>

      <div className="flex gap-2 items-center">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          disabled={busy}
        >
          {days.map((d) => (
            <option key={d.dateOnly} value={d.dateOnly}>
              {d.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="bg-black text-white rounded px-3 py-1 text-sm"
          disabled={busy || !selectedDate}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await addRecipeToDinnerThisWeek({
                entryDate: selectedDate,
                recipeId: props.recipeId,
                servingsOverride: null,
              });
              // Hard navigation = no hanging transitions
              window.location.href = "/plan";
            } catch (e: any) {
              setErr(e?.message ?? "Failed to add to plan");
              setBusy(false);
            }
          }}
        >
          {busy ? "Adding…" : "Add to dinner"}
        </button>
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}

      <div className="text-xs text-gray-500">Adds to this week’s dinner slot.</div>
    </div>
  );
}
