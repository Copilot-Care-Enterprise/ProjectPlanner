// ─── Enums ───────────────────────────────────────────────────────────────────

export type Role = 'Developer' | 'SDET';

export type EndDateMode = 'calculated' | 'manual';

export type ConflictType =
  | 'person-overallocated-static'
  | 'stream-congested'
  | 'project-under-capacity'
  | 'project-slippage-risk';

// ─── Domain Entities ─────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description: string;
}

export interface Person {
  id: string;
  name: string;
  teamId: string;
  role: Role;
  /** 0.0 – 1.0 */
  effectiveCapacity: number;
}

export interface Stream {
  id: string;
  name: string;
  description: string;
  /** Hex colour for Gantt display e.g. "#4F46E5" */
  color: string;
}

export interface StreamAllocation {
  id: string;
  personId: string;
  streamId: string;
  /** 1 – 100 */
  allocationPercentage: number;
}

export interface ProjectMemberAllocation {
  id: string;
  projectId: string;
  personId: string;
  /** 1 – 100 */
  allocationPercentage: number;
  /** ISO date YYYY-MM-DD — when this person stops contributing to the project */
  endDate: string;
}

export interface Project {
  id: string;
  name: string;
  streamId: string;
  /** ISO date string YYYY-MM-DD */
  startDate: string;
  /** ISO date string YYYY-MM-DD; null when endDateMode='calculated' and not yet computed */
  endDate: string | null;
  endDateMode: EndDateMode;
  /** Ideal person-days */
  estimate: number;
  notes: string;
  /** Display and scheduling priority — unique positive integer; lower = higher priority */
  priority: number;
}

// ─── Scenario ────────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  name: string;
  isBaseline: boolean;
  /** ID of the baseline this was forked from; null for the baseline itself */
  baselineId: string | null;
  createdAt: string;
  teams: Team[];
  people: Person[];
  streams: Stream[];
  streamAllocations: StreamAllocation[];
  projects: Project[];
  projectMemberAllocations: ProjectMemberAllocation[];
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  productName: string;
  activeScenarioId: string;
  scenarios: Scenario[];
}

// ─── Computed / Runtime only ─────────────────────────────────────────────────

export interface Conflict {
  id: string;
  type: ConflictType;
  scenarioId: string;
  /** ISO date string for the Monday of the affected week */
  weekStart?: string;
  personId?: string;
  personName?: string;
  streamId?: string;
  streamName?: string;
  projectIds: string[];
  projectNames: string[];
  /** Sum of allocation percentages for person-overallocated-static */
  totalAllocationPercentage?: number;
  /** For project-under-capacity: the fixed end date the user entered */
  fixedEndDate?: string;
  /** For project-under-capacity / slippage-risk: what the engine calculates */
  calculatedEndDate?: string;
  /** Plain-English explanation */
  message: string;
}

export interface SlippageRecord {
  projectId: string;
  projectName: string;
  baselineEndDate: string | null;
  scenarioEndDate: string | null;
}
