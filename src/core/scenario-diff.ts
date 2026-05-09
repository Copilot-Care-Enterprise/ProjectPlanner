import { parseISO, isAfter } from 'date-fns';
import type { Scenario, SlippageRecord } from './types';
import { calculateAllEndDates } from './engine';

/**
 * Compares a what-if scenario against its baseline and returns records
 * for every project whose calculated end date differs.
 */
export function diffScenarios(scenario: Scenario, baseline: Scenario): SlippageRecord[] {
  const scenarioEndDates = calculateAllEndDates(scenario);
  const baselineEndDates = calculateAllEndDates(baseline);

  const records: SlippageRecord[] = [];

  for (const project of scenario.projects) {
    const scenarioEnd = scenarioEndDates.get(project.id) ?? null;
    const baselineEnd = baselineEndDates.get(project.id) ?? null;

    // Only include if dates differ (new projects in scenario will have no baseline entry)
    if (scenarioEnd !== baselineEnd) {
      records.push({
        projectId: project.id,
        projectName: project.name,
        baselineEndDate: baselineEnd,
        scenarioEndDate: scenarioEnd,
      });
    }
  }

  return records;
}

/**
 * Returns true if the scenario end date is later than the baseline end date
 * for a given project (i.e. it has slipped).
 */
export function isSlipped(record: SlippageRecord): boolean {
  if (!record.scenarioEndDate || !record.baselineEndDate) return false;
  return isAfter(parseISO(record.scenarioEndDate), parseISO(record.baselineEndDate));
}
