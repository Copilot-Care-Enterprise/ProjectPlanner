import {
  startOfISOWeek,
  addDays,
  parseISO,
  formatISO,
  getISOWeek,
  getYear,
  eachWeekOfInterval,
  startOfDay,
  isAfter,
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

/**
 * Counts working days (Mon–Fri) between two ISO date strings, inclusive.
 * Returns 0 if endDate is before startDate.
 */
export function countWorkingDays(startDateStr: string, endDateStr: string): number {
  const start = startOfDay(parseISO(startDateStr));
  const end   = startOfDay(parseISO(endDateStr));
  if (isAfter(start, end)) return 0;
  let count = 0;
  let current = start;
  while (!isAfter(current, end)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current = addDays(current, 1);
  }
  return count;
}
