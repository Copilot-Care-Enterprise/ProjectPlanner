import { computed, Injectable, signal } from '@angular/core';
import type { AppState, Person, Project, ProjectMemberAllocation, Scenario, Stream, StreamAllocation, Team } from '../../core/types';
import { detectConflicts } from '../../core/conflicts';
import { calculateAllEndDates } from '../../core/engine';
import { migrateSchema, normalizePriorities, SCHEMA_VERSION } from '../../core/schema';
import { generateId } from '../../shared/utils/ids';

const DEFAULT_BASELINE_ID = 'scenario-baseline';
const LS_KEY = 'portfolio-planner-state';

function createDefaultState(): AppState {
  return {
    productName: 'My Portfolio',
    activeScenarioId: DEFAULT_BASELINE_ID,
    scenarios: [
      {
        id: DEFAULT_BASELINE_ID,
        name: 'Baseline',
        isBaseline: true,
        baselineId: null,
        createdAt: new Date().toISOString(),
        teams: [],
        people: [],
        streams: [],
        streamAllocations: [],
        projects: [],
        projectMemberAllocations: [],
      },
    ],
  };
}

/** Attempt to restore state from localStorage; returns null on any error. */
function loadFromStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Re-use migrateSchema to validate the same export envelope shape
    const exported = migrateSchema(parsed);
    // Guarantee every scenario has the new field (backward-compat)
    const scenarios = exported.scenarios.map(s => ({
      ...s,
      projectMemberAllocations: s.projectMemberAllocations ?? [],
    }));
    return {
      productName: exported.productName,
      activeScenarioId: exported.activeScenarioId,
      scenarios: scenarios as AppState['scenarios'],
    };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  // ─── Root signal ────────────────────────────────────────────────────────────
  private readonly _state = signal<AppState>(loadFromStorage() ?? createDefaultState());

  /** Serialised snapshot of the last manually-saved state (matches what is in localStorage). */
  private readonly _savedSnapshot = signal<string>(localStorage.getItem(LS_KEY) ?? '');

  // ─── Derived / computed ─────────────────────────────────────────────────────
  readonly productName = computed(() => this._state().productName);
  readonly scenarios = computed(() => this._state().scenarios);
  readonly activeScenarioId = computed(() => this._state().activeScenarioId);

  readonly activeScenario = computed<Scenario | undefined>(() => {
    const id = this._state().activeScenarioId;
    return this._state().scenarios.find((s: Scenario) => s.id === id);
  });

  readonly baseline = computed<Scenario | undefined>(() =>
    this._state().scenarios.find((s: Scenario) => s.isBaseline),
  );

  readonly conflicts = computed(() => {
    const scenario = this.activeScenario();
    if (!scenario) return [];
    const base = this.baseline();
    return detectConflicts(scenario, scenario.isBaseline ? undefined : base);
  });

  readonly calculatedEndDates = computed(() => {
    const scenario = this.activeScenario();
    if (!scenario) return new Map<string, string | null>();
    return calculateAllEndDates(scenario);
  });

  /** True when in-memory state differs from the last saved localStorage snapshot. */
  readonly isDirty = computed(() => this.stateAsExportJson() !== this._savedSnapshot());

  // ─── Persistence ─────────────────────────────────────────────────────────────
  private stateAsExportJson(): string {
    const state = this._state();
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '',
      productName: state.productName,
      activeScenarioId: state.activeScenarioId,
      scenarios: state.scenarios,
    });
  }

  saveToLocalStorage(): void {
    const json = this.stateAsExportJson();
    localStorage.setItem(LS_KEY, json);
    this._savedSnapshot.set(json);
  }

  // ─── State helpers ───────────────────────────────────────────────────────────
  private update(fn: (state: AppState) => AppState): void {
    this._state.update(fn);
  }

  private updateScenario(scenarioId: string, fn: (s: Scenario) => Scenario): void {
    this.update((state: AppState) => ({
      ...state,
      scenarios: state.scenarios.map((s: Scenario) => (s.id === scenarioId ? fn(s) : s)),
    }));
  }

  private activeId(): string {
    return this._state().activeScenarioId;
  }

  // ─── Product name ────────────────────────────────────────────────────────────
  setProductName(name: string): void {
    this.update((s: AppState) => ({ ...s, productName: name }));
  }

  // ─── Scenario management ─────────────────────────────────────────────────────
  setActiveScenario(id: string): void {
    this.update((s: AppState) => ({ ...s, activeScenarioId: id }));
  }

  createWhatIfScenario(name: string): string {
    const base = this.baseline();
    if (!base) throw new Error('No baseline found');
    const clone: Scenario = {
      ...structuredClone(base),
      id: generateId(),
      name,
      isBaseline: false,
      baselineId: base.id,
      createdAt: new Date().toISOString(),
    };
    this.update((s: AppState) => ({ ...s, scenarios: [...s.scenarios, clone], activeScenarioId: clone.id }));
    return clone.id;
  }

  deleteScenario(id: string): void {
    const state = this._state();
    const scenario = state.scenarios.find((s: Scenario) => s.id === id);
    if (!scenario || scenario.isBaseline) return;
    const remaining = state.scenarios.filter((s: Scenario) => s.id !== id);
    const newActive = state.activeScenarioId === id
      ? (remaining.find((s: Scenario) => s.isBaseline)?.id ?? remaining[0]?.id ?? '')
      : state.activeScenarioId;
    this.update((s: AppState) => ({ ...s, scenarios: remaining, activeScenarioId: newActive }));
  }

  renameScenario(id: string, name: string): void {
    this.updateScenario(id, (s: Scenario) => ({ ...s, name }));
  }

  // ─── Teams ───────────────────────────────────────────────────────────────────
  addTeam(data: Omit<Team, 'id'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, teams: [...s.teams, { ...data, id }],
    }));
    return id;
  }

  updateTeam(id: string, data: Partial<Omit<Team, 'id'>>): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, teams: s.teams.map((t: Team) => t.id === id ? { ...t, ...data } : t),
    }));
  }

  deleteTeam(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      teams: s.teams.filter((t: Team) => t.id !== id),
      people: s.people.filter((p: Person) => p.teamId !== id),
    }));
  }

  // ─── People ──────────────────────────────────────────────────────────────────
  addPerson(data: Omit<Person, 'id'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, people: [...s.people, { ...data, id }],
    }));
    return id;
  }

  updatePerson(id: string, data: Partial<Omit<Person, 'id'>>): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, people: s.people.map((p: Person) => p.id === id ? { ...p, ...data } : p),
    }));
  }

  deletePerson(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      people: s.people.filter((p: Person) => p.id !== id),
      streamAllocations: s.streamAllocations.filter((a: StreamAllocation) => a.personId !== id),
      projectMemberAllocations: s.projectMemberAllocations.filter((a: ProjectMemberAllocation) => a.personId !== id),
    }));
  }

  // ─── Streams ─────────────────────────────────────────────────────────────────
  addStream(data: Omit<Stream, 'id'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, streams: [...s.streams, { ...data, id }],
    }));
    return id;
  }

  updateStream(id: string, data: Partial<Omit<Stream, 'id'>>): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, streams: s.streams.map((st: Stream) => st.id === id ? { ...st, ...data } : st),
    }));
  }

  deleteStream(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      streams: s.streams.filter((st: Stream) => st.id !== id),
      streamAllocations: s.streamAllocations.filter((a: StreamAllocation) => a.streamId !== id),
      projects: s.projects.filter((p: Project) => p.streamId !== id),
    }));
  }

  // ─── Stream Allocations ──────────────────────────────────────────────────────
  addAllocation(data: Omit<StreamAllocation, 'id'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, streamAllocations: [...s.streamAllocations, { ...data, id }],
    }));
    return id;
  }

  updateAllocation(id: string, allocationPercentage: number): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      streamAllocations: s.streamAllocations.map((a: StreamAllocation) =>
        a.id === id ? { ...a, allocationPercentage } : a,
      ),
    }));
  }

  deleteAllocation(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, streamAllocations: s.streamAllocations.filter((a: StreamAllocation) => a.id !== id),
    }));
  }

  // ─── Projects ────────────────────────────────────────────────────────────────
  addProject(data: Omit<Project, 'id' | 'priority'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      projects: [...s.projects, { ...data, id, priority: s.projects.length + 1 }],
    }));
    return id;
  }

  reorderProjects(orderedIds: string[]): void {
    this.updateScenario(this.activeId(), (s: Scenario) => {
      const idxMap = new Map(orderedIds.map((id, i) => [id, i + 1]));
      const reordered = [...s.projects].map((p: Project) => ({
        ...p,
        priority: idxMap.get(p.id) ?? p.priority,
      }));
      return { ...s, projects: reordered };
    });
  }

  moveProjectToPriority(id: string, newPriority: number): void {
    this.updateScenario(this.activeId(), (s: Scenario) => {
      const sorted = [...s.projects].sort((a: Project, b: Project) => a.priority - b.priority);
      const idx = sorted.findIndex((p: Project) => p.id === id);
      if (idx === -1) return s;
      const [moved] = sorted.splice(idx, 1);
      const clamped = Math.max(1, Math.min(newPriority, sorted.length + 1));
      sorted.splice(clamped - 1, 0, moved);
      const resequenced = sorted.map((p: Project, i: number) => ({ ...p, priority: i + 1 }));
      return { ...s, projects: resequenced };
    });
  }

  updateProject(id: string, data: Partial<Omit<Project, 'id'>>): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, projects: s.projects.map((p: Project) => p.id === id ? { ...p, ...data } : p),
    }));
  }

  deleteProject(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      projects: s.projects.filter((p: Project) => p.id !== id),
      projectMemberAllocations: s.projectMemberAllocations.filter((a: ProjectMemberAllocation) => a.projectId !== id),
    }));
  }

  // ─── Project Member Allocations ──────────────────────────────────────────────
  addProjectMember(data: Omit<ProjectMemberAllocation, 'id'>): string {
    const id = generateId();
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s, projectMemberAllocations: [...s.projectMemberAllocations, { ...data, id }],
    }));
    return id;
  }

  updateProjectMember(id: string, data: Partial<Omit<ProjectMemberAllocation, 'id'>>): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      projectMemberAllocations: s.projectMemberAllocations.map((a: ProjectMemberAllocation) =>
        a.id === id ? { ...a, ...data } : a,
      ),
    }));
  }

  deleteProjectMember(id: string): void {
    this.updateScenario(this.activeId(), (s: Scenario) => ({
      ...s,
      projectMemberAllocations: s.projectMemberAllocations.filter((a: ProjectMemberAllocation) => a.id !== id),
    }));
  }

  // ─── Team/People/Stream bulk import (upsert by name) ─────────────────────────
  /**
   * Upserts teams, streams, and people by name (case-insensitive match).
   * Existing records with the same name are updated; new names are inserted.
   * Processing order: teams → streams → people so references resolve correctly.
   */
  importTeamsPeople(payload: {
    teams: Array<{ name: string; description: string }>;
    streams: Array<{ name: string; description: string; color: string }>;
    people: Array<{ name: string; teamName: string; role: 'Developer' | 'SDET'; effectiveCapacity: number }>;
  }): void {
    this.updateScenario(this.activeId(), (s: Scenario) => {
      let teams = [...s.teams];
      let streams = [...s.streams];
      let people = [...s.people];

      // Upsert teams
      for (const t of payload.teams) {
        const existing = teams.find(e => e.name.toLowerCase() === t.name.toLowerCase());
        if (existing) {
          teams = teams.map(e => e.id === existing.id ? { ...e, name: t.name, description: t.description } : e);
        } else {
          teams = [...teams, { id: generateId(), name: t.name, description: t.description }];
        }
      }

      // Upsert streams
      for (const st of payload.streams) {
        const existing = streams.find(e => e.name.toLowerCase() === st.name.toLowerCase());
        if (existing) {
          streams = streams.map(e => e.id === existing.id ? { ...e, name: st.name, description: st.description, color: st.color } : e);
        } else {
          streams = [...streams, { id: generateId(), name: st.name, description: st.description, color: st.color }];
        }
      }

      // Upsert people (resolve teamId from the freshly-upserted teams list)
      for (const p of payload.people) {
        const team = teams.find(t => t.name.toLowerCase() === p.teamName.toLowerCase());
        if (!team) continue; // skip if team not found (validation should catch this earlier)
        const existing = people.find(e => e.name.toLowerCase() === p.name.toLowerCase());
        if (existing) {
          people = people.map(e => e.id === existing.id
            ? { ...e, name: p.name, teamId: team.id, role: p.role, effectiveCapacity: p.effectiveCapacity }
            : e,
          );
        } else {
          people = [...people, { id: generateId(), name: p.name, teamId: team.id, role: p.role, effectiveCapacity: p.effectiveCapacity }];
        }
      }

      return { ...s, teams, streams, people };
    });
  }

  // ─── Import / Export ─────────────────────────────────────────────────────────
  exportToFile(): void {
    const state = this._state();
    const exportData = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      productName: state.productName,
      activeScenarioId: state.activeScenarioId,
      scenarios: state.scenarios,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-export-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importFromJson(json: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      alert('Import failed: file is not valid JSON.');
      return;
    }
    try {
      const exported = migrateSchema(raw);
      const newState: AppState = {
        productName: exported.productName,
        activeScenarioId: exported.activeScenarioId,
        scenarios: exported.scenarios.map(s => ({
          ...s,
          projectMemberAllocations: s.projectMemberAllocations ?? [],
        })) as AppState['scenarios'],
      };
      this.update((_: AppState) => newState);
      // After import, treat the state as saved so isDirty starts false
      this.saveToLocalStorage();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Import failed: ${msg}`);
    }
  }

  loadState(state: AppState): void {
    this._state.set(state);
  }
}
