import {
  startOfISOWeek,
  addDays,
  parseISO,
  formatISO,
  getISOWeek,
  getYear,
  eachWeekOfInterval,
  startOfDay,
} from 'date-fns';

/**
 * Returns an array of ISO week Monday dates (as YYYY-MM-DD strings)
 * covering the full range from startDate to endDate, inclusive.
 */
export function getISOWeeksInRange(startDateStr: string, endDateStr: string): string[] {
  const start = startOfISOWeek(parseISO(startDateStr));
  const end = startOfISOWeek(parseISO(endDateStr));
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return weeks.map(w => formatISO(w, { representation: 'date' }));
}

/**
 * Returns a human-readable week label, e.g. "W18 Apr 28"
 */
export function formatWeekLabel(weekStartStr: string): string {
  const date = parseISO(weekStartStr);
  const weekNum = getISOWeek(date);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `W${weekNum} ${month} ${day}`;
}

/**
 * Converts a YYYY-MM-DD string to the Monday of its ISO week.
 */
export function toWeekStart(dateStr: string): string {
  return formatISO(startOfISOWeek(parseISO(dateStr)), { representation: 'date' });
}

/**
 * Returns the Friday of a given week (supplied as Monday ISO string).
 */
export function weekEndFriday(weekStartStr: string): string {
  return formatISO(addDays(parseISO(weekStartStr), 4), { representation: 'date' });
}
