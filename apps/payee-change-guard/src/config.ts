/**
 * Rules and thresholds. The About page reads these, so the numbers on screen are the numbers enforced.
 */
export const rules = {
  /** No approval or release this many hours before a payment run (the run's own freezeHours can differ). */
  FREEZE_HOURS: 48,
  /** Annual spend above this raises the high-spend flag. */
  HIGH_SPEND: 250_000,
  /** A change requested within this many days of a previous change to the same supplier is flagged. */
  RECENT_CHANGE_DAYS: 14,
  /** A phone on file changed within this many days is flagged (a fraudster may have changed it first). */
  PHONE_CHANGE_DAYS: 30,
  /** This many flags or more need a written override reason to approve. */
  OVERRIDE_FLAGS: 2,
  /** Minimum length of an override reason. */
  OVERRIDE_MIN_CHARS: 20,
  /** A request without a confirmed call-back after this many hours shows in Today. */
  CALLBACK_DUE_HOURS: 24,
  /** Released boats stay in the basin this many days, then live only in the Ledger. */
  BASIN_DAYS: 30,
  /** Rejected and cancelled boats stay in the dry dock this many days. */
  DRY_DOCK_DAYS: 30,
} as const;

/** Countries offered in forms (ISO 3166-1 alpha-2). Any two-letter code is accepted. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PL', name: 'Poland' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'SE', name: 'Sweden' },
  { code: 'DK', name: 'Denmark' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'AE', name: 'United Arab Emirates' },
];

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}
