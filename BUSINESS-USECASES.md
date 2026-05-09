# ProjectPlanner — Business Use Cases

> **Version:** 1.0
> **Date:** April 25, 2026
> **Product:** ProjectPlanner — Portfolio-Level Project Planning Tool

---

## 1. Executive Summary

ProjectPlanner addresses the challenge of **portfolio-level resource planning** for software engineering organizations. It enables engineering managers, program managers, and delivery leads to model their teams, allocate people to projects, simulate schedules, detect resource conflicts, and run what-if analyses — all within a single, AI-assisted planning tool.

The tool replaces ad-hoc spreadsheet-based planning with a structured, scenario-driven approach that automatically surfaces over-allocations, scheduling conflicts, and delivery risks before they become real problems.

---

## 2. Target Personas

| Persona | Role | Pain Point | Value Proposition |
|---------|------|------------|-------------------|
| **Engineering Manager** | Manages 1–3 teams of developers and SDETs | Loses visibility when people are split across multiple projects | See total allocation per person, detect over-allocation instantly |
| **Program Manager** | Coordinates delivery across multiple work-streams | Uses spreadsheets to track project timelines and dependencies | Automated scheduling engine with Gantt visualization and conflict detection |
| **Delivery Lead** | Owns a product or portfolio of projects | Struggles to answer "what if we add/remove a person?" questions | What-If scenario forking with AI-assisted analysis |
| **Technical Lead** | Leads a specific project or stream | Unclear when the project will actually finish given shared resources | Capacity-based end date calculation that accounts for partial allocations |
| **VP of Engineering** | Oversees the entire engineering organization | Needs high-level view of portfolio health and staffing risks | Conflict ledger, slippage tracking, and AI-powered portfolio Q&A |

---

## 3. Business Use Cases

### UC-01: Establish the Organizational Model

**Actor:** Engineering Manager
**Goal:** Define the teams, people, and work-streams that make up the engineering organization so that planning can begin from an accurate baseline.

**Preconditions:**
- User has access to the application

**Main Flow:**
1. User navigates to the **Setup** tab
2. User sets the product/portfolio name
3. User creates **Teams** (e.g., "Platform Team", "Mobile Team")
4. User adds **People** to each team, specifying:
   - Name
   - Team assignment
   - Role (Developer or SDET)
   - Effective capacity (0–100%, accounting for meetings, PTO, etc.)
5. User navigates to the **Streams** tab
6. User creates **Work-Streams** (e.g., "Payment Integration", "Mobile App v2") with color coding
7. System displays derived allocations for each stream based on project assignments

**Alternative Flow — Bulk Import:**
- 3a. User clicks "Import" and uploads a JSON or Excel file containing teams, people, and streams
- 3b. System parses and validates the data, creating all entities in one operation

**Post-conditions:**
- Organization model is established and visible across all tabs
- People appear with live status indicators (Idle, Active, Over-allocated)

---

### UC-02: Plan and Prioritize Projects

**Actor:** Program Manager
**Goal:** Create projects with effort estimates and assign team members so the system can compute realistic delivery timelines.

**Preconditions:**
- Teams, people, and streams are defined (UC-01)

**Main Flow:**
1. User navigates to the **Projects** tab
2. User creates a new **Project**, entering:
   - Name and description
   - Assigned work-stream
   - Start date
   - Effort estimate (in ideal person-days)
   - End date mode: **Calculated** (engine-derived) or **Manual** (user-specified)
3. User sets the project's **Priority** (drag-and-drop reordering)
4. User opens the project and assigns **Team Members**, for each specifying:
   - Person (filterable by team)
   - Allocation percentage (e.g., 50% of their time)
   - Individual end date (when that person rolls off the project)
5. System automatically computes the project's **calculated end date** using the scheduling engine
6. User repeats for all projects in the portfolio

**Post-conditions:**
- All projects have calculated end dates based on real capacity
- The Gantt chart on the Planning tab reflects the computed schedule

---

### UC-03: Visualize the Portfolio Schedule

**Actor:** Program Manager / VP of Engineering
**Goal:** See a week-by-week timeline of all projects to understand delivery sequencing and identify bottlenecks.

**Preconditions:**
- Projects are created with team assignments (UC-02)

**Main Flow:**
1. User navigates to the **Planning** tab
2. System displays a **Gantt chart** with:
   - Each project as a row
   - Stream-colored bars spanning from start date to calculated (or manual) end date
   - Week columns representing the planning horizon
3. User scans the chart to understand project overlap and sequencing
4. User scrolls the **Conflict Ledger** below the Gantt chart to review all detected issues

**Post-conditions:**
- User has visual understanding of the portfolio timeline
- Any scheduling issues are surfaced for review

---

### UC-04: Detect and Resolve Resource Conflicts

**Actor:** Engineering Manager / Program Manager
**Goal:** Identify resource allocation problems before they impact delivery, and take corrective action.

**Preconditions:**
- People are assigned to projects (UC-02)

**Main Flow:**
1. System continuously evaluates four conflict types:

   | Conflict Type | Trigger | Example |
   |--------------|---------|---------|
   | **Person Over-Allocation** | Person's total allocation across all projects exceeds 100% | Alice is 60% on Project A + 50% on Project B = 110% |
   | **Stream Congestion** | Multiple projects in the same stream overlap in time, competing for shared capacity | Two projects in "Platform" stream run simultaneously |
   | **Project Under-Capacity** | A project with a manual end date doesn't have enough capacity to finish on time | Project needs 200 person-days but only has 2 days/week of capacity |
   | **Project Slippage Risk** | A scenario's calculated end date is later than the baseline end date | Moving Alice off Project A delays it by 3 weeks |

2. Conflicts appear in the **Conflict Ledger** on the Planning tab and the **What-If** tab
3. User reviews each conflict and takes corrective action:
   - Reduce a person's allocation on one project
   - Add another team member to a capacity-starved project
   - Adjust project priorities or start dates
   - Change the project's end date mode
4. System recalculates in real time as changes are made

**Post-conditions:**
- Conflicts are resolved or acknowledged
- Schedule reflects the adjusted resource plan

---

### UC-05: Run What-If Scenario Analysis

**Actor:** Delivery Lead / VP of Engineering
**Goal:** Evaluate the impact of staffing or scheduling changes before committing them to the baseline plan.

**Preconditions:**
- A baseline scenario exists with projects and assignments (UC-01, UC-02)

**Main Flow:**
1. User navigates to the **What-If** tab
2. User clicks **"Fork Scenario"** and names the new scenario (e.g., "Remove Alice from Platform")
3. System creates a **deep copy** of the baseline scenario
4. User switches to the forked scenario using the **Scenario Pills**
5. User makes experimental changes:
   - Remove a person from a project
   - Add a new project
   - Change allocation percentages
   - Adjust start dates or estimates
6. System recalculates all end dates and detects new conflicts in real time
7. User reviews the **Slippage Table** showing:
   - Projects where the scenario end date differs from the baseline
   - Whether projects have slipped (later) or improved (earlier)
8. User decides to either:
   - Apply insights by making similar changes in the baseline
   - Keep the scenario for comparison
   - Delete the scenario if no longer needed

**Alternative Flow — Multiple Scenarios:**
- 2a. User creates several forks (e.g., "Add 2 devs", "Delay Project B", "Split the team")
- 2b. User switches between scenario pills to compare outcomes side by side

**Post-conditions:**
- User understands the quantitative impact of proposed staffing changes
- Decision is informed by data rather than intuition

---

### UC-06: AI-Assisted Portfolio Q&A

**Actor:** Any planner or manager
**Goal:** Ask natural-language questions about the portfolio and receive data-driven answers without manually crunching numbers.

**Preconditions:**
- Scenario data exists; GitHub Models API is configured (GITHUB_TOKEN)

**Main Flow:**
1. User opens the **AI Copilot** panel on the What-If tab
2. User selects an AI model from the dynamic model dropdown (e.g., GPT-4o, Llama 3.1)
3. User types a question or clicks a **Suggestion Chip**:

   | Example Question | Expected Insight |
   |-----------------|------------------|
   | "Which people are over-allocated?" | List of people exceeding 100% with breakdown by project |
   | "What happens if we remove Bob from Project Alpha?" | Impact on Project Alpha's end date and whether it causes slippage |
   | "Can we finish all Platform projects by Q3?" | Capacity analysis against the deadline |
   | "Summarize the current portfolio risks" | Aggregated conflict and slippage analysis |
   | "How should we reallocate resources to meet the deadline?" | Optimization suggestions based on available capacity |

4. System builds a **context-enriched prompt** containing:
   - Full scenario data (teams, people, projects, allocations)
   - Current conflicts and slippage information
   - The user's question
5. AI processes the question and **streams** the response in real time
6. User reads the response and may ask follow-up questions in the same conversation
7. User clears the chat to start a new analysis thread

**Post-conditions:**
- User has AI-generated insights grounded in actual portfolio data
- No data leaves the organization (API key is server-side; data stays in the prompt context)

---

### UC-07: Save, Export, and Restore Planning Data

**Actor:** Any user
**Goal:** Persist planning data across sessions and share it with colleagues.

**Preconditions:**
- Planning data exists in the application

**Main Flow — Save:**
1. User makes changes to the portfolio (any tab)
2. Footer displays an **"Unsaved changes"** indicator (dirty state)
3. User clicks **"Save"**
4. System persists the full application state to `localStorage`
5. Dirty indicator clears

**Main Flow — Export:**
1. User navigates to the **Setup** tab
2. User clicks **"Export"**
3. System downloads a versioned JSON file containing:
   - Schema version (for backward compatibility)
   - Product name
   - All scenarios with their complete entity data
4. User shares the file with a colleague via email, chat, or shared drive

**Main Flow — Import:**
1. Colleague opens ProjectPlanner
2. User clicks **"Import"** on the Setup tab
3. User selects the shared JSON (or Excel) file
4. System validates the file using Zod schemas
5. System applies **schema migration** if the file is from an older version (adding default values for new fields)
6. Data is loaded into the application

**Post-conditions:**
- Planning data is safely persisted and portable
- Older files are automatically upgraded to the current schema

---

### UC-08: Track Portfolio Health Over Time

**Actor:** VP of Engineering / Program Manager
**Goal:** Monitor whether the portfolio is on track by comparing current projections against the baseline plan.

**Preconditions:**
- A baseline scenario exists with calculated end dates
- At least one what-if scenario has been forked

**Main Flow:**
1. User navigates to the **What-If** tab
2. User reviews the **Slippage Table** for the active scenario:

   | Project | Baseline End | Scenario End | Status |
   |---------|-------------|-------------|--------|
   | Project Alpha | 2026-06-20 | 2026-06-20 | On Track |
   | Project Beta | 2026-08-15 | 2026-09-05 | Slipped (+3 weeks) |
   | Project Gamma | 2026-07-01 | 2026-06-15 | Improved (-2 weeks) |

3. User identifies projects at risk and investigates the cause using:
   - The conflict ledger (resource issues)
   - The AI Copilot (natural language root cause analysis)
4. User makes adjustments in the scenario and observes the impact
5. When satisfied, user updates the baseline with approved changes

**Post-conditions:**
- Portfolio health is quantified with slippage data
- Corrective actions are taken before deadlines are missed

---

## 4. Use Case Dependency Map

```
UC-01: Establish Org Model
  │
  ▼
UC-02: Plan & Prioritize Projects ────────► UC-04: Detect Conflicts
  │                                              │
  ├──► UC-03: Visualize Schedule                 │
  │                                              ▼
  ├──► UC-05: What-If Scenario Analysis ◄────────┘
  │         │
  │         ├──► UC-06: AI-Assisted Q&A
  │         │
  │         └──► UC-08: Track Portfolio Health
  │
  └──► UC-07: Save, Export & Restore
```

---

## 5. Key Business Rules

| # | Rule | Enforcement |
|---|------|-------------|
| BR-01 | A person's total allocation across all projects must not exceed 100% | Conflict detection (warning, not blocked) |
| BR-02 | Every project must belong to exactly one work-stream | UI enforced (required field) |
| BR-03 | Calculated end dates are derived from capacity, not estimated manually | Scheduling engine runs automatically |
| BR-04 | Only one baseline scenario exists at a time | Store logic prevents multiple baselines |
| BR-05 | What-if scenarios are deep copies — changes do not affect the baseline | Fork creates independent copy of all entities |
| BR-06 | Schema migrations are backward-compatible | Zod schemas supply defaults for new fields |
| BR-07 | Effective capacity ranges from 0% to 100% of a full-time equivalent | Input validation (0.0–1.0 stored, displayed as %) |
| BR-08 | Project priority is a unique positive integer; lower = higher priority | Drag-and-drop normalizes priorities after reorder |
| BR-09 | API keys never leave the server | Express proxy pattern; `.env` not committed |
| BR-10 | All state mutations are immutable | Signal store enforces spread pattern |

---

## 6. Non-Functional Requirements

| Category | Requirement | Current Implementation |
|----------|------------|----------------------|
| **Performance** | Scheduling engine must recalculate in < 100ms for 50 projects | Pure functional engine with O(projects × weeks) complexity |
| **Availability** | Application works offline (except AI features) | Client-side SPA with localStorage; no server dependency for core features |
| **Portability** | Data can be shared across machines | JSON export/import with schema versioning |
| **Security** | No credentials exposed to the browser | Server-side proxy with env-based token; CORS restrictions |
| **Usability** | Changes reflect immediately without manual refresh | Angular signals provide real-time reactive UI updates |
| **Extensibility** | New domain fields can be added without breaking saved data | Zod migration layer adds defaults for new fields automatically |
| **Testability** | Core scheduling logic is independently testable | Pure functions in `src/core/` with 24 Jest unit tests |

---

## 7. Value Proposition Summary

| Without ProjectPlanner | With ProjectPlanner |
|----------------------|-------------------|
| Spreadsheet-based tracking with no live calculations | Automated capacity-based scheduling engine |
| Over-allocations discovered too late (during delivery) | Real-time conflict detection across 4 dimensions |
| "What if?" questions answered by gut feel | Scenario forking with quantified slippage analysis |
| Asking an analyst to crunch numbers | AI Copilot answers portfolio questions in natural language |
| No single source of truth for staffing plans | Centralized signal-based store with export/import |
| Manual Gantt chart creation in PowerPoint/Excel | Automatic Gantt visualization from live data |
| New team members can't understand the plan | Self-documenting scenarios with full entity context |

---

## 8. Future Use Case Opportunities

| Use Case | Description | Potential Value |
|----------|-------------|-----------------|
| **UC-09: Multi-Portfolio View** | Aggregate multiple product portfolios into a single executive dashboard | VP-level visibility across the entire org |
| **UC-10: Time-Phased Capacity Planning** | Model capacity changes over time (hiring, departures, PTO calendar) | More accurate long-range forecasting |
| **UC-11: Dependency Tracking** | Define inter-project dependencies (finish-to-start, etc.) | Critical path analysis and cascading delay detection |
| **UC-12: Integration with Project Management Tools** | Sync with Jira, Azure DevOps, or GitHub Projects | Eliminate duplicate data entry |
| **UC-13: Collaborative Editing** | Real-time multi-user editing with conflict resolution | Team-based planning sessions |
| **UC-14: Historical Trend Analysis** | Track how plans evolve over time (version history) | Measure estimation accuracy and planning maturity |
| **UC-15: AI-Driven Optimization** | Let the AI suggest optimal resource allocation automatically | Move from insight to action with one click |
