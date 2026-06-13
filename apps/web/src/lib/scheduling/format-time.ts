/** Format an instant as a short local time label (e.g. "9:30 AM"). */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
