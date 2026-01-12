/**
 * Date Helper Utilities
 */

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today(): string {
  return formatDate(new Date());
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

/**
 * Check if date is in the future
 */
export function isFutureDate(dateStr: string): boolean {
  const date = parseDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date > now;
}

/**
 * Get start of month
 */
export function startOfMonth(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return formatDate(d);
}

/**
 * Get end of month
 */
export function endOfMonth(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return formatDate(d);
}

/**
 * Add days to a date
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}
