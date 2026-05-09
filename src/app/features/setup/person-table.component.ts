import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../../store/app.store';
import type { Person, ProjectMemberAllocation, Role, Team } from '../../../core/types';

const ROLES: Role[] = ['Developer', 'SDET'];

type SortCol = 'name' | 'team' | 'role' | 'capacity' | 'allocated' | 'status';
type StatusVal = 'over' | 'active' | 'idle';
const STATUS_ORDER: Record<StatusVal, number> = { over: 0, active: 1, idle: 2 };

interface PersonForm {
  name: string;
  teamId: string;
  role: Role;
  effectiveCapacity: number;
}

@Component({
  selector: 'app-person-table',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <div class="card-head">
        <span class="card-title">People</span>
        <button class="btn btn-primary" (click)="openAdd()">+ Add person</button>
      </div>

      @if (people().length === 0) {
        <p class="empty">No people yet. Add team members to allocate them to streams.</p>
      } @else {
        <table class="data-table">
          <thead>
            <!-- ── Sort row ── -->
            <tr>
              <th class="sortable" (click)="sortBy('name')">
                Name <span class="sort-icon" [class.active]="sortCol()==='name'">{{ sortIcon('name') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('team')">
                Team <span class="sort-icon" [class.active]="sortCol()==='team'">{{ sortIcon('team') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('role')">
                Role <span class="sort-icon" [class.active]="sortCol()==='role'">{{ sortIcon('role') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('capacity')">
                Capacity <span class="sort-icon" [class.active]="sortCol()==='capacity'">{{ sortIcon('capacity') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('allocated')">
                Allocated <span class="sort-icon" [class.active]="sortCol()==='allocated'">{{ sortIcon('allocated') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('status')">
                Status <span class="sort-icon" [class.active]="sortCol()==='status'">{{ sortIcon('status') }}</span>
              </th>
              <th style="width:7rem">Actions</th>
            </tr>
            <!-- ── Filter row ── -->
            <tr class="filter-row">
              <th>
                <input class="f-input" placeholder="Filter name…"
                  [ngModel]="filterName()" (ngModelChange)="filterName.set($event)" (click)="$event.stopPropagation()" />
              </th>
              <th>
                <select class="f-input" [ngModel]="filterTeamId()" (ngModelChange)="filterTeamId.set($event)" (click)="$event.stopPropagation()">
                  <option value="">All teams</option>
                  @for (team of teams(); track team.id) {
                    <option [value]="team.id">{{ team.name }}</option>
                  }
                </select>
              </th>
              <th>
                <select class="f-input" [ngModel]="filterRole()" (ngModelChange)="filterRole.set($event)" (click)="$event.stopPropagation()">
                  <option value="">All roles</option>
                  @for (role of roles; track role) { <option [value]="role">{{ role }}</option> }
                </select>
              </th>
              <th></th>
              <th></th>
              <th>
                <select class="f-input" [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event)" (click)="$event.stopPropagation()">
                  <option value="">All</option>
                  <option value="over">Overallocated</option>
                  <option value="active">Active</option>
                  <option value="idle">Idle</option>
                </select>
              </th>
              <th>
                @if (isFiltered()) {
                  <button class="btn-lnk btn-lnk-blue" style="font-size:.75rem" (click)="clearFilters()">Clear</button>
                }
              </th>
            </tr>
          </thead>
          <tbody>
            @for (person of displayedPeople(); track person.id) {
              <tr>
                <td><strong>{{ person.name }}</strong></td>
                <td style="color:var(--muted)">{{ teamName(person.teamId) }}</td>
                <td><span class="badge badge-blue">{{ person.role }}</span></td>
                <td>{{ (person.effectiveCapacity * 100).toFixed(0) }}%</td>
                <td [style.color]="personAllocated(person.id) > person.effectiveCapacity * 100 ? 'var(--danger)' : 'var(--text)'">
                  {{ personAllocated(person.id) }}%
                </td>
                <td>
                  @switch (personStatus(person)) {
                    @case ('over')   { <span class="badge badge-red">Overallocated</span> }
                    @case ('active') { <span class="badge badge-green">Active</span> }
                    @default         { <span class="badge" style="background:var(--border);color:var(--muted)">Idle</span> }
                  }
                </td>
                <td style="display:flex;gap:.75rem">
                  <button class="btn-lnk btn-lnk-blue" (click)="openEdit(person)">Edit</button>
                  <button class="btn-lnk btn-lnk-red"  (click)="deletePerson(person.id)">Delete</button>
                </td>
              </tr>
            }
            @if (displayedPeople().length === 0) {
              <tr><td colspan="7" class="empty" style="text-align:center">No people match the current filters.</td></tr>
            }
          </tbody>
        </table>
      }
    </div>

    @if (dialogOpen()) {
      <div class="dlg-back" (click)="closeDialog()">
        <div class="dlg-box" style="max-width:28rem" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">{{ editId() ? 'Edit person' : 'Add person' }}</span></div>
          <form (ngSubmit)="save()" #f="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Name <span class="freq">*</span></label>
                <input name="name" [(ngModel)]="form.name" required class="finput" placeholder="Alice Smith" />
              </div>
              <div class="fg">
                <label class="flabel">Team <span class="freq">*</span></label>
                <select name="teamId" [(ngModel)]="form.teamId" required class="finput">
                  <option value="">— select team —</option>
                  @for (team of teams(); track team.id) {
                    <option [value]="team.id">{{ team.name }}</option>
                  }
                </select>
              </div>
              <div class="fg">
                <label class="flabel">Role <span class="freq">*</span></label>
                <select name="role" [(ngModel)]="form.role" required class="finput">
                  @for (role of roles; track role) { <option [value]="role">{{ role }}</option> }
                </select>
              </div>
              <div class="fg">
                <label class="flabel">Effective capacity: {{ (form.effectiveCapacity * 100).toFixed(0) }}%</label>
                <input type="range" name="effectiveCapacity" [(ngModel)]="form.effectiveCapacity"
                  min="0.1" max="1" step="0.05" style="width:100%;accent-color:var(--accent)" />
                <div class="fhint"><span>10%</span><span>100%</span></div>
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeDialog()">Cancel</button>
              <button type="submit" [disabled]="f.invalid" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class PersonTableComponent {
  private readonly store = inject(AppStore);

  readonly roles = ROLES;
  readonly people  = computed<Person[]>(() => this.store.activeScenario()?.people ?? []);
  readonly teams   = computed<Team[]>(() => this.store.activeScenario()?.teams ?? []);

  // ── Sort state ──
  readonly sortCol = signal<SortCol | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('asc');

  // ── Filter state ──
  readonly filterName   = signal('');
  readonly filterTeamId = signal('');
  readonly filterRole   = signal<Role | ''>('');
  readonly filterStatus = signal<StatusVal | ''>('');

  readonly isFiltered = computed(() =>
    this.filterName() !== '' || this.filterTeamId() !== '' ||
    this.filterRole() !== '' || this.filterStatus() !== ''
  );

  clearFilters(): void {
    this.filterName.set('');
    this.filterTeamId.set('');
    this.filterRole.set('');
    this.filterStatus.set('');
  }

  /** Total project allocation % per person — only counts allocations whose endDate is today or future. */
  readonly personUtilization = computed<Map<string, number>>(() => {
    const today  = new Date().toISOString().slice(0, 10);
    const allocs: ProjectMemberAllocation[] =
      this.store.activeScenario()?.projectMemberAllocations ?? [];
    const map = new Map<string, number>();
    for (const a of allocs) {
      if (a.endDate >= today) {
        map.set(a.personId, (map.get(a.personId) ?? 0) + a.allocationPercentage);
      }
    }
    return map;
  });

  private statusOf(person: Person): StatusVal {
    const allocated = this.personUtilization().get(person.id) ?? 0;
    if (allocated === 0) return 'idle';
    if (allocated > person.effectiveCapacity * 100) return 'over';
    return 'active';
  }

  readonly displayedPeople = computed<Person[]>(() => {
    const util    = this.personUtilization();
    const teams   = this.teams();
    const name    = this.filterName().toLowerCase().trim();
    const teamId  = this.filterTeamId();
    const role    = this.filterRole();
    const status  = this.filterStatus();
    const col     = this.sortCol();
    const dir     = this.sortDir();

    const teamNameOf  = (id: string) => teams.find(t => t.id === id)?.name ?? '';
    const allocOf     = (p: Person)  => util.get(p.id) ?? 0;
    const statusOf    = (p: Person): StatusVal => {
      const a = allocOf(p);
      if (a === 0) return 'idle';
      if (a > p.effectiveCapacity * 100) return 'over';
      return 'active';
    };

    let result = this.people().filter(p => {
      if (name   && !p.name.toLowerCase().includes(name)) return false;
      if (teamId && p.teamId !== teamId)                  return false;
      if (role   && p.role !== role)                      return false;
      if (status && statusOf(p) !== status)               return false;
      return true;
    });

    if (col) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (col) {
          case 'name':      cmp = a.name.localeCompare(b.name); break;
          case 'team':      cmp = teamNameOf(a.teamId).localeCompare(teamNameOf(b.teamId)); break;
          case 'role':      cmp = a.role.localeCompare(b.role); break;
          case 'capacity':  cmp = a.effectiveCapacity - b.effectiveCapacity; break;
          case 'allocated': cmp = allocOf(a) - allocOf(b); break;
          case 'status':    cmp = STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]; break;
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  });

  sortBy(col: SortCol): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  sortIcon(col: SortCol): string {
    if (this.sortCol() !== col) return '↕';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  personAllocated(personId: string): number {
    return this.personUtilization().get(personId) ?? 0;
  }

  personStatus(person: Person): StatusVal {
    return this.statusOf(person);
  }

  readonly dialogOpen = signal(false);
  readonly editId = signal<string | null>(null);
  form: PersonForm = { name: '', teamId: '', role: 'Developer', effectiveCapacity: 1.0 };

  teamName(teamId: string): string {
    return this.teams().find((t: Team) => t.id === teamId)?.name ?? '—';
  }

  openAdd(): void {
    this.editId.set(null);
    this.form = { name: '', teamId: '', role: 'Developer', effectiveCapacity: 1.0 };
    this.dialogOpen.set(true);
  }

  openEdit(person: Person): void {
    this.editId.set(person.id);
    this.form = {
      name: person.name,
      teamId: person.teamId,
      role: person.role,
      effectiveCapacity: person.effectiveCapacity,
    };
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  save(): void {
    const id = this.editId();
    const data = {
      name: this.form.name.trim(),
      teamId: this.form.teamId,
      role: this.form.role,
      effectiveCapacity: Number(this.form.effectiveCapacity),
    };
    if (id) {
      this.store.updatePerson(id, data);
    } else {
      this.store.addPerson(data);
    }
    this.closeDialog();
  }

  deletePerson(id: string): void {
    if (confirm('Delete this person? Their stream allocations will also be removed.')) {
      this.store.deletePerson(id);
    }
  }
}
