import { addDays, startOfISOWeek, parseISO, formatISO, isBefore } from 'date-fns';
import type { Scenario } from './types';

const DAYS_PER_WEEK = 5;

/**
 * Returns the total ideal person-days available per week for a given stream,
 * derived from ProjectMemberAllocations on projects that belong to this stream.
 *
 * For each person, their total allocation % across all projects in the stream is
 * summed, then multiplied by their effective capacity and the working days per week.
 *
 * Formula per person: effectiveCapacity × (totalAllocationPct / 100) × 5
 */
export function getStreamWeeklyCapacity(scenario: Scenario, streamId: string): number {
  const streamProjects = scenario.projects.filter(p => p.streamId === streamId);
  const personTotals = new Map<string, number>();
  for (const project of streamProjects) {
    for (const alloc of scenario.projectMemberAllocations.filter(a => a.projectId === project.id)) {
      personTotals.set(alloc.personId, (personTotals.get(alloc.personId) ?? 0) + alloc.allocationPercentage);
    }
  }
  return Array.from(personTotals.entries()).reduce((total, [personId, pct]) => {
    const person = scenario.people.find(p => p.id === personId);
    if (!person) return total;
    return total + person.effectiveCapacity * (pct / 100) * DAYS_PER_WEEK;
  }, 0);
}

/**
 * Calculates the end date for a project using the planning engine.
 *
 * Consumes capacity week-by-week from the project's start date.
 * Returns the last day (Friday) of the week in which the estimate is fully consumed.
 * Returns null if weeklyCapacity is 0 (no resources).
 *
 * @param startDateStr  ISO date string YYYY-MM-DD
 * @param estimateDays  Ideal person-days to consume
 * @param weeklyCapacity  Days/week available from getStreamWeeklyCapacity()
 */
export function calculateProjectEndDate(
  startDateStr: string,
  estimateDays: number,
  weeklyCapacity: number,
): string | null {
  if (weeklyCapacity <= 0) return null;
  if (estimateDays <= 0) return startDateStr;

  let weekStart = startOfISOWeek(parseISO(startDateStr));
  let remaining = estimateDays;

  while (remaining > 0) {
    remaining -= weeklyCapacity;
    if (remaining > 0) {
      weekStart = addDays(weekStart, 7);
    }
  }

  // End date is the Friday of the consuming week (weekStart is Monday → +4 days)
  const endDate = addDays(weekStart, 4);
  return formatISO(endDate, { representation: 'date' });
}

/**
 * Returns calculated end dates for every project in a scenario as a Map<projectId, endDate|null>.
 * If a project has project-level member allocations, those drive the end date (week-by-week,
 * capacity drops as members hit their individual end dates).
 * Otherwise falls back to stream-wide capacity.
 */
export function calculateAllEndDates(scenario: Scenario): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const project of scenario.projects) {
    if (project.endDateMode === 'manual') {
      result.set(project.id, project.endDate);
    } else {
      const projectMembers = (scenario.projectMemberAllocations ?? []).filter(
        a => a.projectId === project.id,
      );
      if (projectMembers.length > 0) {
        const memberData = projectMembers.map(a => {
          const person = scenario.people.find(p => p.id === a.personId);
          return {
            effectiveCapacity: person?.effectiveCapacity ?? 0,
            allocationPercentage: a.allocationPercentage,
            endDate: a.endDate,
          };
        });
        result.set(project.id, calculateProjectEndDateWithMembers(project.startDate, project.estimate, memberData));
      } else {
        const capacity = getStreamWeeklyCapacity(scenario, project.streamId);
        result.set(project.id, calculateProjectEndDate(project.startDate, project.estimate, capacity));
      }
    }
  }
  return result;
}

/**
 * Calculates project end date using direct member allocations.
 * Week-by-week simulation; capacity drops as members hit their individual end dates.
 * Returns null if capacity runs out before estimate is consumed.
 */
export function calculateProjectEndDateWithMembers(
  startDateStr: string,
  estimateDays: number,
  members: Array<{ effectiveCapacity: number; allocationPercentage: number; endDate: string }>,
): string | null {
  if (members.length === 0) return null;
  if (estimateDays <= 0) return startDateStr;

  let weekStart = startOfISOWeek(parseISO(startDateStr));
  let remaining = estimateDays;
  const MAX_WEEKS = 520; // 10-year safety limit

  for (let i = 0; i < MAX_WEEKS; i++) {
    const weekCapacity = members.reduce((sum, m) => {
      // Member is active if their end date is not before this week's Monday
      return !isBefore(parseISO(m.endDate), weekStart)
        ? sum + m.effectiveCapacity * (m.allocationPercentage / 100) * DAYS_PER_WEEK
        : sum;
    }, 0);

    if (weekCapacity <= 0) return null; // All members have finished; can't complete
    remaining -= weekCapacity;
    if (remaining <= 0) {
      return formatISO(addDays(weekStart, 4), { representation: 'date' }); // Friday of consuming week
    }
    weekStart = addDays(weekStart, 7);
  }
  return null; // Could not complete within safety limit
}
