import { parseISO, startOfISOWeek, formatISO, isBefore, isAfter } from 'date-fns';
import type { Conflict, Scenario } from './types';
import { calculateAllEndDates, calculateProjectEndDate, getStreamWeeklyCapacity } from './engine';

let conflictCounter = 0;
function newId(): string {
  return `conflict-${++conflictCounter}-${Date.now()}`;
}

// ─── 1. Person over-allocation (static, across all project allocations) ──────

function detectPersonOverallocations(scenario: Scenario): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const person of scenario.people) {
    const allocations = scenario.projectMemberAllocations.filter(a => a.personId === person.id);
    const total = allocations.reduce((s, a) => s + a.allocationPercentage, 0);
    if (total > 100) {
      const projectNames = allocations.map(a => {
        const project = scenario.projects.find(p => p.id === a.projectId);
        return project ? `${project.name} (${a.allocationPercentage}%)` : `? (${a.allocationPercentage}%)`;
      });
      conflicts.push({
        id: newId(),
        type: 'person-overallocated-static',
        scenarioId: scenario.id,
        personId: person.id,
        personName: person.name,
        projectIds: allocations.map(a => a.projectId),
        projectNames: [],
        totalAllocationPercentage: total,
        message: `${person.name} is allocated ${total}% across projects [${projectNames.join(', ')}]. Total exceeds 100%.`,
      });
    }
  }
  return conflicts;
}

// ─── 2. Stream congestion (overlapping projects in the same stream per week) ─

function weeksOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const wStartA = startOfISOWeek(parseISO(startA));
  const wEndA = startOfISOWeek(parseISO(endA));
  const wStartB = startOfISOWeek(parseISO(startB));
  const wEndB = startOfISOWeek(parseISO(endB));
  return !isAfter(wStartA, wEndB) && !isBefore(wEndA, wStartB);
}

function detectStreamCongestion(scenario: Scenario, endDates: Map<string, string | null>): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const stream of scenario.streams) {
    const streamProjects = scenario.projects
      .filter(p => p.streamId === stream.id)
      .map(p => ({ project: p, endDate: endDates.get(p.id) ?? null }))
      .filter(p => p.endDate !== null) as { project: (typeof scenario.projects)[0]; endDate: string }[];

    // Check all pairs for date overlap
    for (let i = 0; i < streamProjects.length; i++) {
      for (let j = i + 1; j < streamProjects.length; j++) {
        const a = streamProjects[i];
        const b = streamProjects[j];
        if (weeksOverlap(a.project.startDate, a.endDate, b.project.startDate, b.endDate)) {
          // Find first overlapping week for context
          const overlapWeekStart = isAfter(parseISO(a.project.startDate), parseISO(b.project.startDate))
            ? formatISO(startOfISOWeek(parseISO(a.project.startDate)), { representation: 'date' })
            : formatISO(startOfISOWeek(parseISO(b.project.startDate)), { representation: 'date' });

          const capacity = getStreamWeeklyCapacity(scenario, stream.id);
          conflicts.push({
            id: newId(),
            type: 'stream-congested',
            scenarioId: scenario.id,
            weekStart: overlapWeekStart,
            streamId: stream.id,
            streamName: stream.name,
            projectIds: [a.project.id, b.project.id],
            projectNames: [a.project.name, b.project.name],
            message: `Stream "${stream.name}" has overlapping projects "${a.project.name}" and "${b.project.name}" starting week of ${overlapWeekStart}. Available capacity: ${capacity.toFixed(1)} days/week shared across both.`,
          });
        }
      }
    }
  }
  return conflicts;
}

// ─── 3. Project under-capacity (manual end date not achievable) ───────────────

function detectProjectUnderCapacity(scenario: Scenario, endDates: Map<string, string | null>): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const project of scenario.projects) {
    if (project.endDateMode !== 'manual' || !project.endDate) continue;
    const calculated = endDates.get(project.id) ?? null;
    // For manual projects in endDates map we stored the manual date; recalculate the engine date
    const capacity = getStreamWeeklyCapacity(scenario, project.streamId);
    const engineEndDate = calculateProjectEndDate(project.startDate, project.estimate, capacity);
    if (!engineEndDate) continue;
    if (isAfter(parseISO(engineEndDate), parseISO(project.endDate))) {
      conflicts.push({
        id: newId(),
        type: 'project-under-capacity',
        scenarioId: scenario.id,
        streamId: project.streamId,
        projectIds: [project.id],
        projectNames: [project.name],
        fixedEndDate: project.endDate,
        calculatedEndDate: engineEndDate,
        message: `Project "${project.name}" has a fixed end date of ${project.endDate} but at current stream capacity (${capacity.toFixed(1)} days/week) it would complete on ${engineEndDate}. Shortfall detected.`,
      });
    }
  }
  return conflicts;
}

// ─── 4. Slippage risk (what-if vs baseline) ──────────────────────────────────

function detectSlippageRisk(
  scenario: Scenario,
  scenarioEndDates: Map<string, string | null>,
  baseline: Scenario,
  baselineEndDates: Map<string, string | null>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const project of scenario.projects) {
    const baselineProject = baseline.projects.find(p => p.id === project.id);
    if (!baselineProject) continue; // new project in scenario — not slippage
    const scenarioEnd = scenarioEndDates.get(project.id) ?? null;
    const baselineEnd = baselineEndDates.get(project.id) ?? null;
    if (!scenarioEnd || !baselineEnd) continue;
    if (isAfter(parseISO(scenarioEnd), parseISO(baselineEnd))) {
      conflicts.push({
        id: newId(),
        type: 'project-slippage-risk',
        scenarioId: scenario.id,
        projectIds: [project.id],
        projectNames: [project.name],
        calculatedEndDate: scenarioEnd,
        fixedEndDate: baselineEnd,
        message: `Project "${project.name}" slips from ${baselineEnd} (baseline) to ${scenarioEnd} in this scenario.`,
      });
    }
  }
  return conflicts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects all conflicts for a scenario.
 * Pass baseline when scenario.isBaseline === false to enable slippage detection.
 */
export function detectConflicts(scenario: Scenario, baseline?: Scenario): Conflict[] {
  const endDates = calculateAllEndDates(scenario);

  const conflicts: Conflict[] = [
    ...detectPersonOverallocations(scenario),
    ...detectStreamCongestion(scenario, endDates),
    ...detectProjectUnderCapacity(scenario, endDates),
  ];

  if (baseline && !scenario.isBaseline) {
    const baselineEndDates = calculateAllEndDates(baseline);
    conflicts.push(...detectSlippageRisk(scenario, endDates, baseline, baselineEndDates));
  }

  return conflicts;
}
