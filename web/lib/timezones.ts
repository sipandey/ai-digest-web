/**
 * Canonical timezone list for AI Digest.
 *
 * `offset` is the UTC offset in decimal hours (e.g. 5.5 for IST UTC+5:30).
 * `label`  is the human-readable string shown in the UI dropdown.
 *
 * Half-hour and quarter-hour offsets are included so users in IST (+5:30),
 * NPT (+5:45), NST (−3:30), ACST (+9:30), etc. can pick the right zone.
 *
 * The pipeline rounds the computed UTC delivery hour to the nearest whole
 * hour (since the GitHub Actions schedule runs once per hour), so ±15 min
 * accuracy is the practical limit.
 */

export type Timezone = { offset: number; label: string };

export const TIMEZONES: Timezone[] = [
  { offset: -12,   label: "UTC−12:00 — Baker Island, Howland Island" },
  { offset: -11,   label: "UTC−11:00 — American Samoa, Pago Pago" },
  { offset: -10,   label: "UTC−10:00 — Hawaii, Honolulu" },
  { offset: -9.5,  label: "UTC−9:30 — Marquesas Islands" },
  { offset: -9,    label: "UTC−9:00 — Alaska, Anchorage" },
  { offset: -8,    label: "UTC−8:00 — Pacific Time — Los Angeles, Vancouver" },
  { offset: -7,    label: "UTC−7:00 — Mountain Time — Denver, Phoenix" },
  { offset: -6,    label: "UTC−6:00 — Central Time — Chicago, Mexico City" },
  { offset: -5,    label: "UTC−5:00 — Eastern Time — New York, Toronto, Bogotá" },
  { offset: -4.5,  label: "UTC−4:30 — Venezuela" },
  { offset: -4,    label: "UTC−4:00 — Atlantic Time — Halifax, Santiago, La Paz" },
  { offset: -3.5,  label: "UTC−3:30 — Newfoundland" },
  { offset: -3,    label: "UTC−3:00 — São Paulo, Buenos Aires, Montevideo" },
  { offset: -2,    label: "UTC−2:00 — South Georgia" },
  { offset: -1,    label: "UTC−1:00 — Azores" },
  { offset: 0,     label: "UTC±0:00 — London, Dublin, Lisbon, Reykjavik" },
  { offset: 1,     label: "UTC+1:00 — Paris, Berlin, Rome, Amsterdam, Lagos" },
  { offset: 2,     label: "UTC+2:00 — Cairo, Johannesburg, Athens, Helsinki" },
  { offset: 3,     label: "UTC+3:00 — Moscow, Nairobi, Riyadh, Kuwait" },
  { offset: 3.5,   label: "UTC+3:30 — Tehran" },
  { offset: 4,     label: "UTC+4:00 — Dubai, Abu Dhabi, Baku, Tbilisi" },
  { offset: 4.5,   label: "UTC+4:30 — Kabul" },
  { offset: 5,     label: "UTC+5:00 — Karachi, Islamabad, Tashkent" },
  { offset: 5.5,   label: "UTC+5:30 — India, Sri Lanka (Mumbai, Delhi, Bengaluru)" },
  { offset: 5.75,  label: "UTC+5:45 — Nepal (Kathmandu)" },
  { offset: 6,     label: "UTC+6:00 — Dhaka, Almaty, Bishkek" },
  { offset: 6.5,   label: "UTC+6:30 — Myanmar (Yangon)" },
  { offset: 7,     label: "UTC+7:00 — Bangkok, Jakarta, Hanoi, Ho Chi Minh City" },
  { offset: 8,     label: "UTC+8:00 — Beijing, Singapore, Kuala Lumpur, Perth" },
  { offset: 9,     label: "UTC+9:00 — Tokyo, Seoul, Osaka" },
  { offset: 9.5,   label: "UTC+9:30 — Adelaide, Darwin" },
  { offset: 10,    label: "UTC+10:00 — Sydney, Melbourne, Brisbane" },
  { offset: 11,    label: "UTC+11:00 — Solomon Islands, Noumea" },
  { offset: 12,    label: "UTC+12:00 — Auckland, Wellington, Fiji" },
  { offset: 13,    label: "UTC+13:00 — Samoa, Tonga, Nuku'alofa" },
  { offset: 14,    label: "UTC+14:00 — Kiribati (Line Islands)" },
];

/**
 * Find the label for a given offset, falling back to a generated string.
 */
export function tzLabel(offset: number): string {
  const found = TIMEZONES.find((t) => t.offset === offset);
  if (found) return found.label;
  return fmtRawOffset(offset);
}

/**
 * Short offset string, e.g. "UTC+5:30", "UTC−3:30", "UTC±0:00".
 */
export function fmtRawOffset(o: number): string {
  if (o === 0) return "UTC±0:00";
  const sign = o > 0 ? "+" : "−";
  const abs = Math.abs(o);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Auto-detect the user's timezone offset from the browser, returning the
 * closest TIMEZONES entry's offset value.
 *
 * Safe to call during SSR (returns 0 when window is unavailable).
 */
export function detectTimezoneOffset(): number {
  if (typeof window === "undefined") return 0;
  // getTimezoneOffset() returns minutes WEST of UTC (negative for east-of-UTC).
  // Negate to get the conventional UTC+ offset in minutes, then convert to hours.
  const rawHours = -new Date().getTimezoneOffset() / 60;
  return TIMEZONES.reduce((best, tz) =>
    Math.abs(tz.offset - rawHours) < Math.abs(best.offset - rawHours) ? tz : best,
  ).offset;
}
