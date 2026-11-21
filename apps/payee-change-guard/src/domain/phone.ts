/** Phone numbers are compared by their digits (a leading + kept), so "+44 20 7946 0018" equals "+44 (20) 79460018". */
export function normalisePhone(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/\D/g, '');
  return t.startsWith('+') ? `+${digits}` : digits;
}

/** Same number? International and local forms are not guessed at: the clerk dials what is on file. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalisePhone(a);
  const nb = normalisePhone(b);
  return na.replace('+', '').length >= 5 && na === nb;
}
