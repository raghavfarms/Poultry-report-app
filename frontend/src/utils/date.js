export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function displayDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export function formatMinutes(value) {
  if (value == null) return "—";
  const minutes = Math.max(0, Number(value || 0));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}h/${String(minutes % 60).padStart(2, "0")}m`;
}
export function splitMinutes(value) {
  return {
    hours: Math.floor(Number(value || 0) / 60),
    minutes: Number(value || 0) % 60,
  };
}
