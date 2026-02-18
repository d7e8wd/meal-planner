export function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDow(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short" }); // Mon, Tue...
}

export function formatDay(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); // 16 Feb
}
