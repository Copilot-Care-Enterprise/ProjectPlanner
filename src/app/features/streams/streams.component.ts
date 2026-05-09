import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../../store/app.store';
import type { Stream, Person, Project, ProjectMemberAllocation } from '../../../core/types';

const DEFAULT_COLORS = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0284C7'];

interface StreamForm {
  name: string;
  description: string;
  color: string;
}

/** Derived allocation row — computed from project member allocations */
interface DerivedAlloc {
  personId: string;
  totalPct: number;
  projectNames: string[];
}

@Component({
  selector: 'app-streams',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-wrap">
      <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
        <button class="btn btn-primary" (click)="openAddStream()">+ Add stream</button>
      </div>

      @if (streams().length === 0) {
        <p class="empty">No streams yet. Create a stream to start assigning projects.</p>
      } @else {
        @for (stream of streams(); track stream.id) {
          <div class="card">
            <!-- Stream card header -->
            <div class="card-head">
              <div style="display:flex;align-items:center;gap:.625rem">
                <span style="width:.875rem;height:.875rem;border-radius:50%;flex-shrink:0" [style.background]="stream.color"></span>
                <span class="card-title">{{ stream.name }}</span>
                @if (stream.description) {
                  <span style="font-size:.8125rem;color:#94a3b8;font-weight:400">{{ stream.description }}</span>
                }
              </div>
              <div style="display:flex;align-items:center;gap:1.25rem">
                <span style="font-size:.8125rem;color:#94a3b8">{{ weeklyCapacityStr(stream.id) }} days/week</span>
                <button class="btn-lnk btn-lnk-blue" style="color:#93c5fd" (click)="openEditStream(stream)">Edit</button>
                <button class="btn-lnk btn-lnk-red"  style="color:#fca5a5" (click)="deleteStream(stream.id)">Delete</button>
              </div>
            </div>

            <!-- Derived people allocations -->
            <div style="padding:.875rem 1.25rem">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
                <span style="font-size:.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">People (from projects)</span>
                <span style="font-size:.75rem;color:var(--muted)">Manage allocations in the Projects tab</span>
              </div>

              @if (derivedAllocsForStream(stream.id).length === 0) {
                <p style="color:var(--muted);font-size:.8125rem">No people allocated — add project members in the Projects tab.</p>
              } @else {
                <table class="data-table">
                  <thead><tr>
                    <th>Person</th><th>Role</th><th>Projects</th><th>Total Allocation</th>
                  </tr></thead>
                  <tbody>
                    @for (alloc of derivedAllocsForStream(stream.id); track alloc.personId) {
                      <tr>
                        <td>{{ personName(alloc.personId) }}</td>
                        <td style="color:var(--muted)">{{ personRole(alloc.personId) }}</td>
                        <td style="color:var(--muted);font-size:.8125rem">{{ alloc.projectNames.join(', ') }}</td>
                        <td>
                          <span [style.color]="alloc.totalPct > 100 ? 'var(--danger)' : 'var(--text)'">
                            {{ alloc.totalPct }}%
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- Stream dialog -->
    @if (streamDialogOpen()) {
      <div class="dlg-back" (click)="closeStreamDialog()">
        <div class="dlg-box" style="max-width:28rem" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">{{ streamEditId() ? 'Edit stream' : 'Add stream' }}</span></div>
          <form (ngSubmit)="saveStream()" #sf="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Name <span class="freq">*</span></label>
                <input name="name" [(ngModel)]="streamForm.name" required class="finput" placeholder="Feature Stream A" />
              </div>
              <div class="fg">
                <label class="flabel">Description</label>
                <input name="description" [(ngModel)]="streamForm.description" class="finput" />
              </div>
              <div class="fg">
                <label class="flabel">Color</label>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.25rem">
                  @for (c of colors; track c) {
                    <button type="button" class="swatch" [class.sel]="streamForm.color === c"
                      [style.background]="c" (click)="streamForm.color = c"></button>
                  }
                </div>
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeStreamDialog()">Cancel</button>
              <button type="submit" [disabled]="sf.invalid" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class StreamsComponent {
  private readonly store = inject(AppStore);

  readonly colors = DEFAULT_COLORS;

  readonly streams  = computed<Stream[]>(() => this.store.activeScenario()?.streams ?? []);
  readonly people   = computed<Person[]>(() => this.store.activeScenario()?.people ?? []);
  readonly projects = computed<Project[]>(() => this.store.activeScenario()?.projects ?? []);
  readonly projectMemberAllocations = computed<ProjectMemberAllocation[]>(
    () => this.store.activeScenario()?.projectMemberAllocations ?? []
  );

  /** Map of streamId → derived allocation rows (aggregated from project member allocations). */
  readonly derivedAllocsByStream = computed<Map<string, DerivedAlloc[]>>(() => {
    const result = new Map<string, DerivedAlloc[]>();
    for (const stream of this.streams()) {
      const streamProjects = this.projects().filter(p => p.streamId === stream.id);
      const personMap = new Map<string, { totalPct: number; projectNames: string[] }>();
      for (const project of streamProjects) {
        for (const alloc of this.projectMemberAllocations().filter(a => a.projectId === project.id)) {
          const existing = personMap.get(alloc.personId) ?? { totalPct: 0, projectNames: [] };
          personMap.set(alloc.personId, {
            totalPct: existing.totalPct + alloc.allocationPercentage,
            projectNames: [...existing.projectNames, project.name],
          });
        }
      }
      result.set(stream.id, Array.from(personMap.entries()).map(([personId, data]) => ({
        personId,
        totalPct: data.totalPct,
        projectNames: data.projectNames,
      })));
    }
    return result;
  });

  derivedAllocsForStream(streamId: string): DerivedAlloc[] {
    return this.derivedAllocsByStream().get(streamId) ?? [];
  }

  // ─── Stream dialog ──────────────────────────────────────────────────────────
  readonly streamDialogOpen = signal(false);
  readonly streamEditId = signal<string | null>(null);
  streamForm: StreamForm = { name: '', description: '', color: DEFAULT_COLORS[0] };

  openAddStream(): void {
    this.streamEditId.set(null);
    this.streamForm = { name: '', description: '', color: DEFAULT_COLORS[0] };
    this.streamDialogOpen.set(true);
  }

  openEditStream(stream: Stream): void {
    this.streamEditId.set(stream.id);
    this.streamForm = { name: stream.name, description: stream.description, color: stream.color };
    this.streamDialogOpen.set(true);
  }

  closeStreamDialog(): void { this.streamDialogOpen.set(false); }

  saveStream(): void {
    const id = this.streamEditId();
    const data = { name: this.streamForm.name.trim(), description: this.streamForm.description.trim(), color: this.streamForm.color };
    if (id) {
      this.store.updateStream(id, data);
    } else {
      this.store.addStream(data);
    }
    this.closeStreamDialog();
  }

  deleteStream(id: string): void {
    if (confirm('Delete this stream? All projects in this stream will also be removed.')) {
      this.store.deleteStream(id);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  personName(personId: string): string {
    return this.people().find((p: Person) => p.id === personId)?.name ?? '—';
  }

  personRole(personId: string): string {
    return this.people().find((p: Person) => p.id === personId)?.role ?? '';
  }

  weeklyCapacity(streamId: string): number {
    return this.derivedAllocsForStream(streamId).reduce((total, alloc) => {
      const person = this.people().find(p => p.id === alloc.personId);
      if (!person) return total;
      return total + person.effectiveCapacity * (alloc.totalPct / 100) * 5;
    }, 0);
  }

  weeklyCapacityStr(streamId: string): string {
    return this.weeklyCapacity(streamId).toFixed(1);
  }
}
