import { getStreamWeeklyCapacity, calculateProjectEndDate, calculateAllEndDates } from './engine';
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

describe('getStreamWeeklyCapacity', () => {
  it('returns 0 when there are no project allocations for the stream', () => {
    const scenario = makeScenario({ people: [], projects: [], projectMemberAllocations: [] });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBe(0);
  });

  it('calculates capacity for a single person fully allocated at 100%', () => {
    // 1.0 effectiveCapacity × (100/100) × 5 days = 5.0
    const scenario = makeScenario({
      people: [{ id: 'p1', name: 'Alice', role: 'Developer', teamId: 't1', effectiveCapacity: 1.0 }],
      projects: [{ id: 'proj1', name: 'P1', streamId: 'stream-1', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated', endDate: null, notes: '', priority: 1 }],
      projectMemberAllocations: [{ id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' }],
    });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBeCloseTo(5.0);
  });

  it('calculates capacity for a person at 50% allocation', () => {
    // 1.0 × 0.5 × 5 = 2.5
    const scenario = makeScenario({
      people: [{ id: 'p1', name: 'Alice', role: 'Developer', teamId: 't1', effectiveCapacity: 1.0 }],
      projects: [{ id: 'proj1', name: 'P1', streamId: 'stream-1', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated', endDate: null, notes: '', priority: 1 }],
      projectMemberAllocations: [{ id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 50, endDate: '2099-12-31' }],
    });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBeCloseTo(2.5);
  });

  it('sums multiple people allocations across projects in the same stream', () => {
    // Alice: 1.0 × 1.0 × 5 = 5, Bob: 0.8 × 0.5 × 5 = 2 → total 7
    const scenario = makeScenario({
      people: [
        { id: 'p1', name: 'Alice', role: 'Developer', teamId: 't1', effectiveCapacity: 1.0 },
        { id: 'p2', name: 'Bob',   role: 'Developer', teamId: 't1', effectiveCapacity: 0.8 },
      ],
      projects: [{ id: 'proj1', name: 'P1', streamId: 'stream-1', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated', endDate: null, notes: '', priority: 1 }],
      projectMemberAllocations: [
        { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' },
        { id: 'ma2', projectId: 'proj1', personId: 'p2', allocationPercentage: 50,  endDate: '2099-12-31' },
      ],
    });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBeCloseTo(7.0);
  });

  it('ignores allocations for a project in a different stream', () => {
    const scenario = makeScenario({
      people: [{ id: 'p1', name: 'Alice', role: 'Developer', teamId: 't1', effectiveCapacity: 1.0 }],
      projects: [{ id: 'proj1', name: 'P1', streamId: 'stream-OTHER', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated', endDate: null, notes: '', priority: 1 }],
      projectMemberAllocations: [{ id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' }],
    });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBe(0);
  });

  it('ignores allocations with no matching person', () => {
    const scenario = makeScenario({
      people: [],
      projects: [{ id: 'proj1', name: 'P1', streamId: 'stream-1', startDate: '2025-01-06', estimate: 5, endDateMode: 'calculated', endDate: null, notes: '', priority: 1 }],
      projectMemberAllocations: [{ id: 'ma1', projectId: 'proj1', personId: 'p-missing', allocationPercentage: 100, endDate: '2099-12-31' }],
    });
    expect(getStreamWeeklyCapacity(scenario, 'stream-1')).toBe(0);
  });
});

describe('calculateProjectEndDate', () => {
  it('returns null when weeklyCapacity is 0', () => {
    expect(calculateProjectEndDate('2025-01-06', 10, 0)).toBeNull();
  });

  it('returns the startDate when estimateDays is 0', () => {
    expect(calculateProjectEndDate('2025-01-06', 0, 5)).toBe('2025-01-06');
  });

  it('returns Friday of the start week when estimate fits in one week', () => {
    // W1 2025: Monday Jan 6 → Friday Jan 10. 5 days estimate, 5 days/week capacity → finishes in week 1
    expect(calculateProjectEndDate('2025-01-06', 5, 5)).toBe('2025-01-10');
  });

  it('returns Friday of the second week when estimate needs 2 weeks', () => {
    // 10 days estimate, 5 days/week → 2 weeks. Week 2 Friday = Jan 17
    expect(calculateProjectEndDate('2025-01-06', 10, 5)).toBe('2025-01-17');
  });

  it('rounds up: partial week counts as a full week', () => {
    // 6 days estimate, 5 days/week → needs 2 weeks. Friday of week 2 = Jan 17
    expect(calculateProjectEndDate('2025-01-06', 6, 5)).toBe('2025-01-17');
  });

  it('handles mid-week start dates by aligning to ISO week', () => {
    // Wednesday Jan 8 → week start is Monday Jan 6, so same week end = Jan 10
    expect(calculateProjectEndDate('2025-01-08', 5, 5)).toBe('2025-01-10');
  });
});

describe('calculateAllEndDates', () => {
  const person = { id: 'p1', name: 'Alice', role: 'Developer' as const, teamId: 't1', effectiveCapacity: 1.0 };
  const memberAlloc = { id: 'ma1', projectId: 'proj1', personId: 'p1', allocationPercentage: 100, endDate: '2099-12-31' };

  it('returns empty map for a scenario with no projects', () => {
    const scenario = makeScenario({ people: [person], projectMemberAllocations: [memberAlloc] });
    expect(calculateAllEndDates(scenario).size).toBe(0);
  });

  it('uses stored endDate for manual-mode projects', () => {
    const scenario = makeScenario({
      people: [person],
      projects: [{
        id: 'proj1', name: 'P1', streamId: 'st1',
        startDate: '2025-01-06', estimate: 10,
        endDateMode: 'manual', endDate: '2025-03-01',
        notes: '', priority: 1,
      }],
    });
    const result = calculateAllEndDates(scenario);
    expect(result.get('proj1')).toBe('2025-03-01');
  });

  it('calculates end date for calculated-mode projects using member allocations', () => {
    // Alice at 100% → 5 days/week, estimate = 5 → Friday of week 1 = Jan 10
    const scenario = makeScenario({
      people: [person],
      projects: [{
        id: 'proj1', name: 'P1', streamId: 'st1',
        startDate: '2025-01-06', estimate: 5,
        endDateMode: 'calculated', endDate: null,
        notes: '', priority: 1,
      }],
      projectMemberAllocations: [memberAlloc],
    });
    const result = calculateAllEndDates(scenario);
    expect(result.get('proj1')).toBe('2025-01-10');
  });

  it('returns null end date when stream has no capacity', () => {
    const scenario = makeScenario({
      people: [],
      projectMemberAllocations: [],
      projects: [{
        id: 'proj1', name: 'P1', streamId: 'st1',
        startDate: '2025-01-06', estimate: 5,
        endDateMode: 'calculated', endDate: null,
        notes: '', priority: 1,
      }],
    });
    const result = calculateAllEndDates(scenario);
    expect(result.get('proj1')).toBeNull();
  });
});
