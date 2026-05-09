import { Component, computed, inject } from '@angular/core';
import { AppStore } from '../../store/app.store';
import type { Project, Stream, Conflict } from '../../../core/types';
import { addDays, parseISO, startOfISOWeek, formatISO, getISOWeek, eachWeekOfInterval } from 'date-fns';

interface WeekCol {
  key: string;    // ISO date of Monday
  label: string;  // "W18"
}

interface GanttRow {
  project: Project;
  stream: Stream | undefined;
  startWeek: string;
  endWeek: string | null;
}

@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [],
  template: `
    <div class="page-wrap" style="max-width:100%">
      <div class="card">
        <div class="card-head">
          <span class="card-title">Planning</span>
          @if (conflicts().length > 0) {
            <span class="badge badge-red">{{ conflicts().length }} conflict{{ conflicts().length === 1 ? '' : 's' }}</span>
          }
        </div>

        <!-- Conflict ledger -->
        @if (conflicts().length > 0) {
          <div style="padding:.625rem 1.25rem;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:.375rem">
            @for (c of conflicts(); track c.id) {
              <div class="conflict-bar">
                <span class="conflict-lbl">{{ conflictLabel(c) }}</span>
                <span>{{ c.message }}</span>
              </div>
            }
          </div>
        }

        @if (rows().length === 0) {
          <p class="empty">No projects. Add projects in the Projects tab to see the Gantt chart.</p>
        } @else {
          <div style="overflow-x:auto">
            <div style="min-width:max-content">
              <!-- Header -->
              <div style="display:flex;background:var(--navy);position:sticky;top:0;z-index:10">
                <div style="width:12rem;flex-shrink:0;padding:.5rem .75rem;font-size:.75rem;font-weight:600;color:#94a3b8;border-right:1px solid #2d3348">Project</div>
                <div style="width:7rem;flex-shrink:0;padding:.5rem .75rem;font-size:.75rem;font-weight:600;color:#94a3b8;border-right:1px solid #2d3348">Stream</div>
                @for (week of weeks(); track week.key) {
                  <div style="width:3.5rem;flex-shrink:0;padding:.5rem .25rem;font-size:.6875rem;color:#64748b;text-align:center;border-right:1px solid #2d3348">
                    {{ week.label }}
                  </div>
                }
              </div>

              <!-- Rows -->
              @for (row of rows(); track row.project.id) {
                <div style="display:flex;border-bottom:1px solid var(--border)" [style.background]="hasConflict(row.project.id) ? '#fff5f5' : 'var(--surface)'">
                  <div style="width:12rem;flex-shrink:0;padding:.5rem .75rem;font-size:.875rem;font-weight:500;color:var(--text);border-right:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" [title]="row.project.name">
                    {{ row.project.name }}
                  </div>
                  <div style="width:7rem;flex-shrink:0;padding:.5rem .75rem;border-right:1px solid var(--border)">
                    @if (row.stream) {
                      <span style="display:inline-block;padding:.125rem .5rem;border-radius:9999px;font-size:.75rem;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%" [style.background]="row.stream.color">
                        {{ row.stream.name }}
                      </span>
                    }
                  </div>
                  @for (week of weeks(); track week.key) {
                    <div style="width:3.5rem;flex-shrink:0;border-right:1px solid var(--border);padding:.25rem .125rem"
                      [style.background-color]="cellColor(row, week.key)"></div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PlanningComponent {
  private readonly store = inject(AppStore);

  readonly conflicts = this.store.conflicts;

  readonly rows = computed<GanttRow[]>(() => {
    const scenario = this.store.activeScenario();
    if (!scenario) return [];
    const endDates = this.store.calculatedEndDates();
    return scenario.projects.map((p: Project) => ({
      project: p,
      stream: scenario.streams.find((s: Stream) => s.id === p.streamId),
      startWeek: formatISO(startOfISOWeek(parseISO(p.startDate)), { representation: 'date' }),
      endWeek: (() => {
        const ed = p.endDateMode === 'manual' ? p.endDate : endDates.get(p.id) ?? null;
        return ed ? formatISO(startOfISOWeek(parseISO(ed)), { representation: 'date' }) : null;
      })(),
    }));
  });

  readonly weeks = computed<WeekCol[]>(() => {
    const scenario = this.store.activeScenario();
    if (!scenario || scenario.projects.length === 0) return [];

    const endDates = this.store.calculatedEndDates();
    const allStarts = scenario.projects.map((p: Project) => parseISO(p.startDate));
    const allEnds = scenario.projects.flatMap((p: Project) => {
      const ed = p.endDateMode === 'manual' ? p.endDate : endDates.get(p.id) ?? null;
      return ed ? [parseISO(ed)] : [];
    });

    if (allStarts.length === 0) return [];
    const minDate = allStarts.reduce((a, b) => a < b ? a : b);
    const maxDate = allEnds.length > 0
      ? allEnds.reduce((a, b) => a > b ? a : b)
      : addDays(minDate, 84); // 12-week fallback

    const weekStarts = eachWeekOfInterval(
      { start: startOfISOWeek(minDate), end: addDays(startOfISOWeek(maxDate), 6) },
      { weekStartsOn: 1 },
    );

    return weekStarts.map(d => ({
      key: formatISO(d, { representation: 'date' }),
      label: `W${getISOWeek(d)}`,
    }));
  });

  cellColor(row: GanttRow, weekKey: string): string {
    if (!row.endWeek) return '';
    const inRange = weekKey >= row.startWeek && weekKey <= row.endWeek;
    if (!inRange) return '';
    return (row.stream?.color ?? '#94A3B8') + '99'; // 60% opacity via hex alpha
  }

  hasConflict(projectId: string): boolean {
    return this.conflicts().some((c: Conflict) => c.projectIds.includes(projectId));
  }

  conflictLabel(c: Conflict): string {
    const labels: Record<string, string> = {
      'person-overallocated-static': '⚠ Over-allocated',
      'stream-congested': '⚠ Congestion',
      'project-under-capacity': '⚠ Under-capacity',
      'project-slippage-risk': '⚠ Slippage risk',
    };
    return labels[c.type] ?? '⚠';
  }
}
