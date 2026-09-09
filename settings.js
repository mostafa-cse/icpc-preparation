/*
 * Settings tab module for ICPC Training Program.
 *
 * Controls:
 *   1. Profile edit and Competitive Programming accounts save (Codeforces, LeetCode, AtCoder, CodeChef, VJudge, CSES, HackerRank, GitHub)
 *   2. Starting time & schedule configuration (daily training day start time, sprint start date, target contest countdown, time-box caps)
 *   3. Routine type selection (Intense, Balanced, Contest-heavy, Mastery, Weekend Warrior)
 *   4. Recommendations (Theme, audio alerts, daily problem goal, all-in-one data backup & sync)
 */
(function () {
  "use strict";

  const PROFILE_STORE = "icpc_profile_data";
  const TARGET_DATE_STORE = "icpc_target_date";
  const DAILY_GOAL_STORE = "icpc_daily_target";
  const SOUND_STORE = "icpc_sound_enabled";
  const TIMEBOX_SOFT_STORE = "icpc_timebox_soft";
  const TIMEBOX_HARD_STORE = "icpc_timebox_hard";

  const DEFAULT_PROFILE = {
    displayName: "",
    handle: "",
    avatarBadge: "CP",
    avatarEmoji: "CP",
    bio: "",
    institution: "",
    targetRating: "Specialist → Candidate Master",
    preferredLang: "C++20",
    accounts: {
      codeforces: "",
      leetcode: "",
      atcoder: "",
      codechef: "",
      vjudge: "",
      cses: "",
      hackerrank: "",
      github: ""
    }
  };

  const CP_PLATFORMS = [
    {
      id: "codeforces",
      name: "Codeforces",
      badge: "CF",
      color: "#1f8acb",
      bg: "rgba(31, 138, 203, 0.12)",
      placeholder: "e.g. tourist",
      url: handle => `https://codeforces.com/profile/${encodeURIComponent(handle)}`,
      hasLiveCheck: true
    },
    {
      id: "leetcode",
      name: "LeetCode",
      badge: "LC",
      color: "#ffa116",
      bg: "rgba(255, 161, 22, 0.12)",
      placeholder: "e.g. username",
      url: handle => `https://leetcode.com/u/${encodeURIComponent(handle)}`
    },
    {
      id: "atcoder",
      name: "AtCoder",
      badge: "AC",
      color: "#222222",
      colorDark: "#94a3b8",
      bg: "rgba(100, 116, 139, 0.12)",
      placeholder: "e.g. chokudai",
      url: handle => `https://atcoder.jp/users/${encodeURIComponent(handle)}`
    },
    {
      id: "codechef",
      name: "CodeChef",
      badge: "CC",
      color: "#5b4638",
      colorDark: "#d97706",
      bg: "rgba(217, 119, 6, 0.12)",
      placeholder: "e.g. username",
      url: handle => `https://www.codechef.com/users/${encodeURIComponent(handle)}`
    },
    {
      id: "vjudge",
      name: "VJudge",
      badge: "VJ",
      color: "#0284c7",
      bg: "rgba(2, 132, 199, 0.12)",
      placeholder: "e.g. username",
      url: handle => `https://vjudge.net/user/${encodeURIComponent(handle)}`
    },
    {
      id: "cses",
      name: "CSES",
      badge: "CS",
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.12)",
      placeholder: "User ID or nickname",
      url: handle => `https://cses.fi/user/${encodeURIComponent(handle)}`
    },
    {
      id: "hackerrank",
      name: "HackerRank",
      badge: "HR",
      color: "#059669",
      bg: "rgba(5, 150, 105, 0.12)",
      placeholder: "e.g. username",
      url: handle => `https://www.hackerrank.com/${encodeURIComponent(handle)}`
    },
    {
      id: "github",
      name: "GitHub",
      badge: "GH",
      color: "#6366f1",
      bg: "rgba(99, 102, 241, 0.12)",
      placeholder: "e.g. username",
      url: handle => `https://github.com/${encodeURIComponent(handle)}`
    }
  ];

  const BADGE_PRESETS = ["CP", "ICPC", "CF", "AC", "IOI", "DEV", "PRO", "TOP"];

  let cfLiveInfo = null;
  let toastTimer = null;

  // ------------------------------------------------------------------ helpers --
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function readProfile() {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_STORE) || "{}");
      const rawBadge = String(stored.avatarBadge || stored.avatarEmoji || "CP");
      const cleanBadge = rawBadge.replace(/[\uD800-\uDFFF\u2600-\u27BF]/g, "").trim().toUpperCase().slice(0, 4) || "CP";
      stored.avatarBadge = cleanBadge;
      stored.avatarEmoji = cleanBadge;
      return Object.assign({}, DEFAULT_PROFILE, stored, {
        accounts: Object.assign({}, DEFAULT_PROFILE.accounts, stored.accounts || {})
      });
    } catch (e) {
      return Object.assign({}, DEFAULT_PROFILE);
    }
  }

  function saveProfile(data, opts) {
    localStorage.setItem(PROFILE_STORE, JSON.stringify(data));
    if (!(opts && opts.silent)) {
      // Sync with ICPCAccount if active
      if (window.ICPCAccount && typeof window.ICPCAccount.updateProfile === "function") {
        window.ICPCAccount.updateProfile({
          display_name: data.displayName,
          handle: data.handle,
          avatar_emoji: data.avatarEmoji,
          bio: data.bio,
          target_rating: data.targetRating,
          institution: data.institution,
          preferred_lang: data.preferredLang,
          cp_accounts: data.accounts
        });
      }
      const sync = window.ICPCSettings && window.ICPCSettings.onChange;
      if (typeof sync === "function") {
        sync({
          cp_accounts: data.accounts,
          target_rating: data.targetRating,
          preferred_lang: data.preferredLang
        });
      }
      document.dispatchEvent(new CustomEvent("icpc:profile_updated", { detail: data }));
    }
  }

  function showToast(message, isErr) {
    let el = document.getElementById("settingsToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "settingsToast";
      el.className = "st-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("is-error", !!isErr);
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("is-visible");
    }, 2800);
  }

  function playNotificationChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Note 1: C5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.16, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: G5 (chime harmony)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(783.99, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    } catch (e) {
      console.warn("Audio playback not supported or blocked", e);
    }
  }

  // -------------------------------------------------------- Codeforces live info --
  async function fetchCodeforcesInfo(handle) {
    if (!handle || !handle.trim()) return null;
    try {
      const res = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle.trim())}`);
      const data = await res.json();
      if (data.status === "OK" && data.result && data.result.length) {
        return data.result[0];
      }
    } catch (e) {
      console.warn("Could not reach Codeforces API", e);
    }
    return null;
  }

  // ------------------------------------------------------------- rendering --
  function render() {
    const host = document.getElementById("settingsBody");
    if (!host) return;

    const profileData = readProfile();
    const currentRoutine = window.ICPCRoutine ? window.ICPCRoutine.routineType() : "intense";
    const routinePresets = window.ICPCRoutine ? window.ICPCRoutine.routinePresets() : {};
    const activePreset = routinePresets[currentRoutine] || { name: "Intense ICPC Sprint", desc: "", tagline: "" };

    const user = window.ICPCAccount ? window.ICPCAccount.currentUser() : null;
    const isOffline = window.ICPCAccount ? window.ICPCAccount.isOffline() : true;

    const dayStartHHMM = window.ICPCRoutine ? window.ICPCRoutine.dayStartHHMM() : "06:00";
    const startDate = localStorage.getItem("icpc_start_date") || new Date().toISOString().slice(0, 10);
    const targetContestDate = localStorage.getItem(TARGET_DATE_STORE) || "";
    const dailyTarget = parseInt(localStorage.getItem(DAILY_GOAL_STORE) || "5", 10);
    const soundEnabled = localStorage.getItem(SOUND_STORE) !== "false";
    const softCap = parseInt(localStorage.getItem(TIMEBOX_SOFT_STORE) || "45", 10);
    const hardCap = parseInt(localStorage.getItem(TIMEBOX_HARD_STORE) || "60", 10);
    const currentTheme = localStorage.getItem("icpc_theme") || "auto";

    // Calculate days remaining to target contest
    let targetCountdownHtml = "";
    if (targetContestDate) {
      const now = new Date();
      const target = new Date(targetContestDate + "T00:00:00");
      const diffDays = Math.ceil((target - new Date(now.toDateString())) / 86400000);
      if (diffDays > 0) {
        targetCountdownHtml = `<span class="st-tag target-countdown">${diffDays} day${diffDays === 1 ? "" : "s"} until Target Contest</span>`;
      } else if (diffDays === 0) {
        targetCountdownHtml = `<span class="st-tag target-countdown is-today">Contest is TODAY! Give it your all!</span>`;
      } else {
        targetCountdownHtml = `<span class="st-tag target-countdown is-past">Contest completed (${-diffDays}d ago)</span>`;
      }
    }

    // Days into sprint
    const sprintDays = Math.floor((new Date(new Date().toDateString()) - new Date(new Date(startDate + "T00:00:00").toDateString())) / 86400000);
    const sprintTagHtml = sprintDays >= 0
      ? `<span class="st-tag">Day ${sprintDays + 1} of Sprint</span>`
      : `<span class="st-tag">Starts in ${-sprintDays} days</span>`;

    // Codeforces badge preview
    let cfBadgeHtml = "";
    if (cfLiveInfo) {
      const rankClass = (cfLiveInfo.rank || "").toLowerCase().replace(/\s+/g, "-");
      cfBadgeHtml = `
        <div class="st-cf-card cf-${esc(rankClass)}">
          <div class="st-cf-avatar">${cfLiveInfo.titlePhoto ? `<img src="${esc(cfLiveInfo.titlePhoto)}" alt="CF avatar">` : '<span>CF</span>'}</div>
          <div class="st-cf-details">
            <span class="st-cf-rank">${esc(cfLiveInfo.rank || "Participant")}</span>
            <span class="st-cf-name">${esc(cfLiveInfo.handle)}</span>
            <span class="st-cf-rating">Rating: <b>${cfLiveInfo.rating || "Unrated"}</b> (Max: ${cfLiveInfo.maxRating || "—"})</span>
          </div>
          <a href="https://codeforces.com/profile/${encodeURIComponent(cfLiveInfo.handle)}" target="_blank" rel="noopener noreferrer" class="st-cf-link">View CF Profile ↗</a>
        </div>`;
    }

    // Routine selector cards
    const routineCardsHtml = Object.keys(routinePresets).map(key => {
      const r = routinePresets[key];
      const isSel = key === currentRoutine;
      const t = r.targets || {};
      const totalHrs = (r.dayLength / 60).toFixed(1).replace(/\.0$/, "");
      return `
        <div class="st-routine-card${isSel ? " is-active" : ""}" data-routine="${esc(key)}">
          <div class="st-routine-card-head">
            <div class="st-routine-radio"><i class="st-dot"></i></div>
            <div class="st-routine-title-wrap">
              <h4>${esc(r.name)}</h4>
              <span class="st-routine-tagline">${esc(r.tagline)}</span>
            </div>
            <span class="st-routine-hours">${esc(totalHrs)}h / day</span>
          </div>
          <p class="st-routine-desc">${esc(r.desc)}</p>
          <div class="st-routine-alloc">
            <span style="--c:var(--accent)" title="Curriculum: ${t.PRACTICE || 0}m"><b>Curriculum:</b> ${Math.round((t.PRACTICE || 0) / 60 * 10) / 10}h</span>
            <span style="--c:#38bdf8" title="Theory: ${t.THEORY || 0}m"><b>Theory:</b> ${Math.round((t.THEORY || 0) / 60 * 10) / 10}h</span>
            <span style="--c:#22c55e" title="Upsolve: ${t.UPSOLVE || 0}m"><b>Upsolve:</b> ${Math.round((t.UPSOLVE || 0) / 60 * 10) / 10}h</span>
            <span style="--c:#f59e0b" title="Revision: ${t.REVISION || 0}m"><b>Revision:</b> ${Math.round((t.REVISION || 0) / 60 * 10) / 10}h</span>
          </div>
        </div>`;
    }).join("");

    // CP platform rows
    const currentPlanWeeks = (window.ICPCPlan ? window.ICPCPlan.getWeeks() : parseInt(localStorage.getItem("icpc_plan_weeks") || "16", 10)) || 16;
    const cpRowsHtml = CP_PLATFORMS.map(plat => {
      const val = (profileData.accounts && profileData.accounts[plat.id]) || "";
      const isSet = !!val.trim();
      return `
        <div class="st-cp-row" data-plat="${esc(plat.id)}">
          <div class="st-cp-label">
            <span class="st-plat-badge" style="background:${plat.color};color:#fff">${esc(plat.badge)}</span>
            <span class="st-plat-name">${esc(plat.name)}</span>
          </div>
          <div class="st-cp-input-wrap">
            <input type="text" class="st-input st-cp-input" id="cp_${plat.id}"
                   placeholder="${esc(plat.placeholder)}" value="${esc(val)}" spellcheck="false" autocomplete="off">
            ${isSet ? `
              <a href="${esc(plat.url(val))}" target="_blank" rel="noopener noreferrer" class="st-icon-btn" title="Open ${esc(plat.name)} profile">
                ↗
              </a>` : ""}
            ${plat.hasLiveCheck && isSet ? `
              <button type="button" class="btn st-live-check-btn" id="checkCfBtn" title="Fetch live rating and rank">
                Verify
              </button>` : ""}
          </div>
        </div>`;
    }).join("");

    host.innerHTML = `
      <div class="st-header">
        <div class="st-avatar-badge">${esc(profileData.avatarBadge || "CP")}</div>
        <div class="st-header-info">
          <h2>${esc(profileData.displayName || "Program Settings")}</h2>
          <p class="st-header-sub">${esc(profileData.bio || "Personalize your training schedule, profile, competitive accounts & preferences.")}</p>
          <div class="st-header-tags">
            <span class="st-tag">${currentPlanWeeks}-Week Target</span>
            <span class="st-tag">${esc(activePreset.name)}</span>
            <span class="st-tag">Day starts: ${esc(dayStartHHMM)}</span>
            ${sprintTagHtml}
            ${targetCountdownHtml}
          </div>
        </div>
      </div>

      <!-- ================= SECTION 1: PROFILE & CP ACCOUNTS ================= -->
      <section class="doc-section st-section">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </span>
            <div>
              <h3>Profile &amp; CP Accounts</h3>
              <p>Configure your handle, avatar monogram, bio, and link your competitive programming platform accounts.</p>
            </div>
          </div>
        </div>

        <form id="profileForm" class="st-form" autocomplete="off">
          <div class="st-grid-2">
            <label class="st-field">Display Name
              <input type="text" class="st-input" id="stDisplayName" placeholder="e.g. Mostafa Kamal" value="${esc(profileData.displayName)}">
            </label>
            <label class="st-field">Username / Handle
              <input type="text" class="st-input" id="stHandle" placeholder="e.g. mostafa" value="${esc(profileData.handle)}">
            </label>
          </div>

          <div class="st-field">
            <label>Avatar Monogram / Badge</label>
            <div class="st-emoji-row">
              <input type="text" class="st-input st-emoji-input" id="stAvatarEmoji" maxlength="4" value="${esc(profileData.avatarBadge || "CP")}">
              <div class="st-emoji-chips">
                ${BADGE_PRESETS.map(e => `<button type="button" class="st-emoji-chip${e === (profileData.avatarBadge || "CP") ? " is-active" : ""}" data-emoji="${esc(e)}">${esc(e)}</button>`).join("")}
              </div>
            </div>
          </div>

          <div class="st-grid-2">
            <label class="st-field">Bio / Target Goal
              <input type="text" class="st-input" id="stBio" placeholder="e.g. ICPC Regional Qualifier · 16-Week Final Sprint" value="${esc(profileData.bio)}">
            </label>
            <label class="st-field">Institution / University / Team
              <input type="text" class="st-input" id="stInstitution" placeholder="e.g. University ICPC Team" value="${esc(profileData.institution)}">
            </label>
          </div>

          <div class="st-grid-2">
            <label class="st-field">Target Rating / Division
              <input type="text" class="st-input" id="stTargetRating" placeholder="e.g. Codeforces Candidate Master / 1900+" value="${esc(profileData.targetRating)}">
            </label>
            <label class="st-field">Primary CP Language
              <select class="st-input" id="stPreferredLang">
                <option value="C++20"${profileData.preferredLang === "C++20" ? " selected" : ""}>C++20 (Standard for ICPC)</option>
                <option value="C++23"${profileData.preferredLang === "C++23" ? " selected" : ""}>C++23</option>
                <option value="Java 21"${profileData.preferredLang === "Java 21" ? " selected" : ""}>Java 21</option>
                <option value="Python 3 / PyPy"${profileData.preferredLang === "Python 3 / PyPy" ? " selected" : ""}>Python 3 / PyPy3</option>
                <option value="Rust"${profileData.preferredLang === "Rust" ? " selected" : ""}>Rust</option>
              </select>
            </label>
          </div>

          <div class="st-subcard">
            <div class="st-subcard-head">
              <h4>Competitive Programming Accounts</h4>
              <p>Save your profile handles across major judge platforms for 1-click access and stats tracking.</p>
            </div>
            ${cfBadgeHtml}
            <div class="st-cp-grid">
              ${cpRowsHtml}
            </div>
          </div>

          <div class="st-actions">
            <button type="submit" class="btn primary" id="saveProfileBtn">Save Profile &amp; Accounts</button>
            <span class="st-save-note" id="profileSaveNote"></span>
          </div>
        </form>
      </section>

      <!-- ================= SECTION 2: MILESTONES & TARGET DATES ================= -->
      <section class="doc-section st-section">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </span>
            <div>
              <h3>Milestones &amp; Target Dates</h3>
              <p>Set when your program sprint started and your upcoming target competition countdown.</p>
            </div>
          </div>
        </div>

        <div class="st-card-grid">
          <!-- Sprint Start Date Card -->
          <div class="st-card">
            <h4>Program Sprint Start Date</h4>
            <p class="st-card-sub">Used to compute your pace (ahead / behind), current week number, and today's phase.</p>
            <div class="st-time-box">
              <input type="date" class="st-input" id="stStartDate" value="${esc(startDate)}">
              <div class="st-presets">
                <button type="button" class="st-chip-btn" id="startTodayBtn">Today</button>
                <button type="button" class="st-chip-btn" id="startThisWeekBtn">Start of this week</button>
              </div>
            </div>
            <p class="st-hint">Syncs with the Today strip and Checklist pace calculation.</p>
          </div>

          <!-- Target Contest Date Card -->
          <div class="st-card">
            <h4>Target Contest Date (ICPC / Regional)</h4>
            <p class="st-card-sub">Set your target competition date to keep your countdown front and center.</p>
            <div class="st-time-box">
              <input type="date" class="st-input" id="stTargetDate" value="${esc(targetContestDate)}">
              ${targetContestDate ? `<button type="button" class="st-linkbtn" id="clearTargetDateBtn">Clear date</button>` : ""}
            </div>
            <p class="st-hint">${targetCountdownHtml || "Enter the date of your upcoming ICPC Regional or on-site round."}</p>
          </div>
        </div>
      </section>

      <!-- ================= SECTION 3: ROUTINE TYPE ================= -->
      <section class="doc-section st-section">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </span>
            <div>
              <h3>Training Strategy &amp; Routine Type</h3>
              <p>Choose your training strategy. The Routine schedule will adapt its study pools, targets, and breaks accordingly.</p>
            </div>
          </div>
        </div>

        <div class="st-routine-grid">
          ${routineCardsHtml}
        </div>

        <div class="st-card" style="margin-top:1.25rem">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap">
            <div>
              <h4>Target Plan Duration</h4>
              <p class="st-card-sub">Select your target duration to complete all 5,089 problems. Maintained exclusively here in Settings.</p>
            </div>
            <span class="st-tag" style="background:var(--accent-soft);color:var(--accent-ink)">Active Target: ${currentPlanWeeks} Weeks</span>
          </div>

          <div class="st-plan-selector" style="margin-top:0.85rem">
            <div class="st-plan-card${currentPlanWeeks === 16 ? " is-active" : ""}" data-plan-select="16">
              <div class="st-plan-card-head">
                <span class="st-plan-badge">16 Weeks (4 Months)</span>
                <span class="st-plan-tag">Intensive Sprint</span>
              </div>
              <h5 style="margin:0.4rem 0 0.2rem;font-size:1.05rem">16-Week Final Sprint</h5>
              <p style="font-size:0.84rem;color:var(--ink-soft);margin-bottom:0.75rem">Aggressive daily pace for imminent contest season (~45 solves/day). 2 weeks for major core blocks.</p>
              <button type="button" class="btn st-plan-btn${currentPlanWeeks === 16 ? " primary" : ""}" data-weeks="16">
                ${currentPlanWeeks === 16 ? "Active Target" : "Select 16-Week Target"}
              </button>
            </div>

            <div class="st-plan-card${currentPlanWeeks === 26 ? " is-active" : ""}" data-plan-select="26">
              <div class="st-plan-card-head">
                <span class="st-plan-badge">26 Weeks (6 Months)</span>
                <span class="st-plan-tag">Mastery Pace</span>
              </div>
              <h5 style="margin:0.4rem 0 0.2rem;font-size:1.05rem">26-Week Extended Preparation</h5>
              <p style="font-size:0.84rem;color:var(--ink-soft);margin-bottom:0.75rem">Semester-long runway with comprehensive deep-dive time (~28 solves/day). 3 weeks for major core blocks.</p>
              <button type="button" class="btn st-plan-btn${currentPlanWeeks === 26 ? " primary" : ""}" data-weeks="26">
                ${currentPlanWeeks === 26 ? "Active Target" : "Select 26-Week Target"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ================= SECTION 4: PASSWORD ================= -->
      <section class="doc-section st-section" id="stSectionPassword">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </span>
            <div>
              <h3>Password</h3>
              <p>Manage your account security and update your login password.</p>
            </div>
          </div>
        </div>

        ${user && !isOffline ? `
          <div class="st-card" style="max-width:44rem">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.85rem">
              <div>
                <h4 style="margin:0">Change Account Password</h4>
                <p class="st-card-sub" style="margin-top:0.2rem">Signed in as <b>${esc(user.email)}</b></p>
              </div>
              <span class="st-tag" style="background:var(--accent-soft);color:var(--accent-ink)">Cloud Account Active</span>
            </div>

            <form class="st-form pf-pass" id="stPassForm" novalidate style="max-width:100%">
              <div class="st-grid-2" style="width:100%">
                <label class="st-field">New password
                  <input type="password" class="st-input" id="stPass" autocomplete="new-password" placeholder="At least 6 characters" required>
                </label>
                <label class="st-field">Repeat it
                  <input type="password" class="st-input" id="stPass2" autocomplete="new-password" placeholder="Same again" required>
                </label>
              </div>
              <div class="st-actions" style="margin-top:0.5rem">
                <button type="submit" class="btn primary" id="stPassBtn">Change password</button>
                <p class="auth-msg" id="stPassMsg" role="alert" style="margin:0"></p>
              </div>
            </form>
          </div>
        ` : `
          <div class="st-card" style="max-width:44rem">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.6rem">
              <div>
                <h4 style="margin:0">Local / Guest Mode</h4>
                <p class="st-card-sub" style="margin-top:0.2rem">Progress is saved locally in this browser.</p>
              </div>
              <span class="st-tag">Local Storage</span>
            </div>
            <p style="font-size:0.85rem;color:var(--ink-soft);line-height:1.5;margin:0.25rem 0 0.85rem">
              You are currently using the tracker in local browser mode without a Supabase cloud account. Your data is stored safely in your browser. To password-protect your progress and sync seamlessly across devices, sign in or register with a Google account.
            </p>
            <div class="st-actions">
              <button type="button" class="btn primary" id="stSignInBtn">Sign In or Create Account</button>
            </div>
          </div>
        `}
      </section>

      <!-- ================= SECTION 5: PREFERENCES ================= -->
      <section class="doc-section st-section" id="stSectionPreferences">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </span>
            <div>
              <h3>Preferences</h3>
              <p>Daily training schedule anchor, appearance theme, audio alerts, daily targets, and problem time caps.</p>
            </div>
          </div>
        </div>

        <div class="st-card-grid">
          <!-- Start of Training Day Card -->
          <div class="st-card">
            <h4>Start of Training Day</h4>
            <p class="st-card-sub">Both Routine schedules are laid out from this time. Contest Day still anchors to the real contest — this sets when the warm-up and curriculum blocks before it begin.</p>
            <div class="st-time-box">
              <input type="time" class="st-input st-time-input day-start-input" id="stDayStart" step="900" value="${esc(dayStartHHMM)}">
              <div class="st-presets">
                <button type="button" class="st-chip-btn" data-time="05:00">05:00 Early Bird</button>
                <button type="button" class="st-chip-btn" data-time="06:00">06:00 Standard</button>
                <button type="button" class="st-chip-btn" data-time="07:00">07:00 Balanced</button>
                <button type="button" class="st-chip-btn" data-time="08:30">08:30 Night Owl</button>
              </div>
            </div>
            <p class="st-hint">Updating this immediately recalculates your daily timetable on the Routine tab.</p>
          </div>

          <!-- Appearance & Theme Card -->
          <div class="st-card">
            <h4>Appearance &amp; Theme</h4>
            <p class="st-card-sub">Select your preferred color scheme across all views.</p>
            <div class="btn-row" style="margin-top:0.75rem">
              <button type="button" class="btn st-theme-opt${currentTheme === "auto" ? " primary" : ""}" data-theme="auto"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path></svg>System</button>
              <button type="button" class="btn st-theme-opt${currentTheme === "light" ? " primary" : ""}" data-theme="light"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>Light</button>
              <button type="button" class="btn st-theme-opt${currentTheme === "dark" ? " primary" : ""}" data-theme="dark"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>Dark</button>
            </div>
          </div>

          <!-- Daily Problem Goal -->
          <div class="st-card">
            <h4>Daily Problem Goal</h4>
            <p class="st-card-sub">Keep yourself accountable with a daily problem solve target.</p>
            <div class="btn-row" style="margin-top:0.75rem">
              ${[3, 5, 8, 10].map(n => `
                <button type="button" class="btn st-goal-btn${dailyTarget === n ? " primary" : ""}" data-goal="${n}">${n} problems / day</button>
              `).join("")}
            </div>
          </div>

          <!-- Timer & Sound Alerts -->
          <div class="st-card">
            <h4>Timer &amp; Sound Alerts</h4>
            <p class="st-card-sub">Chime on problem timer completion and landmark events.</p>
            <div style="display:flex;align-items:center;gap:1rem;margin-top:0.75rem">
              <label class="chk-label" style="font-weight:600">
                <input type="checkbox" id="stSoundToggle"${soundEnabled ? " checked" : ""}> Enable audio alerts
              </label>
              <button type="button" class="btn" id="stTestSoundBtn" title="Test the completion chime"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>Test Sound</button>
            </div>
          </div>

          <!-- Time-Box Caps Card -->
          <div class="st-card">
            <h4>Time-Box Problem Caps</h4>
            <p class="st-card-sub">Ground rule limits during training: cap individual problem time before checking hints.</p>
            <div class="st-grid-2" style="margin-top:0.5rem">
              <label class="st-field">Soft hint cap (minutes)
                <input type="number" class="st-input" id="stSoftCap" min="15" max="120" step="5" value="${softCap}">
              </label>
              <label class="st-field">Hard cap / Editorial (minutes)
                <input type="number" class="st-input" id="stHardCap" min="30" max="180" step="5" value="${hardCap}">
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- ================= SECTION 6: YOUR DATA ================= -->
      <section class="doc-section st-section" id="stSectionYourData">
        <div class="st-section-head">
          <div class="st-section-title">
            <span class="st-section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </span>
            <div>
              <h3>Your data</h3>
              <p>Progress is stored against your account, so signing in on another device brings it with you. Export or import your progress, full backups, or reset your data.</p>
            </div>
          </div>
        </div>

        <div class="st-card-grid">
          <!-- Checklist Progress Export / Import -->
          <div class="st-card">
            <h4>Progress Data (Checklist &amp; Solves)</h4>
            <p class="st-card-sub">Export or import your solved problems and checklist history. These export and import the same JSON format the Checklist uses.</p>
            <div class="btn-row" style="margin-top:0.75rem">
              <button type="button" class="btn primary" id="stExportProgressBtn">Export Progress (.json)</button>
              <button type="button" class="btn" id="stImportProgressBtn">Import Progress</button>
              <input type="file" id="stProgressFileInput" accept="application/json" style="display:none">
            </div>
            <p class="st-hint">Generates <code>icpc-progress-YYYY-MM-DD.json</code> containing all solved problem IDs.</p>
          </div>

          <!-- All-in-One Backup -->
          <div class="st-card">
            <h4>All-in-One Full Backup &amp; Sync</h4>
            <p class="st-card-sub">Export everything (solved checklist, flagged questions, templates, profile &amp; settings) into one JSON file.</p>
            <div class="btn-row" style="margin-top:0.75rem">
              <button type="button" class="btn primary" id="stExportAllBtn">Export Full Backup (.json)</button>
              <button type="button" class="btn" id="stImportAllBtn">Import Backup</button>
              <input type="file" id="stImportFileInput" accept="application/json" style="display:none">
            </div>
            <p class="st-hint">Complete snapshot across all tabs, custom notes, and settings.</p>
          </div>

          <!-- Danger Zone: Reset All Progress -->
          <div class="st-card st-danger-card" style="border-color:color-mix(in srgb, var(--bad,#ef4444) 35%, var(--line));">
            <h4 style="color:var(--bad,#ef4444)">Reset All Progress</h4>
            <p class="st-card-sub">Reset all solved problem history, daily solve dates, and flagged revision lists. This action is irreversible unless you exported a backup first.</p>
            <div class="btn-row" style="margin-top:0.75rem">
              <button type="button" class="btn danger" id="stResetAllBtn">Reset All Progress</button>
            </div>
          </div>
        </div>
      </section>
    `;

    attachEvents();
  }

  // ------------------------------------------------------------- event wiring --
  function attachEvents() {
    const host = document.getElementById("settingsBody");
    if (!host) return;

    // 1. Profile save
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
      profileForm.addEventListener("submit", e => {
        e.preventDefault();
        const current = readProfile();
        current.displayName = (document.getElementById("stDisplayName").value || "").trim();
        current.handle = (document.getElementById("stHandle").value || "").trim();
        const rawBadge = (document.getElementById("stAvatarEmoji").value || "CP").trim().toUpperCase();
        current.avatarBadge = rawBadge.replace(/[\uD800-\uDFFF\u2600-\u27BF]/g, "").slice(0, 4) || "CP";
        current.avatarEmoji = current.avatarBadge;
        current.bio = (document.getElementById("stBio").value || "").trim();
        current.institution = (document.getElementById("stInstitution").value || "").trim();
        current.targetRating = (document.getElementById("stTargetRating").value || "").trim();
        current.preferredLang = document.getElementById("stPreferredLang").value;

        current.accounts = current.accounts || {};
        CP_PLATFORMS.forEach(p => {
          const inp = document.getElementById(`cp_${p.id}`);
          if (inp) current.accounts[p.id] = inp.value.trim();
        });

        saveProfile(current);
        showToast("Profile & CP accounts saved successfully!");
        const note = document.getElementById("profileSaveNote");
        if (note) {
          note.textContent = "Saved.";
          setTimeout(() => { if (note) note.textContent = ""; }, 2500);
        }
        render();
      });
    }

    // Emoji chip clicks
    host.querySelectorAll(".st-emoji-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const emoji = chip.dataset.emoji;
        const input = document.getElementById("stAvatarEmoji");
        if (input) input.value = emoji;
        host.querySelectorAll(".st-emoji-chip").forEach(c => c.classList.toggle("is-active", c === chip));
      });
    });

    // Check Codeforces live button
    const checkCfBtn = document.getElementById("checkCfBtn");
    if (checkCfBtn) {
      checkCfBtn.addEventListener("click", async () => {
        const inp = document.getElementById("cp_codeforces");
        const handle = inp ? inp.value.trim() : "";
        if (!handle) {
          showToast("Please enter a Codeforces handle first.", true);
          return;
        }
        checkCfBtn.disabled = true;
        checkCfBtn.textContent = "Checking…";
        const info = await fetchCodeforcesInfo(handle);
        checkCfBtn.disabled = false;
        checkCfBtn.textContent = "Verify";
        if (info) {
          cfLiveInfo = info;
          showToast(`Verified Codeforces handle: ${info.handle} (${info.rating || "Unrated"})!`);
          render();
        } else {
          showToast(`Codeforces user "${handle}" not found.`, true);
        }
      });
    }

    // 2. Day start presets and input
    host.querySelectorAll(".st-chip-btn[data-time]").forEach(btn => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.time;
        const m = /^(\d{1,2}):(\d{2})$/.exec(t);
        if (m && window.ICPCRoutine) {
          const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          window.ICPCRoutine.setDayStart(mins);
          const inp = document.getElementById("stDayStart");
          if (inp) inp.value = t;
          showToast(`Start of training day set to ${t}`);
        }
      });
    });

    const dayStartInp = document.getElementById("stDayStart");
    if (dayStartInp) {
      dayStartInp.addEventListener("change", () => {
        const t = dayStartInp.value;
        const m = /^(\d{1,2}):(\d{2})$/.exec(t);
        if (m && window.ICPCRoutine) {
          const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          window.ICPCRoutine.setDayStart(mins);
          showToast(`Start of training day set to ${t}`);
        }
      });
    }

    // 3. Sprint Start Date
    const startInp = document.getElementById("stStartDate");
    if (startInp) {
      startInp.addEventListener("change", () => {
        localStorage.setItem("icpc_start_date", startInp.value);
        const sync = window.ICPCSettings && window.ICPCSettings.onChange;
        if (typeof sync === "function") sync({ start_date: startInp.value });
        showToast("Sprint start date updated!");
        render();
        document.dispatchEvent(new CustomEvent("icpc:start_date_updated", { detail: startInp.value }));
      });
    }

    const startTodayBtn = document.getElementById("startTodayBtn");
    if (startTodayBtn) {
      startTodayBtn.addEventListener("click", () => {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem("icpc_start_date", today);
        if (startInp) startInp.value = today;
        const sync = window.ICPCSettings && window.ICPCSettings.onChange;
        if (typeof sync === "function") sync({ start_date: today });
        showToast("Sprint start date set to Today!");
        render();
        document.dispatchEvent(new CustomEvent("icpc:start_date_updated", { detail: today }));
      });
    }

    const startThisWeekBtn = document.getElementById("startThisWeekBtn");
    if (startThisWeekBtn) {
      startThisWeekBtn.addEventListener("click", () => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(d.setDate(diff)).toISOString().slice(0, 10);
        localStorage.setItem("icpc_start_date", monday);
        if (startInp) startInp.value = monday;
        const sync = window.ICPCSettings && window.ICPCSettings.onChange;
        if (typeof sync === "function") sync({ start_date: monday });
        showToast("Sprint start date set to Monday of this week!");
        render();
        document.dispatchEvent(new CustomEvent("icpc:start_date_updated", { detail: monday }));
      });
    }

    // 4. Target Contest Date
    const targetInp = document.getElementById("stTargetDate");
    if (targetInp) {
      targetInp.addEventListener("change", () => {
        localStorage.setItem(TARGET_DATE_STORE, targetInp.value);
        const sync = window.ICPCSettings && window.ICPCSettings.onChange;
        if (typeof sync === "function") sync({ target_contest_date: targetInp.value });
        showToast("Target contest date set!");
        render();
      });
    }
    const clearTargetBtn = document.getElementById("clearTargetDateBtn");
    if (clearTargetBtn) {
      clearTargetBtn.addEventListener("click", () => {
        localStorage.removeItem(TARGET_DATE_STORE);
        showToast("Target contest date cleared.");
        render();
      });
    }

    // 5. Time-box Caps
    const softInp = document.getElementById("stSoftCap");
    if (softInp) {
      softInp.addEventListener("change", () => {
        const val = Math.max(10, parseInt(softInp.value, 10) || 45);
        localStorage.setItem(TIMEBOX_SOFT_STORE, String(val));
        showToast(`Soft hint cap set to ${val} minutes.`);
      });
    }
    const hardInp = document.getElementById("stHardCap");
    if (hardInp) {
      hardInp.addEventListener("change", () => {
        const val = Math.max(20, parseInt(hardInp.value, 10) || 60);
        localStorage.setItem(TIMEBOX_HARD_STORE, String(val));
        showToast(`Hard editorial cap set to ${val} minutes.`);
      });
    }

    // 6. Routine Selector
    host.querySelectorAll(".st-routine-card").forEach(card => {
      card.addEventListener("click", () => {
        const type = card.dataset.routine;
        if (window.ICPCRoutine) {
          window.ICPCRoutine.setRoutineType(type);
          showToast(`Routine type changed to "${window.ICPCRoutine.currentPreset().name}"`);
          render();
        }
      });
    });

    // 7. Plan Length (16 vs 26) - Maintained exclusively in Settings
    const handlePlanSelect = (weeks) => {
      if (window.ICPCPlan) {
        window.ICPCPlan.setWeeks(weeks);
      } else {
        localStorage.setItem("icpc_plan_weeks", String(weeks));
        document.dispatchEvent(new CustomEvent("icpc:settings", { detail: { plan_weeks: weeks } }));
      }
      showToast(`Target program pace set to ${weeks}-Week version!`);
      render();
    };

    host.querySelectorAll(".st-plan-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const weeks = parseInt(btn.dataset.weeks, 10);
        handlePlanSelect(weeks);
      });
    });
    host.querySelectorAll("[data-plan-select]").forEach(card => {
      card.addEventListener("click", () => {
        const weeks = parseInt(card.dataset.planSelect, 10);
        handlePlanSelect(weeks);
      });
    });

    // 8. Theme Switcher
    host.querySelectorAll(".st-theme-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        localStorage.setItem("icpc_theme", theme);
        if (theme === "auto") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", theme);
        // update topbar theme button if present
        const topBtn = document.querySelector(".theme-btn");
        if (topBtn && window.__THEME_ICONS) {
          topBtn.innerHTML = window.__THEME_ICONS[theme] || "";
        }
        showToast(`Theme set to ${theme}.`);
        render();
      });
    });

    // 9. Daily Goal
    host.querySelectorAll(".st-goal-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const goal = parseInt(btn.dataset.goal, 10);
        localStorage.setItem(DAILY_GOAL_STORE, String(goal));
        showToast(`Daily target updated to ${goal} problems!`);
        render();
      });
    });

    // 10. Sound alerts
    const soundToggle = document.getElementById("stSoundToggle");
    if (soundToggle) {
      soundToggle.addEventListener("change", () => {
        localStorage.setItem(SOUND_STORE, String(soundToggle.checked));
        showToast(soundToggle.checked ? "Audio alerts enabled." : "Audio alerts muted.");
      });
    }
    const testSoundBtn = document.getElementById("stTestSoundBtn");
    if (testSoundBtn) {
      testSoundBtn.addEventListener("click", () => {
        playNotificationChime();
        showToast("Playing notification chime");
      });
    }

    // 11. Full All-in-One Export
    const exportBtn = document.getElementById("stExportAllBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const progress = window.ICPCProgress ? window.ICPCProgress.snapshot() : [];
        const flags = window.ICPCProgress ? window.ICPCProgress.flagSnapshot() : [];
        const templates = window.ICPCTemplates ? window.ICPCTemplates.snapshot() : [];
        const profile = readProfile();
        const settingsPayload = {
          day_start_min: window.ICPCRoutine ? window.ICPCRoutine.dayStart() : 360,
          routine_type: window.ICPCRoutine ? window.ICPCRoutine.routineType() : "intense",
          start_date: localStorage.getItem("icpc_start_date") || null,
          target_contest_date: localStorage.getItem(TARGET_DATE_STORE) || null,
          daily_target: parseInt(localStorage.getItem(DAILY_GOAL_STORE) || "5", 10),
          plan_weeks: parseInt(localStorage.getItem("icpc_plan_weeks") || "16", 10),
          theme: localStorage.getItem("icpc_theme") || "auto",
          sound_enabled: localStorage.getItem(SOUND_STORE) !== "false",
          timebox_soft: parseInt(localStorage.getItem(TIMEBOX_SOFT_STORE) || "45", 10),
          timebox_hard: parseInt(localStorage.getItem(TIMEBOX_HARD_STORE) || "60", 10)
        };

        const bundle = {
          version: 2,
          app: "ICPC Preparation Tracker",
          exportedAt: new Date().toISOString(),
          solved: progress,
          flagged: flags,
          templates: templates,
          profile: profile,
          settings: settingsPayload
        };

        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `icpc-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast("Full backup downloaded!");
      });
    }

    // 12. Full All-in-One Import
    const importBtn = document.getElementById("stImportAllBtn");
    const importInput = document.getElementById("stImportFileInput");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const data = JSON.parse(ev.target.result);
            if (data.solved && window.ICPCProgress) {
              window.ICPCProgress.replaceAll(data.solved, data.flagged || []);
            }
            if (data.templates && window.ICPCTemplates) {
              window.ICPCTemplates.replaceAll(data.templates);
            }
            if (data.profile) {
              saveProfile(data.profile, { silent: true });
            }
            if (data.settings) {
              const s = data.settings;
              if (s.start_date) localStorage.setItem("icpc_start_date", s.start_date);
              if (s.target_contest_date) localStorage.setItem(TARGET_DATE_STORE, s.target_contest_date);
              if (s.day_start_min != null && window.ICPCRoutine) window.ICPCRoutine.setDayStart(s.day_start_min);
              if (s.routine_type && window.ICPCRoutine) window.ICPCRoutine.setRoutineType(s.routine_type);
              if (s.theme) {
                localStorage.setItem("icpc_theme", s.theme);
                if (s.theme === "auto") document.documentElement.removeAttribute("data-theme");
                else document.documentElement.setAttribute("data-theme", s.theme);
              }
              if (s.daily_target) localStorage.setItem(DAILY_GOAL_STORE, String(s.daily_target));
              if (s.sound_enabled != null) localStorage.setItem(SOUND_STORE, String(s.sound_enabled));
            }
            showToast("Backup restored successfully!");
            render();
            if (window.ICPCAccount && window.ICPCAccount.refreshProfile) {
              window.ICPCAccount.refreshProfile();
            }
          } catch (err) {
            showToast("Failed to restore backup: invalid JSON.", true);
          }
        };
        reader.readAsText(file);
      });
    }

    // 13. Password Change & Auth Gate
    const passForm = document.getElementById("stPassForm");
    if (passForm) {
      if (window.ICPCAccount && typeof window.ICPCAccount.addPasswordToggles === "function") {
        window.ICPCAccount.addPasswordToggles(passForm);
      }
      passForm.addEventListener("submit", async e => {
        e.preventDefault();
        const a = (document.getElementById("stPass").value || "").trim();
        const b = (document.getElementById("stPass2").value || "").trim();
        const m = document.getElementById("stPassMsg");
        const btn = document.getElementById("stPassBtn");
        m.className = "auth-msg";
        if (a.length < 6) {
          m.className = "auth-msg err";
          m.textContent = "At least 6 characters.";
          return;
        }
        if (a !== b) {
          m.className = "auth-msg err";
          m.textContent = "Those two don't match.";
          return;
        }
        btn.disabled = true;
        btn.textContent = "Saving…";
        try {
          if (window.ICPCAccount && typeof window.ICPCAccount.changePassword === "function") {
            await window.ICPCAccount.changePassword(a);
          } else {
            throw new Error("Password change is only available when signed in.");
          }
          m.className = "auth-msg ok";
          m.textContent = "Password changed successfully.";
          document.getElementById("stPass").value = "";
          document.getElementById("stPass2").value = "";
          showToast("Password updated successfully!");
        } catch (err) {
          m.className = "auth-msg err";
          m.textContent = (err && err.message) || "Could not update password.";
        }
        btn.disabled = false;
        btn.textContent = "Change password";
      });
    }

    const signInBtn = document.getElementById("stSignInBtn");
    if (signInBtn) {
      signInBtn.addEventListener("click", () => {
        if (window.ICPCAccount && typeof window.ICPCAccount.openAuthModal === "function") {
          window.ICPCAccount.openAuthModal();
        }
      });
    }

    // 14. Progress Data (Checklist) Export
    const exportProgBtn = document.getElementById("stExportProgressBtn");
    if (exportProgBtn) {
      exportProgBtn.addEventListener("click", () => {
        const solved = window.ICPCProgress ? window.ICPCProgress.snapshot() : [];
        const flags = window.ICPCProgress ? window.ICPCProgress.flagSnapshot() : [];
        const payload = {
          exportedAt: new Date().toISOString(),
          solved: solved,
          flagged: flags,
          startDate: localStorage.getItem("icpc_start_date") || null
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `icpc-progress-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast("Progress exported (.json)!");
      });
    }

    // 15. Progress Data (Checklist) Import
    const importProgBtn = document.getElementById("stImportProgressBtn");
    const importProgFile = document.getElementById("stProgressFileInput");
    if (importProgBtn && importProgFile) {
      importProgBtn.addEventListener("click", () => importProgFile.click());
      importProgFile.addEventListener("change", e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const payload = JSON.parse(ev.target.result);
            if (Array.isArray(payload.solved) && window.ICPCProgress) {
              window.ICPCProgress.replaceAll(payload.solved, payload.flagged || []);
              if (payload.startDate) {
                localStorage.setItem("icpc_start_date", payload.startDate);
              }
              showToast(`Imported ${payload.solved.length} solved problems!`);
              render();
            } else {
              showToast("Invalid progress file: 'solved' list missing.", true);
            }
          } catch (err) {
            showToast("Failed to parse progress file: invalid JSON.", true);
          }
          e.target.value = "";
        };
        reader.readAsText(file);
      });
    }

    // 16. Reset All Progress (Exclusively in Settings)
    const resetAllBtn = document.getElementById("stResetAllBtn");
    if (resetAllBtn) {
      let armed = false, timer = null;
      resetAllBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          resetAllBtn.textContent = "Click again to confirm reset";
          timer = setTimeout(() => {
            armed = false;
            resetAllBtn.textContent = "Reset All Progress";
          }, 3500);
        } else {
          clearTimeout(timer);
          armed = false;
          resetAllBtn.textContent = "Reset All Progress";
          if (window.ICPCProgress && window.ICPCProgress.resetAll) {
            window.ICPCProgress.resetAll();
          }
          showToast("All progress and flags have been reset.");
        }
      });
    }
  }

  // ------------------------------------------------------------------ API --
  window.ICPCSettingsManager = {
    render,
    readProfile,
    saveProfile,
    playChime: playNotificationChime,
    cpPlatforms: () => CP_PLATFORMS.slice(),
  };

  // Re-render when switching to the settings tab
  document.addEventListener("icpc:tab", e => {
    if (e.detail === "settings") render();
  });

  // Also initial load or settings updates
  document.addEventListener("icpc:settings", () => render());

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
