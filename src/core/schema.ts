import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0';

// ─── Entity schemas ───────────────────────────────────────────────────────────

const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
});

const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  role: z.enum(['Developer', 'SDET', 'Operations']),
  effectiveCapacity: z.number().min(0).max(1),
});

const StreamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex colour like #4F46E5'),
});

const StreamAllocationSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  streamId: z.string().min(1),
  allocationPercentage: z.number().int().min(1).max(100),
});

const ProjectMemberAllocationSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  personId: z.string().min(1),
  allocationPercentage: z.number().int().min(1).max(100),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  streamId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDateMode: z.enum(['calculated', 'manual']),
  estimate: z.number().positive(),
  notes: z.string(),
  // Optional with default 0 as sentinel; normalized to sequential values in migrateSchema
  priority: z.number().int().optional().default(0),
});

const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isBaseline: z.boolean(),
  baselineId: z.string().nullable(),
  createdAt: z.string(),
  teams: z.array(TeamSchema),
  people: z.array(PersonSchema),
  streams: z.array(StreamSchema),
  streamAllocations: z.array(StreamAllocationSchema),
  projects: z.array(ProjectSchema),
  // Optional with default for backward-compat with v1.0.0 exports
  projectMemberAllocations: z.array(ProjectMemberAllocationSchema).optional().default([]),
});

export const ExportFileSchema = z.object({
  schemaVersion: z.string(),
  exportedAt: z.string(),
  productName: z.string(),
  activeScenarioId: z.string(),
  scenarios: z.array(ScenarioSchema),
});

export type ExportFile = z.infer<typeof ExportFileSchema>;

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Assigns sequential priorities (1, 2, 3…) to projects whose priority is 0 (sentinel for
 * legacy data loaded before the priority field existed). Projects that already have a
 * positive priority are left untouched, then re-sequenced to fill any gaps.
 */
export function normalizePriorities<T extends { priority: number }>(projects: T[]): T[] {
  if (projects.length === 0) return projects;
  // If all already have positive priorities, re-sort and re-sequence to close gaps
  const allSet = projects.every(p => p.priority > 0);
  if (allSet) {
    return [...projects]
      .sort((a, b) => a.priority - b.priority)
      .map((p, i) => ({ ...p, priority: i + 1 }));
  }
  // Legacy data: assign priorities in array order
  return projects.map((p, i) => ({ ...p, priority: i + 1 }));
}

/**
 * Runs any needed migrations on the raw parsed object before it reaches the store.
 * Normalizes project priorities so every project has a unique positive integer.
 */
export function migrateSchema(raw: unknown): ExportFile {
  // Pre-pass: rename legacy role value "Tester" → "SDET" before Zod validates the enum
  const migrated = migrateRawRoles(raw);
  const parsed = ExportFileSchema.parse(migrated); // throws ZodError on invalid input
  const [major] = parsed.schemaVersion.split('.');
  const [currentMajor] = SCHEMA_VERSION.split('.');
  if (major !== currentMajor) {
    throw new Error(
      `Cannot import schema version ${parsed.schemaVersion} — current version is ${SCHEMA_VERSION}. Major version mismatch.`,
    );
  }
  // Normalize priorities for each scenario
  return {
    ...parsed,
    scenarios: parsed.scenarios.map(s => ({
      ...s,
      projects: normalizePriorities(s.projects),
    })),
  };
}

/** Walks the raw unknown payload and replaces role "Tester" with "SDET" for backward compat. */
function migrateRawRoles(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj['scenarios'])) return raw;
  return {
    ...obj,
    scenarios: (obj['scenarios'] as unknown[]).map(sc => {
      if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return sc;
      const scenario = sc as Record<string, unknown>;
      if (!Array.isArray(scenario['people'])) return scenario;
      return {
        ...scenario,
        people: (scenario['people'] as unknown[]).map(p => {
          if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
          const person = p as Record<string, unknown>;
          if (person['role'] === 'Tester') return { ...person, role: 'SDET' };
          return person;
        }),
      };
    }),
  };
}
