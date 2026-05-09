# ProjectPlanner — Copilot Instructions

Guidelines that apply to every chat request and code generation task in this workspace.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Angular 21.2 — standalone components, signals API, `@for`/`@if` control flow |
| Styling | Tailwind CSS v4 + custom CSS class/token system in `src/styles.css` |
| UI Library | PrimeNG 21, PrimeIcons 7 |
| Icons | `ng-icons/heroicons` |
| Date handling | `date-fns` v4 |
| Schema validation | `zod` v3 |
| Reactive primitives | `rxjs` v7.8 (used sparingly — prefer signals) |
| Testing | Jest (no Karma, no Jasmine) |

---

## Architecture

```
src/
  app/
    app.component.ts          # Shell: header + tab-nav + router-outlet + footer
    app.config.ts             # provideRouter, provideAnimationsAsync, provideZoneChangeDetection
    app.routes.ts             # Lazy-loaded feature routes
    features/                 # One subfolder per route — all standalone components
      projects/
      planning/
      setup/
      streams/
      whatif/
    layout/                   # app-header, tab-nav, app-footer (shared layout pieces)
    store/
      app.store.ts            # Single injectable signal-based store — the ONLY state layer
  core/
    types.ts                  # TypeScript interfaces (source of truth for domain shapes)
    schema.ts                 # Zod schemas mirroring types + migrateSchema()
    engine.ts                 # Pure scheduling / calculation logic (no side effects)
    conflicts.ts              # Conflict detection logic
  shared/
    utils/                    # Pure utility functions (dates.ts, ids.ts)
```

**One store, no NgRx.** All application state lives in `src/app/store/app.store.ts` as Angular signals. Feature components read from store signals and call store action methods to mutate state.

---

## Coding Conventions

### Components
- All components are **standalone** (`standalone: true` in `@Component`). Never create or reference an `@NgModule`.
- Use `inject()` for dependency injection — never constructor-parameter injection.
- Use `input()` / `output()` signal APIs for component I/O — not `@Input()`/`@Output()` decorators.
- Use `@for` / `@if` / `@switch` control flow in templates — **never** `*ngFor` / `*ngIf` / `*ngSwitch`.
- Use `computed()` for derived values; use `effect()` sparingly and only for side effects that can't be modelled as computed.

### State & Mutations
- Read state from store signals: `store.projects()`, `store.activeScenario()`, etc.
- **All mutations** go through store action methods (e.g. `store.updateProject(...)`, `store.addProject(...)`).
- Store mutations use the immutable spread pattern via `updateScenario(id, fn)`:
  ```ts
  // ✅ Correct pattern
  this.updateScenario(id, s => ({ ...s, projects: [...s.projects, newProject] }));
  ```
- Never mutate signal values directly or bypass the store.

### Adding a New Domain Field
Follow this sequence every time — do not skip steps:
1. **`src/core/types.ts`** — add the field to the TypeScript interface
2. **`src/core/schema.ts`** — add the field to the matching Zod schema
3. **`migrateSchema()`** in `schema.ts` — supply a default value so old saved data is back-compat
4. **`src/app/store/app.store.ts`** — update any affected action methods

### Services
- Only `@Injectable({ providedIn: 'root' })` — no module-scoped providers.
- Prefer pure functions in `src/core/` and `src/shared/utils/` over injected services for stateless logic.

---

## CSS & Styling

Use the **existing class system** defined in `src/styles.css`. Do not add arbitrary Tailwind utility classes or inline styles.

### Layout classes
| Class | Purpose |
|---|---|
| `.page-wrap` | Max-width content wrapper with horizontal padding |
| `.card` | Surface container with border-radius and border |
| `.card-head` | Card header row (title + actions) |
| `.card-body` | Card content area with padding |

### Data display
| Class | Purpose |
|---|---|
| `.data-table` | Full-width table with dark thead |
| `.empty` | Empty-state placeholder text |
| `.badge`, `.badge-green`, `.badge-blue`, `.badge-amber`, `.badge-red` | Status / category labels |
| `.conflict-bar` | Warning banner for scheduling conflicts |

### Forms
| Class | Purpose |
|---|---|
| `.fg` | Form group wrapper |
| `.flabel` | Label element |
| `.finput` | Text/select/number input |
| `.fhint` | Helper text beneath an input |

### Buttons
| Class | Purpose |
|---|---|
| `.btn` | Base button reset |
| `.btn-primary` | Filled accent-color CTA |
| `.btn-ghost` | Outlined secondary button |
| `.btn-lnk` | Text-only link button (neutral) |
| `.btn-lnk-blue` | Text-only link button (accent) |
| `.btn-lnk-red` | Text-only link button (danger) |

### Dialogs
Use `.dlg-back` (backdrop) > `.dlg-box` (panel) > `.dlg-head` / `.dlg-body` / `.dlg-foot`.

### Design tokens (CSS custom properties)
```
--navy          dark navy background (header/footer/nav)
--navy-light    slightly lighter navy
--bg            page background
--surface       card / panel surface
--border        border colour
--text          primary text
--muted         secondary / placeholder text
--accent        primary action colour
--accent-dark   hover state for accent
--success       green (positive states)
--danger        red (errors / delete)
--warning       amber (warnings / what-if)
```

---

## Build & Test

```bash
npm start        # Angular dev server (http://localhost:4200)
npm test         # Jest unit tests (watch mode)
npm run build    # Production build
```

Run `npm test` after every non-trivial change and fix failures before considering the task complete.

---

## Constraints & Anti-patterns

- **No `@NgModule`** — this is a fully standalone Angular application.
- **No class-based state management** (NgRx, Akita, NGXS) — use the signal store.
- **No inline styles** — use existing CSS classes or add new named classes to `src/styles.css`.
- **No arbitrary Tailwind utilities** in templates — the design system uses custom token-based classes.
- **No SSR / Universal** — this is a client-side SPA backed by `localStorage`.
- **No new third-party UI component libraries** — use PrimeNG or the existing custom CSS components.
- When adding drag-and-drop, use `@angular/cdk/drag-drop` (already in the dependency tree via PrimeNG CDK peer dep).
