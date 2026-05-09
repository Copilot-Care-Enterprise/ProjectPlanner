import { detectConflicts } from './conflicts';
import type { Scenario } from './types';

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc1',
    name: 'Test',
    isBaseline: true,
    baselineId: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    teams: [],
    people: [],
    streams: [],
    streamAllocations: [],
    projects: [],
    projectMemberAllocations: [],
    ...overrides,
  };
}

const alice = { id: 'p1', name: 'Alice', role: 'Developer' as const, teamId: 't1', effectiveCapacity: 1.0 };

describe('detectConflicts – person overallocation', () => {
  const projA = { id: 'projA', name: 'Project A', streamId: 'st1', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated' as const, endDate: null, notes: '', priority: 1 };
  const projB = { id: 'projB', name: 'Project B', streamId: 'st2', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated' as const, endDate: null, notes: '', priority: 2 };

  it('returns no conflicts when a person is at exactly 100%', () => {
    const scenario = makeScenario({
      people: [alice],
      projects: [projA],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'projA', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    expect(conflicts.filter(c => c.type === 'person-overallocated-static')).toHaveLength(0);
  });

  it('returns a conflict when a person exceeds 100% allocation across projects', () => {
    const scenario = makeScenario({
      people: [alice],
      projects: [projA, projB],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'projA', personId: 'p1', allocationPercentage: 70, endDate: '2099-12-31' },
        { id: 'ma2', projectId: 'projB', personId: 'p1', allocationPercentage: 50, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    const overalloc = conflicts.filter(c => c.type === 'person-overallocated-static');
    expect(overalloc).toHaveLength(1);
    expect(overalloc[0].personId).toBe('p1');
    expect(overalloc[0].totalAllocationPercentage).toBe(120);
  });
});

describe('detectConflicts – stream congestion', () => {
  const stream = { id: 'st1', name: 'Stream 1', description: '', color: '#4F46E5' };
  const baseProject = {
    id: 'proj1', name: 'P1', streamId: 'st1',
    startDate: '2025-01-06', estimate: 5,
    endDateMode: 'calculated' as const, endDate: null,
    notes: '', priority: 1,
  };

  it('returns no conflict for projects in the same stream with non-overlapping weeks', () => {
    // P1: Jan 6 – Jan 10 (1 week), P2: Jan 13 – Jan 17 (1 week) → no overlap
    const scenario = makeScenario({
      people: [alice],
      streams: [stream],
      projects: [
        { ...baseProject, id: 'proj1', name: 'P1', startDate: '2025-01-06', estimate: 5 },
        { ...baseProject, id: 'proj2', name: 'P2', startDate: '2025-01-13', estimate: 5 },
      ],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
        { id: 'ma2', projectId: 'proj2', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    expect(conflicts.filter(c => c.type === 'stream-congested')).toHaveLength(0);
  });

  it('returns a conflict when two projects in the same stream overlap', () => {
    // Both start Jan 6, both take 1 week → same week = overlapping
    const scenario = makeScenario({
      people: [alice],
      streams: [stream],
      projects: [
        { ...baseProject, id: 'proj1', name: 'P1', startDate: '2025-01-06', estimate: 5 },
        { ...baseProject, id: 'proj2', name: 'P2', startDate: '2025-01-06', estimate: 5 },
      ],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
        { id: 'ma2', projectId: 'proj2', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    expect(conflicts.filter(c => c.type === 'stream-congested')).toHaveLength(1);
  });
});

describe('detectConflicts – project under-capacity', () => {
  const stream = { id: 'st1', name: 'Stream 1', description: '', color: '#4F46E5' };

  it('returns no conflict when manual end date is achievable', () => {
    // capacity = 5/week, estimate = 5 days → calculated end = Jan 10; manual end = Jan 10 → OK
    const scenario = makeScenario({
      people: [alice],
      streams: [stream],
      projects: [{
        id: 'proj1', name: 'P1', streamId: 'st1',
        startDate: '2025-01-06', estimate: 5,
        endDateMode: 'manual', endDate: '2025-01-10',
        notes: '', priority: 1,
      }],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    expect(conflicts.filter(c => c.type === 'project-under-capacity')).toHaveLength(0);
  });

  it('returns a conflict when manual end date is earlier than calculated', () => {
    // capacity = 5/week, estimate = 10 days → calculated end = Jan 17; manual end = Jan 10 → conflict
    const scenario = makeScenario({
      people: [alice],
      streams: [stream],
      projects: [{
        id: 'proj1', name: 'P1', streamId: 'st1',
        startDate: '2025-01-06', estimate: 10,
        endDateMode: 'manual', endDate: '2025-01-10',
        notes: '', priority: 1,
      }],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(scenario);
    expect(conflicts.filter(c => c.type === 'project-under-capacity')).toHaveLength(1);
  });
});

describe('detectConflicts – slippage risk', () => {
  const stream = { id: 'st1', name: 'Stream 1', description: '', color: '#4F46E5' };
  const baselineProject = {
    id: 'proj1', name: 'P1', streamId: 'st1',
    startDate: '2025-01-06', estimate: 5,
    endDateMode: 'calculated' as const, endDate: null,
    notes: '', priority: 1,
  };

  it('returns no slippage when what-if end date equals baseline', () => {
    const baseline = makeScenario({
      id: 'baseline', name: 'Baseline', isBaseline: true,
      people: [alice],
      streams: [stream],
      projects: [baselineProject],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const whatif = makeScenario({
      id: 'whatif', name: 'What-if', isBaseline: false, baselineId: 'baseline',
      people: [alice],
      streams: [stream],
      projects: [baselineProject],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(whatif, baseline);
    expect(conflicts.filter(c => c.type === 'project-slippage-risk')).toHaveLength(0);
  });

  it('returns slippage risk when what-if end date is later than baseline', () => {
    const baseline = makeScenario({
      id: 'baseline', name: 'Baseline', isBaseline: true,
      people: [alice],
      streams: [stream],
      projects: [{ ...baselineProject, estimate: 5 }], // ends Jan 10
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
      ],
    });
    // Reduce what-if allocation to 50% → now needs 2 weeks → ends Jan 17 → slippage
    const whatif = makeScenario({
      id: 'whatif', name: 'What-if', isBaseline: false, baselineId: 'baseline',
      people: [alice],
      streams: [stream],
      projects: [{ ...baselineProject, estimate: 5 }],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 50, endDate: '2099-12-31' },
      ],
    });
    const conflicts = detectConflicts(whatif, baseline);
    expect(conflicts.filter(c => c.type === 'project-slippage-risk')).toHaveLength(1);
  });
});
