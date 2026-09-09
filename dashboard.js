/*
 * ICPC Preparation Tracker — Solving Analytics Dashboard & Heatmap
 *
 * Provides real-time solving analytics, a 52-week daily contribution heatmap
 * with interactive hover tooltips, streak calculations, pace runway,
 * and curriculum completion breakdowns.
 */
(() => {
  "use strict";

  const DAILY_GOAL_STORE = "icpc_daily_goal";

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function getDailyGoal() {
    return parseInt(localStorage.getItem(DAILY_GOAL_STORE) || "5", 10);
  }

  // ---------- Calculations & Aggregations ----------
  function computeStats() {
    if (!window.ICPCData) return null;
    const allIds = window.ICPCData.allIds();
    const solved = window.ICPCData.solvedSet();
    const flagged = window.ICPCData.flaggedSet();
    const solveDates = window.ICPCData.solveDates();
    const plan = window.ICPCData.plan();
    const phases = window.ICPCData.phases();
    const files = window.ICPCData.files();
    const byPhaseIds = window.ICPCData.byPhaseIds();
    const byFileIds = window.ICPCData.byFileIds();
    const countSet = window.ICPCData.countSet;

    const totalProblems = allIds.size;
    const solvedProblems = countSet(allIds);
    const remainProblems = Math.max(0, totalProblems - solvedProblems);
    const pct = totalProblems ? ((100 * solvedProblems) / totalProblems).toFixed(1) : "0.0";

    // Build date to problem IDs map
    const dateMap = new Map();
    solved.forEach(id => {
      const d = solveDates[id] || new Date().toISOString().slice(0, 10);
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d).push(id);
    });

    // Today count
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = (dateMap.get(todayStr) || []).length;
    const dailyGoal = getDailyGoal();

    // Streak calculation
    let currentStreak = 0;
    let longestStreak = 0;
    let totalActiveDays = dateMap.size;

    // Check streak walking backwards from today or yesterday
    const dCheck = new Date();
    const checkStr = dCheck.toISOString().slice(0, 10);
    if ((dateMap.get(checkStr) || []).length > 0) {
      currentStreak++;
      dCheck.setDate(dCheck.getDate() - 1);
    } else {
      // Check if yesterday had solves
      dCheck.setDate(dCheck.getDate() - 1);
    }

    while (true) {
      const s = dCheck.toISOString().slice(0, 10);
      if ((dateMap.get(s) || []).length > 0) {
        currentStreak++;
        dCheck.setDate(dCheck.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak across all dates in sorted order
    const sortedDates = [...dateMap.keys()].sort();
    let tempStreak = 0;
    let prevDate = null;
    sortedDates.forEach(ds => {
      const curr = new Date(ds + "T00:00:00");
      if (prevDate) {
        const diffDays = Math.round((curr - prevDate) / 86400000);
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      prevDate = curr;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    });

    // Program Pace Maths
    const storedStart = localStorage.getItem("icpc_start_date");
    const startDate = storedStart ? new Date(storedStart + "T00:00:00") : new Date();
    const now = new Date();
    const daysSinceStart = Math.floor((new Date(now.toDateString()) - new Date(startDate.toDateString())) / 86400000);
    const totalPlanDays = plan.total * 7;
    const remainDays = Math.max(1, totalPlanDays - daysSinceStart);
    const requiredDailyPace = remainProblems > 0 ? Math.ceil(remainProblems / remainDays) : 0;
    const currentVelocity = daysSinceStart > 0 ? (solvedProblems / daysSinceStart).toFixed(1) : solvedProblems;

    return {
      allIds,
      solved,
      flagged,
      solveDates,
      dateMap,
      plan,
      phases,
      files,
      byPhaseIds,
      byFileIds,
      countSet,
      totalProblems,
      solvedProblems,
      remainProblems,
      pct,
      todayCount,
      dailyGoal,
      currentStreak,
      longestStreak,
      totalActiveDays,
      daysSinceStart,
      remainDays,
      requiredDailyPace,
      currentVelocity,
      startDate,
    };
  }

  // ---------- Render Heatmap Grid ----------
  function renderHeatmapGrid(stats) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End date is upcoming Saturday (end of current week)
    const end = new Date(today);
    const endDayOfWeek = end.getDay(); // 0: Sun, 6: Sat
    end.setDate(end.getDate() + (6 - endDayOfWeek));

    // We render 52 weeks (364 days) to give a full rolling year
    const TOTAL_WEEKS = 52;
    const start = new Date(end);
    start.setDate(start.getDate() - (TOTAL_WEEKS * 7 - 1));

    const weeks = [];
    const curr = new Date(start);

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const daysInWeek = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = curr.toISOString().slice(0, 10);
        const solves = stats.dateMap.get(dateStr) || [];
        const isFuture = curr > today;

        let tier = 0;
        if (!isFuture) {
          const n = solves.length;
          if (n >= 10) tier = 4;
          else if (n >= 6) tier = 3;
          else if (n >= 3) tier = 2;
          else if (n >= 1) tier = 1;
        }

        daysInWeek.push({
          date: new Date(curr),
          dateStr,
          solves,
          count: solves.length,
          tier,
          isFuture,
          isToday: curr.getTime() === today.getTime(),
        });

        curr.setDate(curr.getDate() + 1);
      }
      weeks.push(daysInWeek);
    }

    // Month headers
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((w, wIdx) => {
      const firstDay = w[0].date;
      const m = firstDay.getMonth();
      if (m !== lastMonth && wIdx < TOTAL_WEEKS - 2) {
        lastMonth = m;
        const name = firstDay.toLocaleDateString(undefined, { month: "short" });
        monthLabels.push({ name, colIndex: wIdx });
      }
    });

    let monthsHtml = `<div class="hm-months-row">`;
    monthLabels.forEach((ml, idx) => {
      const nextCol = idx < monthLabels.length - 1 ? monthLabels[idx + 1].colIndex : TOTAL_WEEKS;
      const span = nextCol - ml.colIndex;
      monthsHtml += `<span class="hm-month-label" style="grid-column:${ml.colIndex + 2} / span ${span}">${ml.name}</span>`;
    });
    monthsHtml += `</div>`;

    // Day of week labels
    const dayLabelsHtml = `
      <div class="hm-days-col">
        <span></span>
        <span>Mon</span>
        <span></span>
        <span>Wed</span>
        <span></span>
        <span>Fri</span>
        <span></span>
      </div>
    `;

    // Columns of cells
    let gridColsHtml = `<div class="hm-cells-grid">`;
    weeks.forEach((week) => {
      gridColsHtml += `<div class="hm-week-col">`;
      week.forEach(day => {
        const cls = [
          "hm-cell",
          `tier-${day.tier}`,
          day.isToday ? "is-today" : "",
          day.isFuture ? "is-future" : "",
        ].filter(Boolean).join(" ");

        gridColsHtml += `<div class="${cls}" data-date="${day.dateStr}" data-count="${day.count}"></div>`;
      });
      gridColsHtml += `</div>`;
    });
    gridColsHtml += `</div>`;

    return `
      <div class="hm-scroll-wrap">
        <div class="hm-calendar">
          ${monthsHtml}
          <div class="hm-body-row">
            ${dayLabelsHtml}
            ${gridColsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Setup Interactive Tooltip ----------
  let activeTooltip = null;
  function ensureTooltip() {
    if (activeTooltip) return activeTooltip;
    const tt = document.createElement("div");
    tt.id = "hmTooltip";
    tt.className = "hm-tooltip";
    tt.style.display = "none";
    document.body.appendChild(tt);
    activeTooltip = tt;
    return tt;
  }

  function attachTooltipListeners(container, stats) {
    const tt = ensureTooltip();
    const cells = container.querySelectorAll(".hm-cell:not(.is-future)");

    cells.forEach(cell => {
      cell.addEventListener("mouseenter", e => {
        const dateStr = cell.dataset.date;
        const count = parseInt(cell.dataset.count, 10);
        const solves = stats.dateMap.get(dateStr) || [];
        const dObj = new Date(dateStr + "T00:00:00");
        const formattedDate = dObj.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric"
        });

        let chipsHtml = "";
        if (solves.length > 0) {
          const preview = solves.slice(0, 8);
          chipsHtml = `<div class="hm-tt-chips">` +
            preview.map(id => `<span class="hm-tt-chip">${esc(window.ICPCData ? window.ICPCData.displayId(id) : id)}</span>`).join("") +
            (solves.length > 8 ? `<span class="hm-tt-more">+${solves.length - 8} more</span>` : "") +
            `</div>`;
        }

        tt.innerHTML = `
          <div class="hm-tt-head">
            <span class="hm-tt-date">${esc(formattedDate)}</span>
            <span class="hm-tt-badge ${count > 0 ? "good" : "zero"}">${count} solved</span>
          </div>
          ${count > 0 ? `<div class="hm-tt-sub">${count} problem${count === 1 ? "" : "s"} cleared on this day</div>` : `<div class="hm-tt-sub">No recorded solves on this date</div>`}
          ${chipsHtml}
        `;
        tt.style.display = "block";
        positionTooltip(e, tt);
      });

      cell.addEventListener("mousemove", e => {
        positionTooltip(e, tt);
      });

      cell.addEventListener("mouseleave", () => {
        tt.style.display = "none";
      });

      // Quick filter on click
      cell.addEventListener("click", () => {
        const solves = stats.dateMap.get(cell.dataset.date) || [];
        if (solves.length && window.ICPCData) {
          window.ICPCData.activateTab("checklist");
          const searchBox = document.getElementById("searchBox");
          if (searchBox) {
            searchBox.value = window.ICPCData.displayId(solves[0]);
            searchBox.dispatchEvent(new Event("input"));
          }
        }
      });
    });
  }

  function positionTooltip(e, tt) {
    const gap = 12;
    const ttRect = tt.getBoundingClientRect();
    let x = e.clientX + gap;
    let y = e.clientY - ttRect.height - gap;

    if (x + ttRect.width > window.innerWidth - 12) {
      x = e.clientX - ttRect.width - gap;
    }
    if (y < 12) {
      y = e.clientY + gap;
    }

    tt.style.left = `${Math.max(8, x)}px`;
    tt.style.top = `${Math.max(8, y)}px`;
  }

  // ---------- Main Render Function ----------
  function render() {
    const host = document.getElementById("dashboardBody");
    if (!host) return;

    const stats = computeStats();
    if (!stats) {
      host.innerHTML = `<div class="empty-note">Loading curriculum statistics...</div>`;
      return;
    }

    const schedule = window.ICPCPlan
      ? window.ICPCPlan.getSchedule(stats.plan.total, stats.startDate.toISOString().slice(0, 10))
      : [];

    const fmtShort = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    // 1. KPI Hero Cards
    const kpiHtml = `
      <div class="db-kpi-grid">
        <!-- Card 1: Total Solved -->
        <div class="db-kpi-card">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Total Solved</span>
            <span class="db-kpi-badge good">${stats.pct}%</span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val">${stats.solvedProblems.toLocaleString()}</span>
            <span class="db-kpi-sub">/ ${stats.totalProblems.toLocaleString()} problems</span>
          </div>
          <div class="bar db-kpi-bar"><i style="width:${stats.pct}%;background:var(--good)"></i></div>
        </div>

        <!-- Card 2: Remaining -->
        <div class="db-kpi-card">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Remaining to Solve</span>
            <span class="db-kpi-badge warn">Target</span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val">${stats.remainProblems.toLocaleString()}</span>
            <span class="db-kpi-sub">problems remaining</span>
          </div>
          <div class="bar db-kpi-bar"><i style="width:${100 - parseFloat(stats.pct)}%;background:var(--warn)"></i></div>
        </div>

        <!-- Card 3: Daily Streak -->
        <div class="db-kpi-card">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Daily Streak</span>
            <span class="db-kpi-badge accent">Consistency</span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val"><svg class="kpi-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>${stats.currentStreak} <small>days</small></span>
            <span class="db-kpi-sub">Best: ${stats.longestStreak}d · ${stats.totalActiveDays} active days</span>
          </div>
          <div class="db-kpi-streak-dots">
            ${[...Array(7)].map((_, i) => `<span class="db-streak-dot${i < stats.currentStreak ? " on" : ""}"></span>`).join("")}
          </div>
        </div>

        <!-- Card 4: Today's Solve Velocity -->
        <div class="db-kpi-card">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Today's Progress</span>
            <span class="db-kpi-badge ${stats.todayCount >= stats.dailyGoal ? "good" : "accent"}">
              ${stats.todayCount >= stats.dailyGoal ? "Goal Met" : "In Progress"}
            </span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val"><svg class="kpi-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>${stats.todayCount} <small>/ ${stats.dailyGoal}</small></span>
            <span class="db-kpi-sub">Target goal set in Settings</span>
          </div>
          <div class="bar db-kpi-bar"><i style="width:${Math.min(100, Math.round((100 * stats.todayCount) / Math.max(1, stats.dailyGoal)))}%;background:var(--accent)"></i></div>
        </div>

        <!-- Card 5: Required Daily Pace -->
        <div class="db-kpi-card">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Required Pace</span>
            <span class="db-kpi-badge">${stats.plan.total}W Plan</span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val"><svg class="kpi-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>${stats.requiredDailyPace} <small>/ day</small></span>
            <span class="db-kpi-sub">to finish in ${stats.remainDays} days left</span>
          </div>
          <div class="db-kpi-note">Velocity: ~${stats.currentVelocity} solves/day</div>
        </div>

        <!-- Card 6: Starred / Important Problems -->
        <div class="db-kpi-card db-kpi-starred" id="dbKpiStarred" role="button" tabindex="0" title="Click to filter Starred problems in Checklist" style="cursor:pointer">
          <div class="db-kpi-top">
            <span class="db-kpi-title">Important / Starred</span>
            <span class="db-kpi-badge warn">★ Priority</span>
          </div>
          <div class="db-kpi-main">
            <span class="db-kpi-val"><svg class="kpi-icon" width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>${stats.flagged.size}</span>
            <span class="db-kpi-sub">problems starred</span>
          </div>
          <div class="db-kpi-note" style="color:var(--accent-ink);display:flex;align-items:center;gap:0.25rem;">
            <span>${stats.countSet(stats.flagged)} solved · ${Math.max(0, stats.flagged.size - stats.countSet(stats.flagged))} remaining</span>
            <span style="margin-left:auto;font-weight:600">Filter →</span>
          </div>
        </div>
      </div>
    `;

    // 2. Heatmap Section
    const heatmapGridHtml = renderHeatmapGrid(stats);
    const totalYearSolves = [...stats.dateMap.values()].reduce((acc, arr) => acc + arr.length, 0);

    const heatmapSectionHtml = `
      <section class="doc-section db-section">
        <div class="db-section-header">
          <div>
            <h3>Activity Heatmap</h3>
            <p class="db-section-sub">${totalYearSolves.toLocaleString()} problems recorded across your training timeline. Hover over any square to see details.</p>
          </div>
          <div class="hm-legend">
            <span>Less</span>
            <span class="hm-cell tier-0"></span>
            <span class="hm-cell tier-1"></span>
            <span class="hm-cell tier-2"></span>
            <span class="hm-cell tier-3"></span>
            <span class="hm-cell tier-4"></span>
            <span>More</span>
          </div>
        </div>

        ${heatmapGridHtml}
      </section>
    `;

    // 3. Phase Runway Section (All 10 Blocks)
    let phaseRowsHtml = "";
    stats.phases.forEach((p) => {
      const s = schedule[p.id] || { weeks: 2, startDate: new Date(), endDate: new Date() };
      const ids = stats.byPhaseIds[p.id];
      const d = stats.countSet(ids);
      const t = ids.size;
      const rem = Math.max(0, t - d);
      const pPct = t ? ((100 * d) / t).toFixed(1) : "0.0";
      const now = new Date();
      const isCurrent = now >= s.startDate && now <= s.endDate;
      const isPast = now > s.endDate;

      let statusBadge = `<span class="db-phase-badge upcoming">Upcoming</span>`;
      if (d === t && t > 0) statusBadge = `<span class="db-phase-badge done">Completed</span>`;
      else if (isCurrent) statusBadge = `<span class="db-phase-badge active">Active Now</span>`;
      else if (isPast) statusBadge = `<span class="db-phase-badge overdue">In Review</span>`;

      phaseRowsHtml += `
        <tr class="${isCurrent ? "is-active-phase" : ""}">
          <td class="db-td-num"><b>${p.id + 1}</b></td>
          <td class="db-td-name">
            <strong>${esc(p.name)}</strong>
            <span class="db-td-desc">${esc(p.desc)}</span>
          </td>
          <td class="db-td-dates">
            <span class="db-date-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${fmtShort(s.startDate)} – ${fmtShort(s.endDate)}</span>
            <span class="db-weeks-pill">${s.weeks} wk (${s.weeks * 7}d)</span>
          </td>
          <td class="db-td-progress">
            <div class="db-prog-wrap">
              <div class="bar"><i style="width:${pPct}%"></i></div>
              <span class="db-prog-num">${d}/${t} (${pPct}%)</span>
            </div>
          </td>
          <td class="db-td-remain"><b>${rem.toLocaleString()}</b> left</td>
          <td class="db-td-status">${statusBadge}</td>
          <td class="db-td-action">
            <button type="button" class="btn db-jump-btn" data-db-phase="${p.id}">
              Practice →
            </button>
          </td>
        </tr>
      `;
    });

    const phaseRunwayHtml = `
      <section class="doc-section db-section">
        <div class="db-section-header">
          <div>
            <h3>Curriculum Phase Runway (${stats.plan.total}-Week Plan)</h3>
            <p class="db-section-sub">Scheduled start and end dates, progress, and problem loads for each of the 10 training blocks.</p>
          </div>
          <a href="#" data-goto-tab="settings" class="btn" style="font-size:0.8rem">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>Pacing in Settings
          </a>
        </div>

        <div class="db-table-wrap">
          <table class="db-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Topic &amp; Focus</th>
                <th>Timeline</th>
                <th>Progress</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${phaseRowsHtml}
            </tbody>
          </table>
        </div>
      </section>
    `;

    // 4. Source Platforms & Directives Breakdown
    let filePillsHtml = "";
    stats.files.forEach(f => {
      const ids = stats.byFileIds[f];
      const d = stats.countSet(ids);
      const t = ids.size;
      const fPct = t ? ((100 * d) / t).toFixed(1) : "0.0";
      filePillsHtml += `
        <div class="db-platform-card" data-db-file="${esc(f)}">
          <div class="db-plat-head">
            <strong>${esc(f.replace(".md", ""))}</strong>
            <span>${d}/${t} (${fPct}%)</span>
          </div>
          <div class="bar db-plat-bar"><i style="width:${fPct}%"></i></div>
        </div>
      `;
    });

    const breakdownsHtml = `
      <div class="db-double-grid">
        <section class="doc-section db-section">
          <div class="db-section-header">
            <h3>Sources &amp; Platforms</h3>
            <span class="db-section-sub">${stats.files.length} catalog files</span>
          </div>
          <div class="db-platform-grid">
            ${filePillsHtml}
          </div>
        </section>

        <section class="doc-section db-section">
          <div class="db-section-header">
            <h3>Training Directives</h3>
            <span class="db-section-sub">Core rules for peak contest readiness</span>
          </div>
          <div class="db-directives-list">
            <div class="db-directive-item">
              <span class="db-dir-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </span>
              <div>
                <strong>Strict Time-Boxing</strong>
                <p>45m soft cap / 60m editorial cap during training blocks. Take the hint, write the solution, and flag for 48h repetition.</p>
              </div>
            </div>
            <div class="db-directive-item">
              <span class="db-dir-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              </span>
              <div>
                <strong>Same-Day Upsolve</strong>
                <p>Never sleep on an unsolved contest problem. The value drops by 80% if not resolved within 24 hours.</p>
              </div>
            </div>
            <div class="db-directive-item">
              <span class="db-dir-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </span>
              <div>
                <strong>Error Log Discipline</strong>
                <p>Record your failure mode for every missed problem: algorithm gap, implementation bug, or time trap.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    host.innerHTML = `
      <div class="db-header">
        <div>
          <h2>Solving Analytics &amp; Activity Dashboard</h2>
          <p class="db-header-sub">Track daily problem throughput, phase timelines, consistency streaks, and velocity runway.</p>
        </div>
        <div class="db-header-actions">
          <a href="#" data-goto-tab="checklist" class="btn primary">Go to Checklist →</a>
          <a href="#" data-goto-tab="routine" class="btn">View Routine</a>
          <a href="#" data-goto-tab="settings" class="btn">Settings</a>
        </div>
      </div>

      ${kpiHtml}
      ${heatmapSectionHtml}
      ${phaseRunwayHtml}
      ${breakdownsHtml}
    `;

    // Attach heatmap tooltip listeners
    attachTooltipListeners(host, stats);

    // Attach navigation & jump listeners
    host.querySelectorAll("[data-goto-tab]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        if (window.ICPCData) window.ICPCData.activateTab(el.dataset.gotoTab);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    host.querySelectorAll(".db-jump-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const pId = btn.dataset.dbPhase;
        if (window.ICPCData) {
          window.ICPCData.activateTab("checklist");
          window.ICPCData.applyFilters(pId);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });

    host.querySelectorAll("[data-db-file]").forEach(card => {
      card.addEventListener("click", () => {
        const f = card.dataset.dbFile;
        if (window.ICPCData) {
          window.ICPCData.activateTab("checklist");
          window.ICPCData.applyFilters(undefined, f);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });

    const starKpi = host.querySelector("#dbKpiStarred");
    if (starKpi) {
      starKpi.addEventListener("click", () => {
        if (window.ICPCData) {
          window.ICPCData.activateTab("checklist");
          window.ICPCData.applyFilters(undefined, undefined, true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
      starKpi.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          starKpi.click();
        }
      });
    }
  }

  // ---------- Listen to App Events ----------
  document.addEventListener("DOMContentLoaded", render);
  document.addEventListener("icpc:tab", e => {
    if (e.detail === "dashboard") render();
  });
  document.addEventListener("icpc:progress_updated", () => {
    const p = document.getElementById("panel-dashboard");
    if (p && p.classList.contains("active")) render();
  });
  document.addEventListener("icpc:plan_updated", () => {
    const p = document.getElementById("panel-dashboard");
    if (p && p.classList.contains("active")) render();
  });
  document.addEventListener("icpc:settings", () => {
    const p = document.getElementById("panel-dashboard");
    if (p && p.classList.contains("active")) render();
  });

  window.ICPCDashboard = {
    render,
  };
})();
