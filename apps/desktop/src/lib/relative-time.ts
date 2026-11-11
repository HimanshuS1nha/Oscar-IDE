/** Dates as Git tools show them: "3 days ago", with the full date on hover. */

const relativeTime = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", or "now" for the last minute. */
export const formatRelative = (date: number) => {
  const seconds = (date - Date.now()) / 1000;
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return relativeTime.format(0, "second");
};

const fullDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** e.g. "8 Nov 2026, 23:27", in the user's locale. */
export const formatDate = (date: number) => fullDate.format(date);
