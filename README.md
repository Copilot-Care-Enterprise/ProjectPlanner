# ProjectPlanner

A portfolio-level project planning SPA for engineering organizations. Model your teams, allocate people to projects, simulate schedules, detect resource conflicts, and run AI-powered what-if analyses — all in one tool.

---

## Features

- **Team & People Setup** — Define teams, people, roles, and effective capacity. Bulk-import via JSON or Excel.
- **Work Streams** — Group projects into color-coded streams for visual organization.
- **Capacity-Based Scheduling** — An automated engine computes realistic project end dates from actual team capacity and allocation percentages.
- **Gantt Chart** — Week-by-week portfolio timeline with stream-colored project bars.
- **Conflict Detection** — Real-time detection of over-allocation, stream congestion, under-capacity projects, and slippage risk.
- **What-If Analysis** — Fork the baseline into a scenario, make changes, and ask natural-language questions powered by GitHub Models AI (GPT-4o, Llama 3.1, and more).
- **Drag-and-Drop Prioritization** — Reorder projects by priority.
- **Export / Import** — Persist and share plans as JSON files.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21.2 — standalone components, signals API |
| State | Single signal-based store (no NgRx) |
| Styling | Tailwind CSS v4 + custom CSS token system |
| UI | PrimeNG 21, PrimeIcons 7, ng-icons/heroicons |
| Schema validation | Zod v3 |
| Date handling | date-fns v4 |
| Spreadsheet import | xlsx |
| Backend | Node.js + Express 5 + TypeScript |
| AI | GitHub Models API (OpenAI-compatible) |
| Testing | Jest 30 |
| Persistence | localStorage + JSON export/import |

---

## Prerequisites

- Node.js 20+
- A GitHub personal access token with access to [GitHub Models](https://github.com/marketplace/models)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Copilot-Care-Enterprise/ProjectPlanner.git
cd ProjectPlanner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create a `.env` file in the project root:

```env
GITHUB_TOKEN=your_github_personal_access_token
```

> The token is used server-side to call the GitHub Models API. It never leaves the backend.

### 4. Start the development server

```bash
npm start
```

This starts both the Angular dev server (`http://localhost:4200`) and the Express API server (`http://localhost:3000`) concurrently. The Angular app proxies `/api` requests to the Express server.

---

## Project Structure

```
src/
  app/
    app.component.ts        # Shell: header + tab-nav + router-outlet + footer
    app.config.ts           # App-wide providers
    app.routes.ts           # Lazy-loaded feature routes
    features/
      projects/             # Projects tab
      planning/             # Gantt + conflict ledger
      setup/                # Teams & people management
      streams/              # Work-stream management
      whatif/               # AI-powered what-if analysis
    layout/                 # Header, footer, tab nav
    store/
      app.store.ts          # Single injectable signal store
  core/
    types.ts                # TypeScript interfaces (domain source of truth)
    schema.ts               # Zod schemas + migration logic
    engine.ts               # Pure scheduling / calculation engine
    conflicts.ts            # Conflict detection logic
  shared/
    utils/                  # Pure utility functions (dates, ids, team-import)
server/
  index.ts                  # Express server entry point
  routes/
    chat.ts                 # POST /api/chat — GitHub Models proxy
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start Angular dev server + Express API server |
| `npm test` | Run Jest unit tests |
| `npm run build` | Production build |

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full system diagram and detailed technical documentation.

See [BUSINESS-USECASES.md](BUSINESS-USECASES.md) for the full set of supported use cases and target personas.
