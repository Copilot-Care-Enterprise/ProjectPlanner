import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../../store/app.store';
import type { Conflict, Scenario } from '../../../core/types';
import { diffScenarios } from '../../../core/scenario-diff';
import { parseISO, differenceInCalendarDays } from 'date-fns';
import { WhatifChatService, DEFAULT_MODEL, type OptionActions } from './whatif-chat.service';
import { CopilotService } from '../../core/copilot.service';

const SUGGESTIONS = [
  'Which projects are at highest risk of slipping?',
  'Who is overallocated and how can we fix it?',
  'What if we add one more developer to the highest priority project?',
  'How does current team capacity compare to project demand?',
];

@Component({
  selector: 'app-whatif',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="whatif-page">
      <div class="whatif-layout">

        <!-- ── Left: AI Copilot panel ──────────────────────────────────── -->
        <div class="card chat-panel">
          <div class="card-head">
            <span class="card-title">AI Copilot</span>
            <button class="btn btn-primary" (click)="toggleSettings()">⚙ Settings</button>
          </div>

          <!-- Settings panel -->
          @if (showSettings()) {
            <div class="chat-settings">
              <div class="fg" style="margin-bottom:.75rem">
                <label class="flabel">Model</label>
                <div style="display:flex;gap:.5rem;align-items:center">
                  <select class="finput" style="flex:1"
                    [ngModel]="modelDraft()" (ngModelChange)="modelDraft.set($event)">
                    @if (chatService.availableModels().length === 0) {
                      <option [value]="modelDraft()">{{ modelDraft() || defaultModel }}</option>
                    }
                    @for (m of chatService.availableModels(); track m.id) {
                      <option [value]="m.id">{{ m.name }}{{ m.owner ? ' · ' + m.owner : '' }}</option>
                    }
                  </select>
                  <button type="button" class="btn btn-ghost"
                    style="white-space:nowrap;flex-shrink:0"
                    [disabled]="chatService.modelsLoading()"
                    (click)="loadModels()">
                    {{ chatService.modelsLoading() ? 'Loading…' : '↻ Load models' }}
                  </button>
                </div>
                @if (chatService.modelsError()) {
                  <span class="fhint" style="justify-content:flex-start;color:var(--danger)">
                    {{ chatService.modelsError() }}
                  </span>
                }
                @if (chatService.availableModels().length > 0) {
                  <span class="fhint" style="justify-content:flex-start">
                    {{ chatService.availableModels().length }} models available
                  </span>
                }
              </div>
              <div style="display:flex;justify-content:flex-end;gap:.5rem">
                <button class="btn btn-ghost" (click)="showSettings.set(false)">Cancel</button>
                <button class="btn btn-primary" (click)="saveSettings()">Save</button>
              </div>
            </div>
          }

          <!-- Server status indicator -->
          @if (copilot.lastError()) {
            <div class="chat-no-pat" style="border-color:var(--danger);background:#fff5f5;color:var(--danger)">
              ⚠ {{ copilot.lastError() }}
            </div>
          }

          <!-- Messages -->
          <div class="chat-messages" id="copilot-msgs">
            @if (chatService.messages().length === 0) {
              <div class="chat-empty">
                <div style="font-size:2rem;line-height:1">🤖</div>
                <div style="font-weight:600;font-size:.9375rem;margin-top:.25rem">AI Copilot</div>
                <div style="font-size:.8125rem;margin-bottom:.875rem;max-width:18rem">
                  Ask questions about your project plan, resources, and what-if scenarios.
                </div>
                <div style="display:flex;flex-direction:column;gap:.4rem;width:100%;max-width:22rem">
                  @for (s of suggestions; track s) {
                    <button class="chat-suggestion" (click)="useSuggestion(s)">{{ s }}</button>
                  }
                </div>
              </div>
            }

            @for (msg of chatService.messages(); track msg.id) {
              <div class="chat-bubble"
                [class.chat-bubble-user]="msg.role === 'user'"
                [class.chat-bubble-ai]="msg.role === 'assistant'"
                [class.chat-bubble-error]="msg.error">
                @if (msg.role === 'user') {
                  <div style="white-space:pre-wrap">{{ msg.content }}</div>
                } @else {
                  <div [innerHTML]="renderMarkdown(msg.content)"></div>
                  @if (msg.options && msg.options.length > 0 && !msg.streaming) {
                    <div class="chat-apply-options">
                      @for (opt of msg.options; track opt.option) {
                        <button class="btn btn-ghost chat-apply-btn"
                          (click)="confirmApplyOption(opt); $event.stopPropagation()">
                          ✓ Apply Option {{ opt.option }}
                        </button>
                      }
                    </div>
                  }
                }
                <div class="chat-bubble-time">{{ formatTime(msg.timestamp) }}</div>
              </div>
            }

            @if (chatService.loading() && chatService.messages().at(-1)?.role !== 'assistant') {
              <div class="chat-bubble chat-bubble-ai">
                <div class="chat-typing"><span></span><span></span><span></span></div>
              </div>
            }
          </div>

          <!-- Vertical resize handle between messages and input -->
          <div class="chat-v-resize" (mousedown)="onChatResizeStart($event)"></div>

          <!-- Input -->
          <div class="chat-input-wrap" [style.height.px]="chatInputHeight()">
            <textarea class="chat-textarea"
              placeholder="Describe your scenario… (Enter to send, Shift+Enter for new line)"
              [ngModel]="inputText()" (ngModelChange)="inputText.set($event)"
              (keydown)="onKeydown($event)"></textarea>
            <button class="chat-send-btn"
              [disabled]="!inputText().trim() || chatService.loading()"
              (click)="send()">&#9658;</button>
          </div>
        </div>

        <!-- Resize handle -->
        <div class="whatif-resize-handle" [class.active]="isResizing()"
          (mousedown)="onResizeStart($event)"></div>

        <!-- ── Right: Scenario Analysis ─────────────────────────────────── -->
        <div class="whatif-right">
          <div class="card">
            <div class="card-head">
              <span class="card-title">Scenario Analysis</span>
              <button class="btn btn-primary" (click)="openForkDialog()">+ Fork scenario</button>
            </div>

            <!-- Scenario pills -->
            <div style="padding:.875rem 1.25rem;display:flex;gap:.5rem;flex-wrap:wrap;border-bottom:1px solid var(--border)">
              @for (scenario of scenarios(); track scenario.id) {
                <button class="scenario-pill" [class.active]="activeId() === scenario.id"
                  (click)="store.setActiveScenario(scenario.id)">
                  {{ scenario.name }}
                  @if (scenario.isBaseline) {
                    <span style="font-size:.75rem;opacity:.7">(baseline)</span>
                  }
                </button>
              }
            </div>

            <!-- Conflicts -->
            @if (activeConflicts().length > 0) {
              <div style="padding:.625rem 1.25rem;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:.375rem">
                @for (c of activeConflicts(); track c.id) {
                  <div class="conflict-bar">
                    <span class="conflict-lbl">{{ conflictLabel(c) }}</span>
                    <span>{{ c.message }}</span>
                  </div>
                }
              </div>
            }

            <!-- Slippage comparison -->
            @if (!isBaseline()) {
              <div style="padding:1rem 1.25rem">
                <div style="font-size:.9375rem;font-weight:600;color:var(--text);margin-bottom:.875rem">
                  Slippage vs baseline
                </div>
                @if (slippageRows().length === 0) {
                  <p class="empty" style="margin:0">No projects to compare.</p>
                } @else {
                  <table class="data-table">
                    <thead><tr>
                      <th>Project</th><th>Baseline end</th><th>Scenario end</th><th>Slippage</th>
                    </tr></thead>
                    <tbody>
                      @for (row of slippageRows(); track row.projectId) {
                        <tr [style.background]="slippageDays(row) > 0 ? '#fff5f5' : 'transparent'">
                          <td><strong>{{ row.projectName }}</strong></td>
                          <td style="color:var(--muted)">{{ row.baselineEndDate ?? '—' }}</td>
                          <td>{{ row.scenarioEndDate ?? '—' }}</td>
                          <td>
                            @if (slippageDays(row) > 0) {
                              <span class="status-err">+{{ slippageDays(row) }}d</span>
                            } @else if (slippageDays(row) < 0) {
                              <span class="status-ok">{{ slippageDays(row) }}d</span>
                            } @else {
                              <span style="color:var(--muted)">—</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
              <div style="padding:.75rem 1.25rem;border-top:1px solid var(--border)">
                <button class="btn-lnk btn-lnk-red" (click)="deleteActive()">Delete this scenario</button>
              </div>
            }

            @if (isBaseline() && activeConflicts().length === 0) {
              <p class="empty">Fork a scenario to compare it against the baseline.</p>
            }
          </div>
        </div>

      </div>
    </div>

    <!-- Fork dialog -->
    @if (forkDialogOpen()) {
      <div class="dlg-back" (click)="closeForkDialog()">
        <div class="dlg-box" style="max-width:22rem" (click)="$event.stopPropagation()">
          <div class="dlg-head"><span class="dlg-title">Fork a what-if scenario</span></div>
          <form (ngSubmit)="createFork()" #wf="ngForm">
            <div class="dlg-body">
              <div class="fg">
                <label class="flabel">Scenario name <span class="freq">*</span></label>
                <input name="scenarioName" [(ngModel)]="forkName" required class="finput"
                  placeholder="e.g. Reduced team" />
              </div>
            </div>
            <div class="dlg-foot">
              <button type="button" class="btn btn-ghost" (click)="closeForkDialog()">Cancel</button>
              <button type="submit" [disabled]="wf.invalid" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Apply option confirmation dialog -->
    @if (applyDialogOpen()) {
      <div class="dlg-back" (click)="closeApplyDialog()">
        <div class="dlg-box" style="max-width:34rem" (click)="$event.stopPropagation()">
          <div class="dlg-head">
            <span class="dlg-title">Apply Option {{ pendingOption()?.option }}</span>
          </div>
          <div class="dlg-body">
            <p style="margin:0 0 .5rem;font-weight:600;font-size:.875rem">{{ pendingOption()?.label }}</p>
            <p style="margin:0 0 .75rem;font-size:.8125rem;color:var(--muted)">
              The following changes will be applied to the active scenario:
            </p>
            <table class="data-table" style="font-size:.8125rem">
              <thead><tr>
                <th>Action</th><th>Person</th><th>Project</th><th>Alloc %</th><th>End Date</th>
              </tr></thead>
              <tbody>
                @for (a of pendingOption()?.actions ?? []; track $index) {
                  <tr>
                    <td><span [class]="actionBadgeClass(a.type)">{{ a.type }}</span></td>
                    <td>{{ a.personName }}</td>
                    <td>{{ a.projectName }}</td>
                    <td>{{ a.allocationPercentage != null ? a.allocationPercentage + '%' : '—' }}</td>
                    <td>{{ a.endDate ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (applyError()) {
              <div style="margin-top:.75rem;color:var(--danger);font-size:.8125rem">
                ⚠ {{ applyError() }}
              </div>
            }
          </div>
          <div class="dlg-foot">
            <button type="button" class="btn btn-ghost" (click)="closeApplyDialog()">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="applyOption()">Apply Changes</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class WhatifComponent {
  readonly store       = inject(AppStore);
  readonly chatService = inject(WhatifChatService);
  readonly copilot     = inject(CopilotService);

  readonly defaultModel = DEFAULT_MODEL;
  readonly suggestions  = SUGGESTIONS;

  // ── Resize handle ───────────────────────────────────────────────────────
  readonly isResizing  = signal(false);
  private resizeStartX = 0;
  private resizeStartW = 0;
  private readonly boundResizeMove = (e: MouseEvent) => this.onResizeMove(e);
  private readonly boundResizeEnd  = ()              => this.onResizeEnd();

  // ── Scenario state ────────────────────────────────────────────────────────
  readonly scenarios       = this.store.scenarios;
  readonly activeId        = this.store.activeScenarioId;
  readonly activeConflicts = this.store.conflicts;
  readonly isBaseline      = computed(() => this.store.activeScenario()?.isBaseline ?? true);

  readonly slippageRows = computed(() => {
    const active   = this.store.activeScenario();
    const baseline = this.store.baseline();
    if (!active || !baseline || active.isBaseline) return [];
    return diffScenarios(active, baseline);
  });

  // ── Chat UI state ─────────────────────────────────────────────────────────
  readonly showSettings = signal(false);
  readonly inputText    = signal('');
  readonly modelDraft   = signal('');

  // ── Fork dialog ───────────────────────────────────────────────────────────
  readonly forkDialogOpen = signal(false);
  forkName = '';

  // ── Apply option dialog ─────────────────────────────────────────────────
  readonly applyDialogOpen = signal(false);
  readonly pendingOption   = signal<OptionActions | null>(null);
  readonly applyError      = signal('');

  constructor() {
    // Auto-scroll chat to bottom whenever messages or loading state changes
    effect(() => {
      void this.chatService.messages();
      void this.chatService.loading();
      setTimeout(() => {
        const el = document.getElementById('copilot-msgs');
        if (el) el.scrollTop = el.scrollHeight;
      }, 30);
    });
  }

  // ── Chat input vertical resize ─────────────────────────────────────────────
  readonly chatInputHeight = signal(56); // default ~3.5rem
  private chatResizeStartY = 0;
  private chatResizeStartH = 0;
  private readonly boundChatResizeMove = (e: MouseEvent) => this.onChatResizeMove(e);
  private readonly boundChatResizeEnd  = ()              => this.onChatResizeEnd();

  onChatResizeStart(e: MouseEvent): void {
    e.preventDefault();
    const panel = (e.target as HTMLElement).closest('.chat-panel') as HTMLElement;
    if (!panel) return;
    panel.classList.add('v-resizing');
    this.chatResizeStartY = e.clientY;
    this.chatResizeStartH = this.chatInputHeight();
    document.addEventListener('mousemove', this.boundChatResizeMove);
    document.addEventListener('mouseup', this.boundChatResizeEnd);
  }

  private onChatResizeMove(e: MouseEvent): void {
    const delta = this.chatResizeStartY - e.clientY; // drag up = bigger
    const newH  = Math.max(56, Math.min(this.chatResizeStartH + delta, 400));
    this.chatInputHeight.set(newH);
  }

  private onChatResizeEnd(): void {
    document.querySelector('.chat-panel')?.classList.remove('v-resizing');
    document.removeEventListener('mousemove', this.boundChatResizeMove);
    document.removeEventListener('mouseup', this.boundChatResizeEnd);
  }

  // ── Horizontal panel resize ───────────────────────────────────────────────
  onResizeStart(e: MouseEvent): void {
    e.preventDefault();
    const layout = (e.target as HTMLElement).closest('.whatif-layout') as HTMLElement;
    if (!layout) return;
    this.isResizing.set(true);
    this.resizeStartX = e.clientX;
    this.resizeStartW = layout.querySelector<HTMLElement>('.chat-panel')?.offsetWidth ?? 360;
    layout.classList.add('resizing');
    document.addEventListener('mousemove', this.boundResizeMove);
    document.addEventListener('mouseup', this.boundResizeEnd);
  }

  private onResizeMove(e: MouseEvent): void {
    const delta = e.clientX - this.resizeStartX;
    const newW  = Math.max(280, Math.min(this.resizeStartW + delta, window.innerWidth * 0.7));
    const layout = document.querySelector<HTMLElement>('.whatif-layout');
    if (layout) layout.style.setProperty('--chat-width', `${newW}px`);
  }

  private onResizeEnd(): void {
    this.isResizing.set(false);
    document.querySelector('.whatif-layout')?.classList.remove('resizing');
    document.removeEventListener('mousemove', this.boundResizeMove);
    document.removeEventListener('mouseup', this.boundResizeEnd);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  toggleSettings(): void {
    if (!this.showSettings()) {
      this.modelDraft.set(this.chatService.model());
      if (this.chatService.availableModels().length === 0) {
        void this.chatService.fetchModels();
      }
    }
    this.showSettings.update(v => !v);
  }

  loadModels(): void {
    void this.chatService.fetchModels();
  }

  saveSettings(): void {
    this.chatService.saveModel(this.modelDraft());
    this.showSettings.set(false);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  useSuggestion(text: string): void {
    this.inputText.set(text);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.chat-textarea')?.focus(), 0);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.inputText().trim();
    if (!text || this.chatService.loading()) return;
    this.inputText.set('');
    void this.chatService.send(text, this.buildSystemPrompt());
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  renderMarkdown(raw: string): string {
    // Strip pp-actions block (structured data, not meant for display — handles partial blocks during streaming)
    const cleaned = raw.replace(/```pp-actions[\s\S]*?(```|$)/g, '').trimEnd();
    // Handle code blocks first to avoid processing markdown inside them
    const parts = cleaned.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const code = part.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
        return `<pre class="chat-pre"><code>${this.esc(code)}</code></pre>`;
      }
      return this.inlineMd(part);
    }).join('');
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private inlineMd(text: string): string {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code class="chat-code">$1</code>')
      .replace(/^### (.+)$/gm, '<br><strong>$1</strong><br>')
      .replace(/^## (.+)$/gm,  '<br><strong>$1</strong><br>')
      .replace(/^# (.+)$/gm,   '<br><strong>$1</strong><br>')
      .replace(/^[-*] (.+)$/gm, '• $1')
      .replace(/^\d+\. (.+)$/gm, (_, c) => `• ${c}`)
      .replace(/\n/g, '<br>');
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  private buildSystemPrompt(): string {
    const scenario = this.store.activeScenario();
    if (!scenario) {
      return 'You are a project planning assistant. No scenario data is currently loaded.';
    }
    const today        = new Date().toISOString().slice(0, 10);
    const allocs       = scenario.projectMemberAllocations;
    const activeAllocs = allocs.filter(a => a.endDate >= today);
    const endDates     = this.store.calculatedEndDates();

    // ── Build look-up maps ──────────────────────────────────────────────────
    const teamMap   = new Map(scenario.teams.map(t => [t.id, t.name]));
    const personMap = new Map(scenario.people.map(p => [p.id, p]));
    const streamMap = new Map(scenario.streams.map(s => [s.id, s.name]));

    // ── Denormalized, human-readable data ───────────────────────────────────
    const teamsReadable = scenario.teams.map(t => ({
      name: t.name,
      description: t.description,
      members: scenario.people
        .filter(p => p.teamId === t.id)
        .map(p => `${p.name} (${p.role}, ${Math.round(p.effectiveCapacity * 100)}% capacity)`),
    }));

    const projectsReadable = scenario.projects.map(p => {
      const members = allocs
        .filter(a => a.projectId === p.id)
        .map(a => {
          const person = personMap.get(a.personId);
          return person
            ? `${person.name} at ${a.allocationPercentage}% until ${a.endDate}`
            : `Unknown at ${a.allocationPercentage}%`;
        });
      const calcEnd = endDates.get(p.id) ?? null;
      return {
        name: p.name,
        stream: streamMap.get(p.streamId) ?? 'Unknown',
        priority: p.priority,
        startDate: p.startDate,
        endDateMode: p.endDateMode,
        manualEndDate: p.endDateMode === 'manual' ? p.endDate : undefined,
        calculatedEndDate: calcEnd,
        estimate: `${p.estimate} person-days`,
        assignedMembers: members.length > 0 ? members : ['No members assigned'],
        notes: p.notes || undefined,
      };
    });

    const overallocated = scenario.people.filter(p => {
      const total = activeAllocs
        .filter(a => a.personId === p.id)
        .reduce((s, a) => s + a.allocationPercentage, 0);
      return total > p.effectiveCapacity * 100;
    });

    const peopleAllocations = scenario.people.map(p => {
      const personAllocs = activeAllocs.filter(a => a.personId === p.id);
      const total = personAllocs.reduce((s, a) => s + a.allocationPercentage, 0);
      const projects = personAllocs.map(a => {
        const proj = scenario.projects.find(pr => pr.id === a.projectId);
        return `${proj?.name ?? 'Unknown'} (${a.allocationPercentage}%)`;
      });
      return {
        name: p.name,
        team: teamMap.get(p.teamId) ?? 'Unknown',
        role: p.role,
        effectiveCapacity: `${Math.round(p.effectiveCapacity * 100)}%`,
        totalAllocation: `${total}%`,
        overallocated: total > p.effectiveCapacity * 100,
        projects: projects.length > 0 ? projects : ['Idle — not assigned to any project'],
      };
    });

    return `You are an expert AI project planning analyst embedded in ProjectPlanner. Today is ${today}.

## Active Scenario: "${scenario.name}"${scenario.isBaseline ? ' (Baseline)' : ''}

### Teams & People:
\`\`\`json
${JSON.stringify(teamsReadable, null, 2)}
\`\`\`

### People Allocation Details:
\`\`\`json
${JSON.stringify(peopleAllocations, null, 2)}
\`\`\`

### Projects (by priority):
\`\`\`json
${JSON.stringify(projectsReadable, null, 2)}
\`\`\`

### Quick summary:
- Teams: ${scenario.teams.map(t => t.name).join(', ') || 'none'}
- People: ${scenario.people.length} across ${scenario.teams.length} team(s)${overallocated.length > 0 ? ` — ${overallocated.length} currently overallocated: ${overallocated.map(p => p.name).join(', ')}` : ' — none overallocated'}
- Streams: ${scenario.streams.map(s => s.name).join(', ') || 'none'}
- Projects: ${scenario.projects.length} (sorted by priority)
- Active allocations today: ${activeAllocs.length} of ${allocs.length} total

### How to interpret the data:
- \`effectiveCapacity\`: person's available capacity (e.g. "80%" means 80% of full-time)
- \`totalAllocation\`: sum of a person's allocation% across all active projects
- A person is overallocated when totalAllocation > effectiveCapacity
- Projects with \`endDateMode: "calculated"\` derive their end date from member capacity and estimate
- Projects with \`endDateMode: "manual"\` have a fixed deadline — watch for slippage

Always refer to people, teams, projects, and streams by their **names**, never by IDs. Answer concisely with specific names, numbers, and actionable recommendations. Use bullet points for clarity. When suggesting reallocation changes, name the specific person, project, and new percentage.

**IMPORTANT — Allocation-aware recommendations**: Before making any recommendation, you MUST analyse each person's current \`totalAllocation\` vs their \`effectiveCapacity\`. Never recommend assigning or increasing allocation for a person whose totalAllocation would exceed their effectiveCapacity without first recommending reducing another allocation. Always factor in team composition, current workload, and remaining capacity when proposing options.

**Response format**: EVERY response MUST end with a "Recommended Options" section — even for informational or analytical questions. Present 2–4 concrete options labelled **Option 1**, **Option 2**, etc. Each option should include a brief description, the specific changes involved (people, allocations, dates), and a short pros/cons summary. Highlight which option you recommend most and why. For purely analytical questions, provide options that represent different actionable strategies the user could take based on the analysis.

**CRITICAL — Structured actions block**: After your markdown response, you MUST ALWAYS append a machine-readable JSON block wrapped exactly like this (use the exact fence marker \`\`\`pp-actions):

\`\`\`pp-actions
[
  {
    "option": 1,
    "label": "Short label for Option 1",
    "actions": [
      { "type": "update", "personName": "Alice", "projectName": "Alpha", "allocationPercentage": 50, "endDate": "2026-06-30" },
      { "type": "add", "personName": "Bob", "projectName": "Alpha", "allocationPercentage": 30, "endDate": "2026-08-15" },
      { "type": "remove", "personName": "Charlie", "projectName": "Beta" }
    ]
  }
]
\`\`\`

Action types:
- \`add\`: Assign a person to a project (requires personName, projectName, allocationPercentage, endDate)
- \`update\`: Change an existing allocation (requires personName, projectName, allocationPercentage; endDate optional)
- \`remove\`: Remove a person from a project (requires personName, projectName)

Rules: use exact person and project names from the data above. endDate format: YYYY-MM-DD. allocationPercentage: 1–100. Include entries for EVERY option. The pp-actions block is MANDATORY for every response — never omit it.`;
  }

  // ── Fork scenario ─────────────────────────────────────────────────────────
  openForkDialog():  void { this.forkName = ''; this.forkDialogOpen.set(true); }
  closeForkDialog(): void { this.forkDialogOpen.set(false); }

  createFork(): void {
    if (!this.forkName.trim()) return;
    this.store.createWhatIfScenario(this.forkName.trim());
    this.chatService.clearChat(); // new fork = fresh conversation
    this.closeForkDialog();
  }

  // ── Apply option dialog ──────────────────────────────────────────────────
  confirmApplyOption(opt: OptionActions): void {
    this.pendingOption.set(opt);
    this.applyError.set('');
    this.applyDialogOpen.set(true);
  }

  closeApplyDialog(): void {
    this.applyDialogOpen.set(false);
    this.pendingOption.set(null);
    this.applyError.set('');
  }

  actionBadgeClass(type: string): string {
    switch (type) {
      case 'add':    return 'badge badge-green';
      case 'update': return 'badge badge-blue';
      case 'remove': return 'badge badge-red';
      default:       return 'badge';
    }
  }

  applyOption(): void {
    const opt = this.pendingOption();
    if (!opt) return;

    const errors: string[] = [];

    // Track projects created in this batch so we don't create duplicates
    const createdProjects = new Map<string, string>(); // lowercase name → id

    for (const action of opt.actions) {
      // Re-read scenario each iteration since prior actions mutate it
      const scenario = this.store.activeScenario();
      if (!scenario) break;

      const person = scenario.people.find(p => p.name.toLowerCase() === action.personName.toLowerCase());
      if (!person) { errors.push(`Person "${action.personName}" not found`); continue; }

      // Find or create the project
      let project = scenario.projects.find(p => p.name.toLowerCase() === action.projectName.toLowerCase());
      if (!project && action.type !== 'remove') {
        // Ensure an "AI Copilot" stream exists for auto-created projects
        let copilotStream = scenario.streams.find(s => s.name === 'AI Copilot');
        if (!copilotStream) {
          const streamId = this.store.addStream({
            name: 'AI Copilot',
            description: 'Auto-created stream for AI Copilot recommendations',
            color: '#8B5CF6',
          });
          // Re-read to get the stream object
          copilotStream = this.store.activeScenario()!.streams.find(s => s.id === streamId)!;
        }

        // Check if we already created this project in this batch
        const lowerName = action.projectName.toLowerCase();
        if (createdProjects.has(lowerName)) {
          project = this.store.activeScenario()!.projects.find(p => p.id === createdProjects.get(lowerName));
        } else {
          const today = new Date().toISOString().slice(0, 10);
          const projectId = this.store.addProject({
            name: action.projectName,
            streamId: copilotStream.id,
            startDate: today,
            endDate: null,
            endDateMode: 'calculated',
            estimate: 0,
            notes: 'Auto-created by AI Copilot',
          });
          createdProjects.set(lowerName, projectId);
          project = this.store.activeScenario()!.projects.find(p => p.id === projectId);
        }
      }

      if (!project) {
        if (action.type === 'remove') continue; // nothing to remove
        errors.push(`Project "${action.projectName}" could not be created`);
        continue;
      }

      // Re-read scenario after potential mutations
      const currentScenario = this.store.activeScenario()!;
      const existing = currentScenario.projectMemberAllocations.find(
        a => a.personId === person.id && a.projectId === project!.id,
      );

      switch (action.type) {
        case 'add':
          if (existing) {
            this.store.updateProjectMember(existing.id, {
              allocationPercentage: action.allocationPercentage ?? existing.allocationPercentage,
              ...(action.endDate ? { endDate: action.endDate } : {}),
            });
          } else {
            const defaultEnd = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
            this.store.addProjectMember({
              projectId: project.id,
              personId: person.id,
              allocationPercentage: action.allocationPercentage ?? 50,
              endDate: action.endDate ?? defaultEnd,
            });
          }
          break;
        case 'update':
          if (existing) {
            this.store.updateProjectMember(existing.id, {
              ...(action.allocationPercentage != null ? { allocationPercentage: action.allocationPercentage } : {}),
              ...(action.endDate ? { endDate: action.endDate } : {}),
            });
          } else {
            // Treat update on non-existing allocation as an add
            const defaultEnd = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
            this.store.addProjectMember({
              projectId: project.id,
              personId: person.id,
              allocationPercentage: action.allocationPercentage ?? 50,
              endDate: action.endDate ?? defaultEnd,
            });
          }
          break;
        case 'remove':
          if (existing) {
            this.store.deleteProjectMember(existing.id);
          }
          break;
      }
    }

    if (errors.length > 0) {
      this.applyError.set(errors.join('. '));
    } else {
      this.closeApplyDialog();
    }
  }

  // ── Scenario helpers ──────────────────────────────────────────────────────
  deleteActive(): void {
    if (confirm('Delete this scenario?')) {
      this.store.deleteScenario(this.store.activeScenarioId());
    }
  }

  conflictLabel(c: Conflict): string {
    const labels: Record<string, string> = {
      'person-overallocated-static': '⚠ Over-allocated',
      'stream-congested':            '⚠ Congestion',
      'project-under-capacity':      '⚠ Under-capacity',
      'project-slippage-risk':       '⚠ Slippage risk',
    };
    return labels[c.type] ?? '⚠';
  }

  slippageDays(row: { baselineEndDate: string | null; scenarioEndDate: string | null }): number {
    if (!row.baselineEndDate || !row.scenarioEndDate) return 0;
    return differenceInCalendarDays(parseISO(row.scenarioEndDate), parseISO(row.baselineEndDate));
  }
}
