import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../../store/app.store';
import type { Team } from '../../../core/types';

interface TeamForm {
  name: string;
  description: string;
}

@Component({
  selector: 'app-team-table',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <div class="card-head">
        <span class="card-title">Teams</span>
        <button class="btn btn-primary" (click)="openAdd()">+ Add team</button>
      </div>

      @if (teams().length === 0) {
        <p class="empty">No teams yet. Add a team to get started.</p>
      } @else {
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th style="width:7rem">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (team of teams(); track team.id) {
              <tr>
                <td><strong>{{ team.name }}</strong></td>
                <td style="color:var(--muted)">{{ team.description }}</td>
                <td style="display:flex;gap:.75rem">
                  <button class="btn-lnk btn-lnk-blue" (click)="openEdit(team)">Edit</button>
                  <button class="btn-lnk btn-lnk-red"  (click)="deleteTeam(team.id)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    @if (dialogOpen()) {
      <div class="dlg-back" (click)="closeDialog()">
        <div class="dlg-box" style="max-width:28rem" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">{{ editId() ? 'Edit team' : 'Add team' }}</span></div>
          <form (ngSubmit)="save()" #f="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Name <span class="freq">*</span></label>
                <input name="name" [(ngModel)]="form.name" required class="finput" placeholder="Team Alpha" />
              </div>
              <div class="fg">
                <label class="flabel">Description</label>
                <input name="description" [(ngModel)]="form.description" class="finput" placeholder="Optional description" />
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
export class TeamTableComponent {
  private readonly store = inject(AppStore);

  readonly teams = computed<Team[]>(() => this.store.activeScenario()?.teams ?? []);
  readonly dialogOpen = signal(false);
  readonly editId = signal<string | null>(null);
  form: TeamForm = { name: '', description: '' };

  openAdd(): void {
    this.editId.set(null);
    this.form = { name: '', description: '' };
    this.dialogOpen.set(true);
  }

  openEdit(team: Team): void {
    this.editId.set(team.id);
    this.form = { name: team.name, description: team.description };
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  save(): void {
    const id = this.editId();
    if (id) {
      this.store.updateTeam(id, { name: this.form.name.trim(), description: this.form.description.trim() });
    } else {
      this.store.addTeam({ name: this.form.name.trim(), description: this.form.description.trim() });
    }
    this.closeDialog();
  }

  deleteTeam(id: string): void {
    if (confirm('Delete this team? All people in this team will also be removed.')) {
      this.store.deleteTeam(id);
    }
  }
}
