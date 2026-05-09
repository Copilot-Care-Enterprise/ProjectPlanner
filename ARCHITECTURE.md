# ProjectPlanner — Architecture Document

> **Version:** 1.0  
> **Date:** April 25, 2026  
> **Stack:** Angular 21 · Node.js/Express · GitHub Models API · localStorage

---

## 1. System Overview

ProjectPlanner is a **client-side SPA** for portfolio-level project planning. It models teams, people, work-streams, and projects, then schedules them using a week-by-week capacity simulation engine. A **What-If analysis** module, powered by AI (via GitHub Models), lets planners fork scenarios and ask natural-language questions about their portfolio.

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                         │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────┐  │
│  │ Setup  │ │ Streams  │ │ Projects │ │Planning│ │What-If│  │
│  └───┬────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ └───┬───┘  │
│      │           │            │            │          │      │
│      └───────────┴─────┬──────┴────────────┘          │      │
│                        ▼                              │      │
│                   ┌──────────┐                        │      │
│                   │ AppStore │ (signals)               │      │
│                   └────┬─────┘                        │      │
│                        │                              │      │
│       ┌────────────────┼──────────────┐               │      │
│       ▼                ▼              ▼               ▼      │
│  ┌─────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ engine  │  │ conflicts  │  │  schema    │  │ Copilot   │ │
│  │ (pure)  │  │  (pure)    │  │ (Zod+migr) │  │ Service   │ │
│  └─────────┘  └────────────┘  └────────────┘  └─────┬─────┘ │
│                                                      │       │
│                                  /api proxy (4200→3000)      │
└──────────────────────────────────────────────────────┼───────┘
                                                       │
                                                       ▼
                                          ┌─────────────────────┐
                                          │   Express Server    │
                                          │     (port 3000)     │
                                          │  ┌───────────────┐  │
                                          │  │ GET /api/models│  │
                                          │  │ POST /api/chat │  │
                                          │  └───────┬───────┘  │
                                          │          │          │
                                          │    GITHUB_TOKEN     │
                                          │     (.env file)     │
                                          └──────────┬──────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │   GitHub Models API │
                                          │  (models.inference  │
                                          │   .ai.azure.com)    │
                                          │                     │
                                          │  GPT-4o · Llama 3.1 │
                                          │  GPT-4o Mini · etc. │
                                          └─────────────────────┘
```

---

## 2. Technology Stack

| Layer              | Technology                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| Frontend framework | Angular 21.2 — standalone components, signals API, `@for`/`@if` syntax |
| State management   | Single injectable signal-based store (`AppStore`)                       |
| Styling            | Tailwind CSS v4 + custom CSS token system (`src/styles.css`)            |
| UI components      | PrimeNG 21, PrimeIcons 7, ng-icons/heroicons                           |
| Drag-and-drop      | `@angular/cdk/drag-drop`                                               |
| Schema validation  | Zod v3                                                                  |
| Date handling      | date-fns v4                                                             |
| Spreadsheet import | xlsx 0.18.5                                                             |
| Backend            | Node.js + Express 5.2 + TypeScript (ts-node)                           |
| AI                 | GitHub Models API (OpenAI-compatible) via server-side proxy             |
| Testing            | Jest 30                                                                 |
| Persistence        | localStorage (client-side; export/import via JSON files)                |

---

## 3. Directory Structure

```
ProjectPlanner/
├── server/                          # Node.js backend proxy
│   ├── index.ts                     # Express app, CORS, routes, health check
│   ├── routes/
│   │   └── chat.ts                  # GET /api/models, POST /api/chat (SSE)
│   └── tsconfig.json                # CommonJS module config for ts-node
│
├── src/
│   ├── main.ts                      # Angular bootstrap
│   ├── index.html                   # SPA entry point
│   ├── styles.css                   # Design system (tokens, classes)
│   │
│   ├── core/                        # Pure, framework-agnostic logic
│   │   ├── types.ts                 # Domain interfaces (source of truth)
│   │   ├── schema.ts                # Zod schemas + migrateSchema()
│   │   ├── engine.ts                # Scheduling engine (capacity simulation)
│   │   ├── conflicts.ts             # Conflict detection (4 types)
│   │   ├── scenario-diff.ts         # Baseline vs. scenario comparison
│   │   ├── engine.spec.ts           # Engine unit tests
│   │   └── conflicts.spec.ts        # Conflict detection unit tests
│   │
│   ├── shared/
│   │   └── utils/
│   │       ├── dates.ts             # ISO-week helpers
│   │       ├── ids.ts               # UUID generator (Web Crypto)
│   │       └── team-import.ts       # JSON/Excel import parsing
│   │
│   └── app/
│       ├── app.component.ts         # Shell: header + nav + router-outlet + footer
│       ├── app.config.ts            # provideRouter, provideAnimationsAsync
│       ├── app.routes.ts            # Lazy-loaded feature routes
│       │
│       ├── core/
│       │   └── copilot.service.ts   # Low-level SSE streaming to /api/chat
│       │
│       ├── store/
│       │   └── app.store.ts         # Signal-based state (the ONLY state layer)
│       │
│       ├── layout/
│       │   ├── app-header.component.ts
│       │   ├── tab-nav.component.ts
│       │   └── app-footer.component.ts
│       │
│       └── features/
│           ├── setup/
│           │   ├── setup.component.ts        # Product name, import dialog
│           │   ├── team-table.component.ts   # CRUD teams
│           │   └── person-table.component.ts # CRUD people, sort/filter
│           ├── streams/
│           │   └── streams.component.ts      # CRUD streams, derived allocations
│           ├── projects/
│           │   └── projects.component.ts     # CRUD projects, member allocation, drag-reorder
│           ├── planning/
│           │   └── planning.component.ts     # Gantt chart, conflict ledger
│           └── whatif/
│               ├── whatif.component.ts        # Two-panel: AI chat + scenario analysis
│               └── whatif-chat.service.ts     # Chat orchestration (history, streaming)
│
├── proxy.conf.json                  # Dev proxy: /api → localhost:3000
├── .env                             # GITHUB_TOKEN (not committed)
├── .env.example                     # Token placeholder for new developers
├── angular.json
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.spec.json
├── jest.config.js
└── setup-jest.ts
```

---

## 4. Domain Model

### 4.1 Entity Relationships

```
Team 1──* Person
              │
              ├──* ProjectMemberAllocation ──1 Project ──1 Stream
              │
              └──* StreamAllocation (legacy) ──1 Stream

Scenario ──* Team
         ──* Person
         ──* Stream
         ──* StreamAllocation
         ──* Project
         ──* ProjectMemberAllocation
```

### 4.2 Core Entities

| Entity                    | Key Fields                                                              |
| ------------------------- | ----------------------------------------------------------------------- |
| **Team**                  | id, name, description                                                   |
| **Person**                | id, name, teamId, role (`Developer`\|`SDET`), effectiveCapacity (0–1.0) |
| **Stream**                | id, name, description, color (hex)                                      |
| **Project**               | id, name, streamId, startDate, endDate?, endDateMode, estimate, priority, notes |
| **ProjectMemberAllocation** | id, projectId, personId, allocationPercentage (1–100), endDate        |
| **Scenario**              | id, name, isBaseline, baselineId?, createdAt + all entity arrays        |

### 4.3 Computed Types

| Type             | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| **Conflict**     | Over-allocation, congestion, under-capacity, slippage  |
| **SlippageRecord** | Baseline end date vs. scenario end date per project  |

---

## 5. State Architecture

### 5.1 Signal-Based Store

All application state lives in a single `@Injectable` service (`AppStore`) as Angular signals. There is no NgRx, no RxJS-based state management.

```
AppState
  ├── productName: string
  ├── activeScenarioId: string
  └── scenarios: Scenario[]
        ├── teams: Team[]
        ├── people: Person[]
        ├── streams: Stream[]
        ├── streamAllocations: StreamAllocation[]
        ├── projects: Project[]
        └── projectMemberAllocations: ProjectMemberAllocation[]
```

### 5.2 Mutation Pattern

All mutations use an immutable spread pattern through helper methods:

```typescript
// Root update
update(fn: (state: AppState) => AppState): void {
  this._state.set(fn(this._state()));
}

// Scenario-scoped update
updateScenario(id: string, fn: (s: Scenario) => Scenario): void {
  this.update(state => ({
    ...state,
    scenarios: state.scenarios.map(s => s.id === id ? fn(s) : s),
  }));
}
```

### 5.3 Derived State

| Computed Signal        | Source                                     |
| ---------------------- | ------------------------------------------ |
| `activeScenario()`     | scenarios + activeScenarioId               |
| `baseline()`           | scenarios (first with isBaseline=true)     |
| `conflicts()`          | detectConflicts(activeScenario, baseline)  |
| `calculatedEndDates()` | calculateAllEndDates(activeScenario)       |
| `isDirty()`            | JSON diff vs. last saved snapshot          |

### 5.4 Persistence

- **Storage:** `localStorage` under key `'portfolio-planner-state'`
- **Save:** explicit user action via footer "Save" button
- **Load:** on app startup, calls `loadState()` → `migrateSchema()`
- **Export/Import:** JSON file download/upload with Zod validation
- **Dirty tracking:** `isDirty()` compares in-memory state vs. last saved snapshot

---

## 6. Scheduling Engine

### 6.1 Capacity Calculation

The engine (`src/core/engine.ts`) computes project end dates using a **week-by-week simulation**:

1. Start at the project's `startDate` (snapped to Monday)
2. Each week, sum the effective capacity of all assigned team members:
   ```
   weekCapacity = Σ (person.effectiveCapacity × allocation% / 100 × 5 days)
   ```
3. Subtract the week's capacity from the remaining estimate
4. If a member's `endDate` has passed, they no longer contribute
5. The end date is the **Friday of the week** in which the estimate reaches zero
6. Returns `null` if zero capacity (no team members or all past their end dates)

### 6.2 Conflict Detection

Four conflict types are detected post-computation:

| Type | Condition | Severity |
|------|-----------|----------|
| **Person over-allocation** | Σ allocationPercentage > 100% across all projects | Error |
| **Stream congestion** | Two+ projects in same stream overlap in time and exceed stream capacity | Warning |
| **Project under-capacity** | Manual end date set but capacity insufficient to finish on time | Warning |
| **Project slippage risk** | Scenario end date > baseline end date for same project | Warning |

---

## 7. Backend Architecture

### 7.1 Express Server

The Node.js backend (`server/`) acts as a **secure proxy** between the browser and GitHub Models API. No API keys are exposed to the client.

```
Browser (Angular)                Server (Express)                GitHub Models
      │                               │                              │
      ├──GET /api/models──────────────►├──GET /models────────────────►│
      │◄──{ models: [...] }───────────┤◄──model catalog──────────────┤
      │                               │                              │
      ├──POST /api/chat───────────────►├──POST /chat/completions─────►│
      │◄──SSE: data: {"text":"..."}───┤◄──SSE stream────────────────┤
      │◄──SSE: data: [DONE]──────────┤                              │
```

### 7.2 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/models` | Fetch available chat-completion models from GitHub Models |
| `POST` | `/api/chat`   | Stream a chat completion (SSE) |
| `GET`  | `/health`     | Server health + token status |

### 7.3 SSE Streaming Protocol

The `/api/chat` endpoint returns Server-Sent Events:

```
data: {"text":"Hello"}\n\n          ← token delta
data: {"text":" world"}\n\n         ← token delta
data: [DONE]\n\n                    ← stream complete

data: {"error":"message"}\n\n       ← on failure
```

### 7.4 Security

| Concern | Mitigation |
|---------|------------|
| API key exposure | `GITHUB_TOKEN` stored in `.env` on server only; never sent to browser |
| CORS | Restricted to `localhost:4200` and `localhost:4201` |
| Input validation | Message array required and non-empty; JSON body limited to 2MB |
| Token in source control | `.env` in `.gitignore`; `.env.example` provided |

---

## 8. AI Copilot Architecture

### 8.1 Service Layering

```
WhatifComponent
      │
      ▼
WhatifChatService          (chat history, model selection, orchestration)
      │
      ▼
CopilotService             (low-level SSE streaming, model fetching)
      │
      ▼
fetch('/api/chat')         (browser → Express proxy)
      │
      ▼
GitHub Models API          (OpenAI-compatible endpoint)
```

### 8.2 Chat Flow

1. **User types message** → `WhatifChatService.send(text, systemPrompt)`
2. Service adds user message to `messages` signal
3. Pre-inserts a streaming assistant placeholder (`streaming: true`)
4. Calls `CopilotService.stream()` which POSTs to `/api/chat`
5. As SSE tokens arrive, updates the placeholder's `content` in-place
6. On completion, sets `streaming: false`
7. On error, sets `error: true` with the error message

### 8.3 System Prompt

The What-If component builds a system prompt that includes:
- Product name and active scenario name
- Full scenario data (teams, people, streams, projects, allocations) serialized as JSON
- Current conflict list
- Instructions to reason about capacity, scheduling, and what-if scenarios

### 8.4 Model Selection

Models are **fetched dynamically** from the server at runtime:

1. User opens Settings → triggers `GET /api/models`
2. Server proxies to GitHub Models → filters to `task === 'chat-completion'`
3. Response populates the model dropdown
4. Selected model persisted to `localStorage` under `pp_copilot_model`
5. Default: `gpt-4o`

---

## 9. CSS Design System

### 9.1 Custom Properties (Tokens)

```css
--navy / --navy-light    →  Dark backgrounds (header, footer, nav)
--bg / --surface         →  Page and card backgrounds
--border                 →  Dividers and borders
--text / --muted         →  Primary and secondary text
--accent / --accent-dark →  Primary action color + hover
--success / --danger     →  Green (positive) / Red (error, delete)
--warning                →  Amber (warnings, what-if indicators)
```

### 9.2 Class Categories

| Category   | Key Classes |
|------------|-------------|
| Layout     | `.page-wrap`, `.card`, `.card-head`, `.card-body` |
| Tables     | `.data-table` (dark thead, striped rows, hover) |
| Buttons    | `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-lnk`, `.btn-lnk-blue`, `.btn-lnk-red` |
| Forms      | `.fg`, `.flabel`, `.finput`, `.fhint` |
| Dialogs    | `.dlg-back`, `.dlg-box`, `.dlg-head`, `.dlg-body`, `.dlg-foot` |
| Badges     | `.badge`, `.badge-green`, `.badge-blue`, `.badge-amber`, `.badge-red` |
| Status     | `.status-ok`, `.status-err`, `.status-warn` |
| Chat       | `.chat-panel`, `.chat-messages`, `.chat-bubble-user`, `.chat-bubble-ai` |
| Gantt      | `.gantt-name-col`, `.gantt-stream-col`, `.gantt-week-col` |
| Scenarios  | `.scenario-pill`, `.scenario-pill.active` |

---

## 10. Feature Map

### 10.1 Setup Tab (`/setup`)

- Edit product name
- CRUD teams and people
- Sort and filter people by name, team, role, capacity, allocation, status
- Import teams/people/streams from JSON or Excel file
- Status reflects live allocation data (over-allocated, active, idle)

### 10.2 Streams Tab (`/streams`)

- CRUD streams with color coding
- View **derived** allocations (from project member assignments — no manual stream allocation)
- Read-only table: Person, Role, Projects, Total Allocation %

### 10.3 Projects Tab (`/projects`)

- CRUD projects with priority, estimate (person-days), start/end dates
- Drag-and-drop priority reordering (Angular CDK)
- Assign team members with per-person allocation % and end date
- Team filter on "Add person" dialog (select team → filtered person list)
- End date mode: `calculated` (engine-derived) or `manual` (user-set)

### 10.4 Planning Tab (`/planning`)

- Week-by-week **Gantt chart** (stream-colored cells)
- Conflict ledger showing all detected issues across the active scenario

### 10.5 What-If Tab (`/whatif`)

- **Left panel — AI Copilot:**
  - Chat with streaming responses
  - Model picker (dynamic from GitHub Models)
  - Suggestion chips for common questions
  - Markdown rendering (code blocks, bold, lists)
- **Right panel — Scenario Analysis:**
  - Scenario pills (switch between baseline and forks)
  - Fork scenario (creates deep copy)
  - Conflict display for active scenario
  - Slippage table (baseline vs. scenario end dates)
  - Delete non-baseline scenarios

---

## 11. Data Flow Diagrams

### 11.1 User Action → UI Update

```
User clicks "Add Project"
  │
  ▼
ProjectsComponent calls store.addProject()
  │
  ▼
AppStore.updateScenario(id, fn)
  │  immutable spread: { ...scenario, projects: [...projects, newProject] }
  │
  ▼
_state signal updated
  │
  ├──► activeScenario()      recalculated
  ├──► calculatedEndDates()  recalculated (engine runs)
  ├──► conflicts()           recalculated (detection runs)
  └──► isDirty()             set to true
  │
  ▼
All bound templates re-render reactively
```

### 11.2 Persistence Cycle

```
User clicks "Save" (footer)
  │
  ▼
store.saveToLocalStorage()
  │  JSON.stringify(_state())
  │  localStorage.setItem('portfolio-planner-state', json)
  │  _savedSnapshot updated
  │
  ▼
isDirty() → false  (snapshot matches state)

──── On next page load ────

store.loadState()
  │  localStorage.getItem(...)
  │  migrateSchema(raw)         ← Zod parse + backward compat
  │  _state.set(validated)
  │  _savedSnapshot = json
```

---

## 12. Build & Development

| Command        | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `npm start`    | Runs Express API (port 3000) + Angular dev server (port 4200) concurrently |
| `npm test`     | Jest unit tests (watch mode)                                    |
| `npm run build`| Production Angular build → `dist/project-planner/`              |

### 12.1 Development Setup

1. Clone repository
2. `npm install`
3. Copy `.env.example` → `.env`, add your GitHub Personal Access Token
4. `npm start` — opens both servers
5. Browse to `http://localhost:4200`

### 12.2 Proxy Configuration

In development, Angular's dev server proxies `/api/*` requests to `http://localhost:3000` via `proxy.conf.json`, eliminating CORS issues during development.

---

## 13. Testing Strategy

- **Unit tests** in `src/core/` cover the scheduling engine and conflict detection
- **24 tests** across `engine.spec.ts` and `conflicts.spec.ts`
- **Framework:** Jest 30 (no Karma, no Jasmine)
- **Run:** `npm test -- --watchAll=false` for single pass

---

## 14. Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| No SSR/Universal | Client-side SPA backed by localStorage; no server rendering needed |
| No NgRx | Signal-based store is simpler for this scale; one file, no boilerplate |
| No `@NgModule` | Fully standalone Angular 21 application |
| localStorage only | No backend database; data portability via JSON export/import |
| Server proxy for AI | API keys never reach the browser; secure by design |
| GitHub Models API | Leverages existing GitHub Copilot subscription; no separate AI vendor account needed |
| Hardcoded conflict types | Four well-defined types cover portfolio planning needs |
| Week-based scheduling | Person-day estimates with weekly granularity matches real planning cadences |
