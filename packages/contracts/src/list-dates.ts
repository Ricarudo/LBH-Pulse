/** Calendar boundaries are calculated in the workspace zone, never the browser/host zone. */
export function calendarDate(value: string | Date, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
export function nextCalendarDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function calendarBoundary(value: string, timeZone: string) {
  const utc = Date.parse(`${value}T00:00:00Z`);
  let low = utc - 36 * 3600000; let high = utc + 36 * 3600000;
  // Find the first instant of this local day, including DST midnight transitions.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calendarDate(new Date(middle), timeZone) < value) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
