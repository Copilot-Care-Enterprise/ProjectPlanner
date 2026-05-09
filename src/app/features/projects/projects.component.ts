import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { AppStore } from '../../store/app.store';
import { generateId } from '../../../shared/utils/ids';
import { countWorkingDays } from '../../../shared/utils/dates';
import type { EndDateMode, Person, Project, ProjectMemberAllocation, Stream, Team } from '../../../core/types';

interface ProjectForm {
  name: string;
  streamId: string;
  startDate: string;
  estimate: number;
  endDateMode: EndDateMode;
  endDate: string;
  notes: string;
}

interface MemberAllocForm {
  personId: string;
  allocationPercentage: number;
  endDate: string;
}

interface AddTeamForm {
  teamId: string;
  allocationPercentage: number;
  endDate: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    <div class="page-wrap">
      <div class="card">
        <div class="card-head">
          <span class="card-title">Projects</span>
          <button class="btn btn-primary" (click)="openAdd()">+ Add project</button>
        </div>

        @if (projects().length === 0) {
          <p class="empty">No projects yet. Add a project to start planning.</p>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:2.5rem"></th>
                <th style="width:4.5rem">Priority</th>
                <th>Name</th><th>Stream</th><th>Members</th><th>Start</th><th>Estimate</th><th>End date</th><th style="width:8rem">Actions</th>
              </tr>
            </thead>
            <tbody cdkDropList [cdkDropListData]="sortedProjects()" (cdkDropListDropped)="onDrop($event)">
              @for (project of sortedProjects(); track project.id) {
                <tr cdkDrag [cdkDragData]="project" style="cursor:default">
                  <td cdkDragHandle style="cursor:grab;color:var(--muted);text-align:center;padding:.5rem .25rem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </td>
                  <td>
                    <input type="number" [value]="project.priority" min="1" [max]="sortedProjects().length"
                      class="finput" style="width:3.5rem;padding:.2rem .4rem;text-align:center"
                      (change)="onPriorityChange(project.id, $event)" />
                  </td>
                  <td><strong>{{ project.name }}</strong></td>
                  <td>
                    <span class="badge" style="color:#fff" [style.background]="streamColor(project.streamId)">
                      {{ streamName(project.streamId) }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [class.badge-blue]="membersCount(project.id) > 0"
                      [style.background]="membersCount(project.id) === 0 ? 'var(--border)' : ''"
                      [style.color]="membersCount(project.id) === 0 ? 'var(--muted)' : ''">
                      {{ membersCount(project.id) === 0 ? 'none' : membersCount(project.id) + ' member' + (membersCount(project.id) === 1 ? '' : 's') }}
                    </span>
                  </td>
                  <td style="color:var(--muted)">{{ project.startDate }}</td>
                  <td style="color:var(--muted)">{{ project.estimate }}d</td>
                  <td>
                    @if (endDate(project.id) == null) {
                      <span style="color:var(--muted);font-style:italic;font-size:.8125rem">No capacity</span>
                    } @else {
                      <span [style.color]="project.endDateMode === 'manual' ? 'var(--warning)' : 'var(--text)'">
                        {{ endDate(project.id) }}
                      </span>
                      @if (project.endDateMode === 'manual') {
                        <span style="font-size:.75rem;color:var(--warning);margin-left:.25rem">(manual)</span>
                      } @else if (membersCount(project.id) > 0) {
                        <span style="font-size:.75rem;color:var(--accent);margin-left:.25rem">(by members)</span>
                      }
                    }
                  </td>
                  <td style="display:flex;gap:.75rem">
                    <button class="btn-lnk btn-lnk-blue" (click)="openEdit(project)">Edit</button>
                    <button class="btn-lnk btn-lnk-red"  (click)="deleteProject(project.id)">Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    <!-- ─── Add / Edit project dialog (with inline member management) ────────── -->
    @if (dialogOpen()) {
      <div class="dlg-back" (click)="closeDialog()">
        <div class="dlg-box" style="max-width:36rem;max-height:92vh;overflow-y:auto" (click)="$event.stopPropagation()">
          <div class="dlg-head">
            <span class="dlg-title">{{ editId() ? 'Edit project' : 'Add project' }}</span>
          </div>
          <form (ngSubmit)="save()" #pf="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Name <span class="freq">*</span></label>
                <input name="name" [(ngModel)]="form.name" required class="finput" placeholder="User authentication" />
              </div>
              <div class="fg">
                <label class="flabel">Stream <span class="freq">*</span></label>
                <select name="streamId" [(ngModel)]="form.streamId" required class="finput">
                  <option value="">— select stream —</option>
                  @for (s of streams(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div class="fg">
                  <label class="flabel">Start date <span class="freq">*</span></label>
                  <input type="date" name="startDate"
                    [ngModel]="form.startDate"
                    (ngModelChange)="form.startDate=$event; formStartDate.set($event)"
                    required class="finput" />
                </div>
                <div class="fg">
                  <label class="flabel">Estimate (days) <span class="freq">*</span></label>
                  @if (autoEstimate() !== null) {
                    <input type="number" name="estimate" [ngModel]="form.estimate"
                      class="finput" readonly
                      style="background:var(--border);color:var(--muted);cursor:not-allowed" />
                    <span class="fhint" style="justify-content:flex-start">
                      Auto-calculated: working days × team capacity
                    </span>
                  } @else {
                    <input type="number" name="estimate" [(ngModel)]="form.estimate" required min="1" class="finput" />
                  }
                </div>
              </div>
              <div class="fg">
                <label class="flabel">End date mode</label>
                <div style="display:flex;gap:1.25rem;margin-top:.25rem">
                  <label style="display:flex;align-items:center;gap:.4rem;font-size:.875rem;cursor:pointer">
                    <input type="radio" name="endDateMode" value="calculated"
                      [ngModel]="form.endDateMode"
                      (ngModelChange)="form.endDateMode=$event; formEndDateMode.set($event)" /> Calculated
                  </label>
                  <label style="display:flex;align-items:center;gap:.4rem;font-size:.875rem;cursor:pointer">
                    <input type="radio" name="endDateMode" value="manual"
                      [ngModel]="form.endDateMode"
                      (ngModelChange)="form.endDateMode=$event; formEndDateMode.set($event)" /> Manual deadline
                  </label>
                </div>
              </div>
              @if (form.endDateMode === 'manual') {
                <div class="fg">
                  <label class="flabel">Fixed end date <span class="freq">*</span></label>
                  <input type="date" name="endDate"
                    [ngModel]="form.endDate"
                    (ngModelChange)="form.endDate=$event; formEndDate.set($event)"
                    [required]="form.endDateMode === 'manual'" class="finput" />
                </div>
              }
              <div class="fg">
                <label class="flabel">Notes</label>
                <textarea name="notes" [(ngModel)]="form.notes" rows="2" class="finput"></textarea>
              </div>

              <!-- ─── Team members section ─────────────────────────────────── -->
              <div style="margin-top:.5rem;padding-top:1rem;border-top:1px solid var(--border)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.625rem">
                  <span style="font-size:.875rem;font-weight:600;color:var(--text)">Team members</span>
                  <div style="display:flex;gap:.5rem">
                    <button type="button" class="btn btn-ghost" style="font-size:.8rem;padding:.25rem .625rem" (click)="openAddTeam()">+ Add full team</button>
                    <button type="button" class="btn btn-primary" style="font-size:.8rem;padding:.25rem .625rem" (click)="openAddMember()">+ Add person</button>
                  </div>
                </div>
                @if (dialogMembers().length === 0) {
                  <p style="font-size:.8125rem;color:var(--muted);margin:0;padding:.375rem 0">
                    No members yet. Add people to model project-specific capacity and individual end dates.
                  </p>
                } @else {
                  <table class="data-table" style="margin:0">
                    <thead><tr>
                      <th>Person</th><th>Role</th><th>Allocation %</th><th>End date</th><th style="width:4.5rem"></th>
                    </tr></thead>
                    <tbody>
                      @for (alloc of dialogMembers(); track alloc.id) {
                        <tr>
                          <td><strong>{{ personName(alloc.personId) }}</strong></td>
                          <td style="color:var(--muted)">{{ personRole(alloc.personId) }}</td>
                          <td>
                            <div style="display:flex;align-items:center;gap:.5rem">
                              <input type="range" min="5" max="100" step="5"
                                [value]="alloc.allocationPercentage"
                                (change)="updateMemberPct(alloc.id, $event)"
                                style="width:5rem;accent-color:var(--accent)" />
                              <span style="font-size:.8125rem;color:var(--muted);min-width:2.25rem">{{ alloc.allocationPercentage }}%</span>
                            </div>
                          </td>
                          <td>
                            <input type="date" [value]="alloc.endDate"
                              (change)="updateMemberEndDate(alloc.id, $event)"
                              class="finput" style="padding:.25rem .5rem;font-size:.8125rem" />
                          </td>
                          <td>
                            <button type="button" class="btn-lnk btn-lnk-red" (click)="removeMember(alloc.id)">Remove</button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeDialog()">Cancel</button>
              <button type="submit" [disabled]="pf.invalid" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Add person sub-dialog ────────────────────────────────────────────── -->
    @if (addMemberDialogOpen()) {
      <div class="dlg-back" style="z-index:60" (click)="closeAddMember()">
        <div class="dlg-box" style="max-width:24rem;z-index:61" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">Add person to project</span></div>
          <form (ngSubmit)="saveMember()" #mf="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Team</label>
                <select name="memberTeamFilter" [ngModel]="memberFilterTeamId()" (ngModelChange)="setMemberTeam($event)" class="finput">
                  <option value="">— all teams —</option>
                  @for (t of teams(); track t.id) {
                    <option [value]="t.id">{{ t.name }}</option>
                  }
                </select>
              </div>
              <div class="fg">
                <label class="flabel">Person <span class="freq">*</span></label>
                <select name="personId" [(ngModel)]="memberForm.personId" required class="finput">
                  <option value="">— select person —</option>
                  @for (p of filteredPeopleForMemberDialog(); track p.id) {
                    <option [value]="p.id">{{ p.name }} ({{ p.role }})</option>
                  }
                </select>
              </div>
              <div class="fg">
                <label class="flabel">Allocation: {{ memberForm.allocationPercentage }}%</label>
                <input type="range" name="allocationPercentage" [(ngModel)]="memberForm.allocationPercentage"
                  min="5" max="100" step="5" style="width:100%;accent-color:var(--accent)" />
              </div>
              <div class="fg">
                <label class="flabel">Contributing until <span class="freq">*</span></label>
                <input type="date" name="endDate" [(ngModel)]="memberForm.endDate" required class="finput" />
                <span class="fhint" style="justify-content:flex-start">When this person stops working on the project</span>
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeAddMember()">Cancel</button>
              <button type="submit" [disabled]="mf.invalid" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ─── Add full team sub-dialog ─────────────────────────────────────────── -->
    @if (addTeamDialogOpen()) {
      <div class="dlg-back" style="z-index:60" (click)="closeAddTeam()">
        <div class="dlg-box" style="max-width:24rem;z-index:61" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">Add full team to project</span></div>
          <form (ngSubmit)="saveTeam()" #tf="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Team <span class="freq">*</span></label>
                <select name="teamId" [(ngModel)]="addTeamForm.teamId" required class="finput">
                  <option value="">— select team —</option>
                  @for (t of teams(); track t.id) {
                    <option [value]="t.id">{{ t.name }}</option>
                  }
                </select>
              </div>
              <div class="fg">
                <label class="flabel">Allocation per person: {{ addTeamForm.allocationPercentage }}%</label>
                <input type="range" name="allocationPercentage" [(ngModel)]="addTeamForm.allocationPercentage"
                  min="5" max="100" step="5" style="width:100%;accent-color:var(--accent)" />
              </div>
              <div class="fg">
                <label class="flabel">Contributing until <span class="freq">*</span></label>
                <input type="date" name="endDate" [(ngModel)]="addTeamForm.endDate" required class="finput" />
                <span class="fhint" style="justify-content:flex-start">Applied to all members of the selected team</span>
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeAddTeam()">Cancel</button>
              <button type="submit" [disabled]="tf.invalid" class="btn btn-primary">Add team</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ProjectsComponent {
  private readonly store = inject(AppStore);

  // ─── Reactive form signals (feed autoEstimate) ────────────────────────────
  readonly formStartDate   = signal<string>('');
  readonly formEndDate     = signal<string>('');
  readonly formEndDateMode = signal<EndDateMode>('calculated');

  /** Person-days of capacity available between start and fixed end date. */
  readonly autoEstimate = computed<number | null>(() => {
    if (this.formEndDateMode() !== 'manual') return null;
    const start   = this.formStartDate();
    const end     = this.formEndDate();
    const members = this.dialogMembers();
    if (!start || !end || members.length === 0) return null;
    const workingDays = countWorkingDays(start, end);
    if (workingDays <= 0) return null;
    const totalCapacity = members.reduce((sum, m) => sum + m.allocationPercentage / 100, 0);
    return Math.round(workingDays * totalCapacity * 10) / 10;
  });

  constructor() {
    effect(() => {
      const est = this.autoEstimate();
      if (est !== null) this.form.estimate = est;
    });
  }

  readonly projects = computed<Project[]>(() => this.store.activeScenario()?.projects ?? []);
  readonly streams  = computed<Stream[]>(() => this.store.activeScenario()?.streams ?? []);
  readonly people   = computed<Person[]>(() => this.store.activeScenario()?.people ?? []);
  readonly teams    = computed<Team[]>(() => this.store.activeScenario()?.teams ?? []);

  /** Projects sorted by priority ascending for display. */
  readonly sortedProjects = computed<Project[]>(() =>
    [...this.projects()].sort((a, b) => a.priority - b.priority),
  );

  // ─── Drag-and-drop reordering ──────────────────────────────────────────────
  onDrop(event: CdkDragDrop<Project[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const sorted = [...this.sortedProjects()];
    moveItemInArray(sorted, event.previousIndex, event.currentIndex);
    this.store.reorderProjects(sorted.map(p => p.id));
  }

  onPriorityChange(id: string, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 1) {
      this.store.moveProjectToPriority(id, val);
    }
  }

  // ─── Project add/edit dialog ────────────────────────────────────────────────
  readonly dialogOpen = signal(false);
  readonly editId     = signal<string | null>(null);
  form: ProjectForm   = this.emptyForm();

  /** Buffered members for a brand-new project (not yet persisted until Save). */
  private readonly _pendingMembers = signal<ProjectMemberAllocation[]>([]);

  private emptyForm(): ProjectForm {
    return { name: '', streamId: '', startDate: todayIso(), estimate: 10, endDateMode: 'calculated', endDate: '', notes: '' };
  }

  streamName(streamId: string): string { return this.streams().find((s: Stream) => s.id === streamId)?.name ?? '—'; }
  streamColor(streamId: string): string { return this.streams().find((s: Stream) => s.id === streamId)?.color ?? '#94A3B8'; }
  endDate(projectId: string): string | null | undefined { return this.store.calculatedEndDates().get(projectId); }

  openAdd(): void {
    this.editId.set(null);
    this.form = this.emptyForm();
    this._pendingMembers.set([]);
    this.formStartDate.set(todayIso());
    this.formEndDate.set('');
    this.formEndDateMode.set('calculated');
    this.dialogOpen.set(true);
  }

  openEdit(project: Project): void {
    this.editId.set(project.id);
    this.form = { name: project.name, streamId: project.streamId, startDate: project.startDate,
      estimate: project.estimate, endDateMode: project.endDateMode, endDate: project.endDate ?? '', notes: project.notes };
    this._pendingMembers.set([]);
    this.formStartDate.set(project.startDate);
    this.formEndDate.set(project.endDate ?? '');
    this.formEndDateMode.set(project.endDateMode);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.addMemberDialogOpen.set(false);
    this.addTeamDialogOpen.set(false);
  }

  save(): void {
    const id = this.editId();
    const data: Omit<Project, 'id' | 'priority'> = {
      name: this.form.name.trim(), streamId: this.form.streamId, startDate: this.form.startDate,
      estimate: Number(this.form.estimate), endDateMode: this.form.endDateMode,
      endDate: this.form.endDateMode === 'manual' ? this.form.endDate : null, notes: this.form.notes.trim(),
    };
    if (id) {
      this.store.updateProject(id, data);
    } else {
      const newId = this.store.addProject(data);
      for (const m of this._pendingMembers()) {
        this.store.addProjectMember({
          projectId: newId, personId: m.personId,
          allocationPercentage: m.allocationPercentage, endDate: m.endDate,
        });
      }
    }
    this.closeDialog();
  }

  deleteProject(id: string): void {
    if (confirm('Delete this project and all its member allocations?')) { this.store.deleteProject(id); }
  }

  // ─── Member management ───────────────────────────────────────────────────────
  readonly addMemberDialogOpen  = signal(false);
  readonly addTeamDialogOpen    = signal(false);
  readonly memberFilterTeamId   = signal<string>('');

  memberForm: MemberAllocForm = this.emptyMemberForm();
  addTeamForm: AddTeamForm    = this.emptyTeamForm();

  private emptyMemberForm(): MemberAllocForm { return { personId: '', allocationPercentage: 50, endDate: '' }; }
  private emptyTeamForm(): AddTeamForm { return { teamId: '', allocationPercentage: 50, endDate: '' }; }

  /** Members shown in the dialog — persisted store entries (edit mode) or local buffer (add mode). */
  readonly dialogMembers = computed<ProjectMemberAllocation[]>(() => {
    const id = this.editId();
    return id ? this.membersForProject(id) : this._pendingMembers();
  });

  /** People not yet assigned to this project in the current dialog context. */
  readonly availablePeopleForDialog = computed<Person[]>(() => {
    const existing = new Set(this.dialogMembers().map((m: ProjectMemberAllocation) => m.personId));
    return this.people().filter((p: Person) => !existing.has(p.id));
  });

  /** Available people filtered by the team selected in the Add person dialog. */
  readonly filteredPeopleForMemberDialog = computed<Person[]>(() => {
    const teamId = this.memberFilterTeamId();
    const available = this.availablePeopleForDialog();
    return teamId ? available.filter((p: Person) => p.teamId === teamId) : available;
  });

  membersForProject(projectId: string): ProjectMemberAllocation[] {
    return this.store.activeScenario()?.projectMemberAllocations?.filter(
      (a: ProjectMemberAllocation) => a.projectId === projectId,
    ) ?? [];
  }

  membersCount(projectId: string): number { return this.membersForProject(projectId).length; }

  personName(personId: string): string { return this.people().find((p: Person) => p.id === personId)?.name ?? '—'; }
  personRole(personId: string): string { return this.people().find((p: Person) => p.id === personId)?.role ?? '—'; }

  openAddMember(): void { this.memberForm = this.emptyMemberForm(); this.memberFilterTeamId.set(''); this.addMemberDialogOpen.set(true); }

  setMemberTeam(teamId: string): void { this.memberFilterTeamId.set(teamId); this.memberForm.personId = ''; }
  closeAddMember(): void { this.addMemberDialogOpen.set(false); }

  saveMember(): void {
    const projectId = this.editId();
    if (projectId) {
      this.store.addProjectMember({
        projectId, personId: this.memberForm.personId,
        allocationPercentage: Number(this.memberForm.allocationPercentage), endDate: this.memberForm.endDate,
      });
    } else {
      this._pendingMembers.update(arr => [...arr, {
        id: generateId(), projectId: '',
        personId: this.memberForm.personId,
        allocationPercentage: Number(this.memberForm.allocationPercentage),
        endDate: this.memberForm.endDate,
      }]);
    }
    this.addMemberDialogOpen.set(false);
    this.memberForm = this.emptyMemberForm();
  }

  updateMemberPct(id: string, event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    const projectId = this.editId();
    if (projectId) {
      this.store.updateProjectMember(id, { allocationPercentage: val });
    } else {
      this._pendingMembers.update(arr => arr.map(m => m.id === id ? { ...m, allocationPercentage: val } : m));
    }
  }

  updateMemberEndDate(id: string, event: Event): void {
    const date = (event.target as HTMLInputElement).value;
    if (!date) return;
    const projectId = this.editId();
    if (projectId) {
      this.store.updateProjectMember(id, { endDate: date });
    } else {
      this._pendingMembers.update(arr => arr.map(m => m.id === id ? { ...m, endDate: date } : m));
    }
  }

  removeMember(id: string): void {
    const projectId = this.editId();
    if (projectId) {
      this.store.deleteProjectMember(id);
    } else {
      this._pendingMembers.update(arr => arr.filter(m => m.id !== id));
    }
  }

  openAddTeam(): void { this.addTeamForm = this.emptyTeamForm(); this.addTeamDialogOpen.set(true); }
  closeAddTeam(): void { this.addTeamDialogOpen.set(false); }

  saveTeam(): void {
    const projectId = this.editId();
    const existing = new Set(this.dialogMembers().map((a: ProjectMemberAllocation) => a.personId));
    const teamPeople = this.people().filter(
      (p: Person) => p.teamId === this.addTeamForm.teamId && !existing.has(p.id),
    );
    if (projectId) {
      for (const person of teamPeople) {
        this.store.addProjectMember({
          projectId, personId: person.id,
          allocationPercentage: Number(this.addTeamForm.allocationPercentage),
          endDate: this.addTeamForm.endDate,
        });
      }
    } else {
      const newEntries = teamPeople.map(person => ({
        id: generateId(), projectId: '',
        personId: person.id,
        allocationPercentage: Number(this.addTeamForm.allocationPercentage),
        endDate: this.addTeamForm.endDate,
      }));
      this._pendingMembers.update(arr => [...arr, ...newEntries]);
    }
    this.addTeamDialogOpen.set(false);
  }
}
