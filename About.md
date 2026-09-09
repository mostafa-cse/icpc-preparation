# 🔥 ICPC Final Sprint — Training Program & Competitive Programming Cockpit

> An all-in-one, distraction-free training ecosystem designed for university ICPC teams, competitive programmers, and algorithmic Olympiad candidates striving for Regionals, World Finals, and candidate master/grandmaster ratings.

[![Curriculum](https://img.shields.io/badge/Curriculum-5%2C089%20Problems-ff5722.svg)](#-the-10-block-curriculum-5089-curated-problems)
[![Sections](https://img.shields.io/badge/Sections-593%20Topic%20Sections-ff9800.svg)](#-interactive-5089-problem-checklist)
[![Curriculum Blocks](https://img.shields.io/badge/Blocks-10%20Algorithmic%20Phases-ffca28.svg)](#-curriculum-breakdown)
[![Pacing](https://img.shields.io/badge/Pacing-16%20or%2026%20Weeks-00e5ff.svg)](#-flexible-pacing-engine-16-week-sprint-vs-26-week-extended)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Supabase%20RLS-3ecf8e.svg)](#-cloud-sync-authentication--security)
[![Architecture](https://img.shields.io/badge/Architecture-Clean%204--Tier%20Modular-blue.svg)](#-system-architecture)

---

## 📖 Executive Summary

The **ICPC Final Sprint** is a specialized, web-based competitive programming training cockpit. Preparing for competitive programming contests at the highest levels (such as the ACM-ICPC, IOI, Codeforces Div. 1, and AtCoder Grand Contests) is notorious for being fragmented:
- Contenders frequently bounce haphazardly between problem archives without structured curricula.
- Critical weaknesses in advanced domains (flows, suffix automata, centroid decomposition) remain untested until contests expose them.
- Coders lose track of solved vs. unreviewed problems, missing the power of spaced repetition.
- Teams enter onsite contests with untested, typo-ridden reference notebooks.

This platform unifies the **entire competitive programming lifecycle into a single high-performance workspace**. It curates **5,089 problems across 593 topic sections** into a structured **10-phase roadmap**, synchronizes solving progress to a secure cloud database, provides live contest radars, enforces strict problem-solving timeboxes, and builds printable contest code notebooks with cryptographic anti-typo signatures.

---

## 🌟 Visual Design & First Impression

The platform features a modern, ultra-sleek, dark-mode design system with glassmorphic cards, radiant neon accents, and curated typography (`Oswald` headers, `Inter` body, and `JetBrains Mono` code blocks).

### 🔥 The Opening Fire Flame Webloader
Upon entering the website, visitors are greeted with an animated **Competitive Programming Fire Flame Webloader**:
- **Combustion Layers**: Built purely with CSS gradients and keyframe transforms, featuring a vibrant electric cyan-blue base (high-temperature gas combustion), a luminescent white-hot inner core, a golden amber mid-tongue, and an energetic ruby-red flickering outer flame.
- **CP Code Glyph (`</>`)**: A burning, pulsing code emblem centered directly inside the flame's white-hot core, symbolizing algorithmic grit and streak consistency.
- **Ascending Ember Sparks**: Dynamic particles with randomized lateral drift rising and dissipating into the dark ambient radiance.
- **Algorithmic Compilation Ticker**: Cycles through realistic training checkpoints (*"Compiling algorithmic training sets..."*, *"Igniting daily problem streak..."*, *"Analyzing time complexity O(N log N)..."*, *"Optimal substructure identified..."*, *"Synchronizing with ICPC archives..."*).
- **Smooth Workspace Reveal**: Enforces a 1,250ms minimum visual window followed by a 600ms cubic-bezier dissolve directly into the dashboard or authentication gate.

---

## 🎯 Key Modules & Features

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               ICPC FINAL SPRINT WORKSPACE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [DASHBOARD]     [ROUTINE]     [CHECKLIST]     [TEMPLATES]     [CONTESTS]    [PROFILE] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. 📊 Solving Analytics & Activity Dashboard
A bird's-eye view of your algorithmic trajectory:
- **52-Week Contribution Heatmap**: A GitHub-style 365-day problem-solving activity matrix. Each day tracks exact problems solved, and hovering over any cell displays a detailed breakdown of problems conquered on that date.
- **Velocity & Pace Runway**: Automatically computes your required daily pace (e.g., `28 problems/day`) to finish the curriculum on target based on remaining problems and scheduled plan duration.
- **Streak Tracker**: Real-time counter of your current daily streak, personal best streak, and total active training days.
- **Daily Target Milestone**: Visual progress bar indicating today's solve count versus your configurable daily goal (default: 5 problems/day).
- **Curriculum Phase Breakdown**: Live completion meters for every one of the 10 training blocks showing start/end dates, solved count, remaining workload, and status (`ACTIVE NOW`, `UPCOMING`, or `COMPLETED`).
- **Priority / Starred Problems Queue**: Quick counter and 1-click filter for high-priority problems marked for immediate attention.

---

### 2. 📋 Interactive 5,089-Problem Checklist
The primary problem-solving engine:
- **5,089 Unique Problems across 593 Sections**: Filterable by source archive, topic section, difficulty, or keyword.
- **Multi-Source Curated Archives**: Each major curriculum can be expanded or collapsed individually, or manipulated globally via *Expand All* / *Collapse All*.
- **Spaced Repetition & Revision Flagging**:
  - Click any checkbox to mark a problem as **Solved** (records instant timestamp).
  - **Right-click or Alt+Click** to flag a problem for **Revision** (amber highlight).
  - Filter to **"Flagged only"** or **"Flagged & Unsolved"** to focus on problems that stumped you or required editorial assistance.
- **Lightning-Fast Instant Search**: Press `/` or `s` anywhere to immediately focus the search bar. Matches problem titles, platform codes (e.g. `CSES-1662`, `1000A`), and section titles with zero latency.
- **"Next Problem" Algorithmic Jumper (`n`)**: Removes decision paralysis by selecting a random unsolved problem from the active filter/block and automatically scrolling to its section.
- **External Platform Links**: Every problem includes direct deep links to platforms like CSES, Codeforces, AtCoder, LightOJ, USACO, and Luogu.

---

### 3. 📚 The 10-Block Curriculum (5,089 Curated Problems)

The training path organizes 5,089 problems into 10 cohesive training phases. The problem volume is strategically balanced so that foundational basics are completed first, core techniques are mastered mid-season, and the final weeks simulate high-pressure contests.

| Block # | Algorithmic Domain & Focus | Problem Count | Primary Topics Covered |
|:---:|:---|:---:|:---|
| **01** | **Foundations & Toolkit** | **904** | Fast I/O, C++ STL, Binary Search, Two Pointers, Prefix Sums, Bitwise Ops, Coordinate Compression, Brute Force recursion. |
| **02** | **Core Graphs & Trees** | **733** | BFS, DFS, Flood Fill, Connected Components, Dijkstra, Bellman-Ford, Floyd-Warshall, 0-1 BFS, Topological Sort, Tree Traversal, Tree Diameters. |
| **03** | **Dynamic Programming** | **835** | 1D/2D Classical DP, Knapsack variants, LIS, LCS, Grid DP, Interval DP, Bitmask DP, Digit DP, Tree DP, DAG DP. |
| **04** | **Core Data Structures** | **435** | Disjoint Set Union (DSU / Kruskal), Fenwick Trees (Binary Indexed Trees), Segment Trees (Point & Range Updates), Sparse Tables, RMQ, Ordered Sets. |
| **05** | **Math & Number Theory** | **717** | Sieve of Eratosthenes, Modular Arithmetic, Extended Euclidean, Fermat's Little Theorem, Combinatorics, Matrix Exponentiation, Inversion counting, Game Theory basics. |
| **06** | **Greedy, Pointers & Search** | **420** | Interval Scheduling, Fractional Knapsack, Huffman Coding, Ternary Search, Meet-in-the-Middle, Monotonic Queue/Stack. |
| **07** | **Strings & Suffix Structures** | **246** | String Hashing (Double Poly-Hash), KMP (Prefix Function), Z-Algorithm, Trie structures, Aho-Corasick, Suffix Arrays, Manacher's Algorithm. |
| **08** | **Advanced DS & Geometry** | **451** | Lazy Propagation Segment Trees, Persistent Segment Trees, Treaps, 2D Points/Vectors, Convex Hull, Line Intersection, Polygon Area, Sweep-Line algorithms. |
| **09** | **Advanced Graphs & Flows** | **263** | Strongly Connected Components (Tarjan / Kosaraju), 2-SAT, Bridges & Articulation Points, Max Flow (Edmonds-Karp / Dinic's), Min-Cost Max-Flow (MCMF), Bipartite Matching (Hopcroft-Karp), Euler Tours. |
| **10** | **Mock Contests & Grand Sprint** | **85** | Full 5-hour ICPC Regional & Sub-regional contest replays, team strategy drills, problem triage, penalty time optimization, and high-stress debugging under contest conditions. |

#### Authoritative Sources Included:
- **CSES Problem Set** (Finland): Complete 300+ standard benchmark collection.
- **USACO Guide**: Bronze, Silver, Gold, and Platinum division roadmaps.
- **CP-Algorithms**: 89 theoretical chapters mapped directly into problem challenges.
- **LightOJ**: Classical Bangladeshi regional competition problem archive.
- **Luogu Training**: Chinese NOI/Olympiad structured progression sets.
- **Classic CP Literature**: Steven & Felix Halim (*Competitive Programming*), Antti Laaksonen, Steven Skiena.
- **ACM-ICPC Historical Archives**: Past preliminary, regional, and national finals sets.

---

### 4. ⏱️ Time-Box Stopwatch & Pomodoro Timer
A non-negotiable rule in elite competitive programming preparation is avoiding the "rabbit hole": spending 4 hours stuck on a single problem without making progress.
- The built-in bottom-corner timer enforces a strict **45–60 minute rule**:
  - **0–44 minutes (Neutral / Green)**: Independent problem formulation, testing edge cases, analyzing constraints.
  - **45–59 minutes (Amber Alert)**: Time threshold reached. Review time complexity and re-read statements carefully.
  - **60+ minutes (Red Alert)**: Hard cap reached. You must pause, consult the editorial, write down the missing insight in your notes, and flag the problem for revision.
- **Reload-Resistant Persistence**: Stores absolute Unix timestamps rather than naive interval ticks. Closing the browser, switching tabs, or reloading mid-problem preserves the exact elapsed time without loss or inflation.

---

### 5. 🕌 Daily Routine & Dynamic Prayer Integration
Peak mental performance requires disciplined biological routines. The **Routine** module structures each day into focused 2–3 hour deep-work algorithmic blocks synchronized with daily life.
- **Jamaat-Synchronized Prayer Times**: Aligns schedule with mosque congregation (Jamaat) timings rather than purely mathematical sun angles (e.g. Zuhr at 1:30 PM).
- **Automated Geolocation**: Integrates with the Aladhan API (Karachi method, Hanafi Asr) based on browser location or IP fallback.
- **Dynamic Cascade Rebuilding**: Editing any prayer time automatically recalculates and shifts the rest of the day's study sessions and meal breaks.
- **Offline Reliability**: In the event of network disconnection, the planner falls back to built-in presets seamlessly.

---

### 6. 📖 Onsite Contest Notebook & Template Generator
ICPC rules strictly prohibit internet access during regionals and world finals, but allow teams to bring a printed 25-page **Team Reference Document (TRD)**.
- **Curated C++ Algorithm Library**: Contains production-tested, fast implementations of DSU, Fenwick Tree, Segment Tree (Lazy), Dinic's Flow, Hopcroft-Karp, Extended GCD, Matrix Exponentiation, Suffix Automaton, Convex Hull, etc.
- **Anti-Typo Cryptographic Hashes**: Every template displays a `[N lines] - hash` signature (MD5 computed from whitespace- and comment-stripped source code). When retyping code from the printed cheat sheet during a live contest, competitors can verify line count and hash to guarantee zero syntax or transcription typos.
- **Multi-Format Exporting**:
  - **LaTeX (`.tex`)**: Fully formatted two-column document ready for `pdflatex` compilation with automated table of contents, syntax highlighting (`listings`), and page numbering.
  - **Markdown (`.md`)**: GitHub-ready documentation format.
  - **Monolithic C++ (`.cpp`)**: All templates concatenated with compiler `#pragma` headers.
  - **JSON (`.json`)**: Raw backup for import/export.
  - **Print / PDF**: Direct browser print styling.

---

### 7. 📡 Live Global Contest Radar
Never miss an official rating round or team simulation:
- **Aggregated Calendar**: Live schedule covering **Codeforces**, **AtCoder**, **CodeChef**, and **LeetCode**.
- **Live Countdown Ticker**: Real-time ticker counting down hours and minutes until contest registration and start.
- **Browser Reminders**: Desktop notifications prior to round start.
- **1-Click Calendar Sync (`.ics`)**: Direct export to Google Calendar, Apple Calendar, and Microsoft Outlook.

---

### 8. ⚡ Flexible Pacing Engine: 16-Week Sprint vs. 26-Week Extended
Different candidates have different preparation horizons before their regional qualifiers:
- **16-Week Sprint Plan (≈4 Months)**: Fast-paced intensive track for candidates competing in the current semester.
- **26-Week Extended Plan (≈6 Months)**: Comprehensive deep-dive track for systematic long-term mastery.
- **Workload Balancing**: The system dynamically weights blocks so that heavy foundational blocks (e.g. Block 1 with 904 problems) are allotted adequate span, while narrow domains (e.g. Computational Geometry) surrender surplus weeks to maintain an even, achievable daily quota.
- Switching between plans never touches your solved or flagged records—progress is mapped to immutable problem IDs.

---

### 9. 🛡️ Cloud Sync, Authentication & Security
For multi-device synchronization (desktop, laptop, mobile):
- **PostgreSQL Database via Supabase**: Direct synchronization of solved states, timestamps, flagged review lists, and user configurations.
- **Row-Level Security (RLS)**: Enforces database-level isolation. Each user can only read and write their own solving records; unauthorized data access is rejected by PostgreSQL itself.
- **Verified Gmail Whitelist**: Restricts account creation to verified Gmail domains (`@gmail.com` and `@googlemail.com`), blocking disposable email providers at the database trigger level.
- **Admin Moderation Portal**:
  - New signups enter a secure `pending` queue.
  - An administrator must review and approve accounts before database access is granted.
  - Role management (promoting to admin, revoking access, banning malicious actors).
  - Immutable, append-only `moderation_log` table preventing tamper or audit erasure.
- **Zero-Config Offline Mode**: If no Supabase credentials are provided, the application runs 100% offline via browser `localStorage`.

---

## ⌨️ Keyboard Shortcuts & Power-User Controls

The entire application is navigable without touching a mouse:

| Shortcut | Action |
|:---:|:---|
| <kbd>/</kbd> or <kbd>s</kbd> | Jump immediately to the Checklist search box |
| <kbd>Esc</kbd> | Clear active search and unfocus the input box |
| <kbd>1</kbd> | Navigate to **Routine & Daily Planner** |
| <kbd>2</kbd> | Navigate to **Interactive Checklist** |
| <kbd>3</kbd> | Navigate to **Code Templates Notebook** |
| <kbd>4</kbd> | Navigate to **Live Contests Radar** |
| <kbd>5</kbd> | Navigate to **Profile & Cloud Sync** |
| <kbd>e</kbd> / <kbd>E</kbd> | Expand all / collapse all topic sections |
| <kbd>f</kbd> | Toggle *Flagged Only* revision filter |
| <kbd>n</kbd> | Jump to a random unsolved problem in the active view |
| <kbd>t</kbd> / <kbd>T</kbd> | Start / pause / reset the problem timebox stopwatch |
| <kbd>?</kbd> | Display / hide the shortcut cheat sheet modal |

*Note: Keyboard shortcuts automatically deactivate when typing inside form inputs or search boxes to prevent accidental navigation.*

---

## 🏗️ System Architecture

The codebase is engineered with a modular, maintainable 4-tier separation:

```
ICPC Preparation/
├── frontend/                     # High-speed client Single Page Application
│   ├── index.html                # App layout, flame loader DOM & controllers
│   ├── styles.css                # CSS design system (tokens, animations, flame rig)
│   ├── script.js                 # Problem repository & checklist engine
│   ├── account.js                # Supabase authentication & cloud state sync
│   ├── admin.js                  # Admin user moderation dashboard
│   ├── contests.js               # Contest schedule API & calendar exports
│   ├── dashboard.js              # Solving analytics, heatmaps & pacing runway
│   ├── prayer.js                 # Geolocation & daily Jamaat prayer timing
│   ├── routine.js                # 16/26-week calendar planner & scheduler
│   ├── settings.js               # User configurations, durations & local backups
│   ├── supabase-config.js        # Supabase client endpoints & public anon key
│   ├── templates.js              # C++ algorithm templates & LaTeX compiler
│   ├── theme.js                  # Dark, Dim, Light, and contrast theme switcher
│   └── timer.js                  # Persistent timebox stopwatch
│
├── backend/                      # Local development servers & toolchain
│   ├── server.js                 # Zero-dependency Node.js HTTP server
│   ├── server.py                 # Python 3 fallback development server
│   └── stamp.js                  # Cryptographic asset cache-busting tool
│
├── database/                     # PostgreSQL schema, migrations & RLS
│   └── supabase-schema.sql       # Idempotent database schema & RLS policies
│
├── content/                      # Authoritative curriculum markdown archives
│   ├── CSES.md                   # CSES 300+ problems
│   ├── USACO-Guide.md            # USACO Bronze-to-Platinum curricula
│   ├── cp-algo.md                # CP-Algorithms 89 topics
│   ├── LightOJ.md                # LightOJ problem archive
│   ├── Lougu-Training.md         # Luogu structured training roadmap
│   ├── Cp-books.md               # Exercises from classic CP literature
│   └── acm.md                    # Historic ACM-ICPC regional & world finals
│
├── index.html                    # Root gateway with matching fire flame loader
├── package.json                  # Developer workflow scripts (`npm start`, `npm run stamp`)
├── README.md                     # Technical developer documentation
└── About.md                      # Complete user-facing project specification
```

---

## 🚀 Running Locally in 10 Seconds

You do not need heavy node_modules or build steps to run this application:

```bash
# Clone the repository
git clone https://github.com/mostafa-cse/icpc-preparation.git
cd icpc-preparation

# Start development server with npm:
npm start

# Or start using pure Node:
node backend/server.js

# Or start using pure Python 3:
python3 backend/server.py
```

Then visit `http://localhost:8085` in your browser.

---

## 👥 Target Audience

- **ICPC University Teams**: Squads preparing for regional contests and World Finals looking for a shared, rigorous training schedule.
- **Competitive Programmers**: Individuals aiming to break through rating plateaus on Codeforces (Expert $\to$ Candidate Master $\to$ Master) and AtCoder.
- **Olympiad Students**: High school competitors preparing for national Olympiads in Informatics (NOI) and the IOI.
- **Software Engineering Candidates**: Engineers preparing for rigorous algorithmic interviews at top-tier research and technology firms.

---

## 📜 License & Acknowledgments

- **Curricula & Problem Rights**: All problem descriptions, statements, and problem names remain the intellectual property of their respective platforms (CSES, USACO, Codeforces, AtCoder, LightOJ, Luogu, and the ICPC Foundation).
- **Platform Development**: Developed and maintained by **Mostafa Kamal** for the global competitive programming community.

*Keep the streak alive, respect the 60-minute timebox, and ignite your ICPC journey!* 🔥
