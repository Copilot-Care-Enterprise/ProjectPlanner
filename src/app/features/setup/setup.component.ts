import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../../store/app.store';
import { TeamTableComponent } from './team-table.component';
import { PersonTableComponent } from './person-table.component';
import { parseJsonImport, parseExcelImport, type ImportPayload } from '../../../shared/utils/team-import';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [FormsModule, TeamTableComponent, PersonTableComponent],
  template: `
    <div class="page-wrap">
      <!-- Product name -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Product Settings</span>
          <button class="btn btn-primary" (click)="openImport()">↑ Import Teams / People</button>
        </div>
        <div class="card-body">
          <div class="fg" style="max-width:24rem">
            <label class="flabel">Product name</label>
            <input
              class="finput"
              [value]="store.productName()"
              (change)="onNameChange($event)"
              placeholder="My Portfolio"
            />
          </div>
        </div>
      </div>

      <app-team-table />
      <app-person-table />
    </div>

    <!-- ─── Import dialog ──────────────────────────────────────────────────── -->
    @if (importDialogOpen()) {
      <div class="dlg-back" (click)="closeImport()">
        <div class="dlg-box" style="max-width:36rem;max-height:92vh;overflow-y:auto" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">Import Teams / Streams / People</span></div>
          <div class="dlg-body">

            @if (importStep() === 'pick') {
              <p style="font-size:.875rem;color:var(--muted);margin:0 0 1rem">
                Upload a <strong>.json</strong> or <strong>.xlsx</strong> file containing Teams, Streams, and People.
                Existing records with the same name will be updated; new records will be added.
              </p>
              <div class="fg">
                <label class="flabel">Select file</label>
                <input #fileInput type="file" accept=".json,.xlsx"
                  class="finput" style="padding:.35rem .5rem"
                  (change)="onFileSelected($event)" />
              </div>
              @if (importing()) {
                <p style="font-size:.875rem;color:var(--muted);margin:.75rem 0 0">Parsing file…</p>
              }
            }

            @if (importStep() === 'errors') {
              <p style="font-size:.875rem;font-weight:600;color:var(--danger);margin:0 0 .5rem">
                The file contains {{ importErrors().length }} error(s) — please fix and re-upload:
              </p>
              <ul style="margin:0;padding-left:1.25rem;font-size:.8125rem;color:var(--danger)">
                @for (e of importErrors(); track e) { <li>{{ e }}</li> }
              </ul>
            }

            @if (importStep() === 'confirm') {
              @if (importWarnings().length > 0) {
                <div class="conflict-bar" style="margin-bottom:1rem">
                  <strong>Warnings ({{ importWarnings().length }}):</strong>
                  <ul style="margin:.25rem 0 0;padding-left:1.25rem;font-size:.8125rem">
                    @for (w of importWarnings(); track w) { <li>{{ w }}</li> }
                  </ul>
                </div>
              }
              <p style="font-size:.875rem;color:var(--muted);margin:0 0 1rem">Review what will be imported:</p>
              <table class="data-table" style="margin-bottom:1rem">
                <thead><tr><th>Type</th><th>Count</th></tr></thead>
                <tbody>
                  <tr><td>Teams</td><td>{{ importPayload()!.teams.length }}</td></tr>
                  <tr><td>Streams</td><td>{{ importPayload()!.streams.length }}</td></tr>
                  <tr><td>People</td><td>{{ importPayload()!.people.length }}</td></tr>
                </tbody>
              </table>
              @if (importPayload()!.teams.length > 0) {
                <details style="margin-bottom:.75rem">
                  <summary style="font-size:.8125rem;cursor:pointer;color:var(--accent)">Teams ({{ importPayload()!.teams.length }})</summary>
                  <ul style="margin:.25rem 0 0;padding-left:1.25rem;font-size:.8125rem;color:var(--muted)">
                    @for (t of importPayload()!.teams; track t.name) { <li>{{ t.name }}{{ t.description ? ' — ' + t.description : '' }}</li> }
                  </ul>
                </details>
              }
              @if (importPayload()!.streams.length > 0) {
                <details style="margin-bottom:.75rem">
                  <summary style="font-size:.8125rem;cursor:pointer;color:var(--accent)">Streams ({{ importPayload()!.streams.length }})</summary>
                  <ul style="margin:.25rem 0 0;padding-left:1.25rem;font-size:.8125rem;color:var(--muted)">
                    @for (st of importPayload()!.streams; track st.name) { <li>{{ st.name }} <span style="display:inline-block;width:.75rem;height:.75rem;border-radius:50%;vertical-align:middle;margin-left:.25rem" [style.background]="st.color"></span></li> }
                  </ul>
                </details>
              }
              @if (importPayload()!.people.length > 0) {
                <details>
                  <summary style="font-size:.8125rem;cursor:pointer;color:var(--accent)">People ({{ importPayload()!.people.length }})</summary>
                  <ul style="margin:.25rem 0 0;padding-left:1.25rem;font-size:.8125rem;color:var(--muted)">
                    @for (p of importPayload()!.people; track p.name) {
                      <li>{{ p.name }} · {{ p.teamName }} · {{ p.role }} · {{ (p.effectiveCapacity * 100).toFixed(0) }}%</li>
                    }
                  </ul>
                </details>
              }
            }

          </div>
          <div class="dlg-foot">
            <button type="button" class="btn btn-ghost" (click)="closeImport()">Cancel</button>
            @if (importStep() === 'errors') {
              <button type="button" class="btn btn-ghost" (click)="resetImport()">Try again</button>
            }
            @if (importStep() === 'confirm') {
              <button type="button" class="btn btn-primary" (click)="commitImport()">Import</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SetupComponent {
  readonly store = inject(AppStore);

  // ─── Import dialog state ───────────────────────────────────────────────────
  readonly importDialogOpen = signal(false);
  readonly importStep       = signal<'pick' | 'errors' | 'confirm'>('pick');
  readonly importing        = signal(false);
  readonly importErrors     = signal<string[]>([]);
  readonly importWarnings   = signal<string[]>([]);
  readonly importPayload    = signal<ImportPayload | null>(null);

  openImport(): void {
    this.resetImport();
    this.importDialogOpen.set(true);
  }

  closeImport(): void {
    this.importDialogOpen.set(false);
  }

  resetImport(): void {
    this.importStep.set('pick');
    this.importErrors.set([]);
    this.importWarnings.set([]);
    this.importPayload.set(null);
    this.importing.set(false);
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importing.set(true);
    this.importErrors.set([]);

    try {
      const isExcel = file.name.toLowerCase().endsWith('.xlsx');
      const result = isExcel
        ? await parseExcelImport(file)
        : parseJsonImport(await file.text());

      if (!result.ok) {
        this.importErrors.set(result.errors);
        this.importStep.set('errors');
      } else {
        this.importPayload.set(result.payload);
        this.importWarnings.set(result.warnings);
        this.importStep.set('confirm');
      }
    } catch {
      this.importErrors.set(['Unexpected error reading file. Please try again.']);
      this.importStep.set('errors');
    } finally {
      this.importing.set(false);
    }
  }

  commitImport(): void {
    const payload = this.importPayload();
    if (!payload) return;
    this.store.importTeamsPeople(payload);
    this.store.saveToLocalStorage();
    this.closeImport();
  }

  onNameChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value) this.store.setProductName(value);
  }
}

