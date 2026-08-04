/*
 * Accounts + progress sync (Supabase).
 *
 * Replaces the old shared-password gate. Each person signs in with their own
 * email + password. Their solved problems (problem_progress), notebook
 * templates (templates) and preferences (user_settings) all hang off user_id,
 * so everything follows them across devices.
 *
 * localStorage is kept as an offline mirror only. On sign-in the server's rows
 * win; on sign-out the mirror is cleared so the next person doesn't inherit it.
 *
 * If supabase-config.js is left blank the app runs in offline mode: the tracker
 * works and progress is saved in this browser, but there are no accounts.
 */
(function () {
  "use strict";

  const root = document.documentElement;
  root.classList.add("locked");

  const T_PROGRESS = "problem_progress";
  const T_TEMPLATES = "templates";
  const T_SETTINGS = "user_settings";
  let sb = null;            // supabase client
  let user = null;          // current auth user
  let profile = null;       // row from public.profiles
  let lastSynced = new Set();
  let syncTimer = null;
  let tplTimer = null;
  let settings = null;
  let offline = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------- gate UI --
  function buildGate() {
    if (document.getElementById("authScreen") || !document.body) return;
    const el = document.createElement("div");
    el.id = "authScreen";
    el.innerHTML =
      '<form class="auth-card" id="authForm" autocomplete="on">' +
        '<span class="lock-mark">🏁</span>' +
        '<h1>ICPC · 16-Week Plan</h1>' +
        '<p class="auth-sub" id="authSub">Sign in to load your progress.</p>' +
        '<div class="auth-tabs">' +
          '<button type="button" class="auth-tab active" data-mode="signin">Sign in</button>' +
          '<button type="button" class="auth-tab" data-mode="signup">Create account</button>' +
        "</div>" +
        '<label class="auth-field auth-name" hidden>Display name' +
          '<input type="text" id="authName" autocomplete="nickname" placeholder="Mostafa"></label>' +
        '<label class="auth-field">Email' +
          '<input type="email" id="authEmail" autocomplete="email" required placeholder="you@example.com"></label>' +
        '<label class="auth-field">Password' +
          '<input type="password" id="authPass" autocomplete="current-password" required placeholder="At least 6 characters"></label>' +
        '<p class="auth-msg" id="authMsg" role="alert"></p>' +
        '<button type="submit" class="btn primary" id="authBtn">Sign in</button>' +
        '<button type="button" class="lock-link" id="authForgot">Forgot password?</button>' +
      "</form>";
    document.body.appendChild(el);

    const form = document.getElementById("authForm");
    const msg = document.getElementById("authMsg");
    const btn = document.getElementById("authBtn");
    const nameField = el.querySelector(".auth-name");
    const passInput = document.getElementById("authPass");
    let mode = "signin";

    if (offline) {
      document.getElementById("authSub").textContent =
        "Supabase isn't configured yet, so accounts are unavailable.";
      msg.className = "auth-msg warn";
      msg.textContent = "Add your Project URL and anon key to supabase-config.js to enable sign-in. " +
        "Continuing without an account keeps progress in this browser only.";
      btn.textContent = "Continue offline";
      form.querySelector(".auth-tabs").hidden = true;
      el.querySelectorAll(".auth-field").forEach(f => (f.hidden = true));
      document.getElementById("authForgot").hidden = true;
      // Hidden inputs still block submit while they are `required`.
      form.noValidate = true;
      el.querySelectorAll("input").forEach(i => i.removeAttribute("required"));
      form.addEventListener("submit", e => { e.preventDefault(); openApp(); });
      return;
    }

    el.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        mode = tab.dataset.mode;
        el.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t === tab));
        nameField.hidden = mode !== "signup";
        btn.textContent = mode === "signup" ? "Create account" : "Sign in";
        passInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
        msg.textContent = "";
        msg.className = "auth-msg";
      });
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const email = document.getElementById("authEmail").value.trim();
      const password = passInput.value;
      const name = document.getElementById("authName").value.trim();
      if (!email || !password) return;

      btn.disabled = true;
      btn.textContent = mode === "signup" ? "Creating…" : "Signing in…";
      msg.className = "auth-msg";
      msg.textContent = "";
      try {
        if (mode === "signup") {
          const { data, error } = await sb.auth.signUp({
            email, password, options: { data: { display_name: name || email.split("@")[0] } },
          });
          if (error) throw error;
          if (!data.session) {
            msg.className = "auth-msg ok";
            msg.textContent = "Account created. Check " + email + " for the confirmation link, then sign in.";
            btn.disabled = false;
            btn.textContent = "Create account";
            return;
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
        // onAuthStateChange drives the rest.
      } catch (err) {
        msg.className = "auth-msg err";
        msg.textContent = friendly(err);
        btn.disabled = false;
        btn.textContent = mode === "signup" ? "Create account" : "Sign in";
      }
    });

    document.getElementById("authForgot").addEventListener("click", async () => {
      const email = document.getElementById("authEmail").value.trim();
      if (!email) {
        msg.className = "auth-msg warn";
        msg.textContent = "Type your email above first, then hit this again.";
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
      msg.className = error ? "auth-msg err" : "auth-msg ok";
      msg.textContent = error ? friendly(error) : "Password reset link sent to " + email + ".";
    });

    // A message queued by closeApp() (e.g. "Signed out.") shows on the fresh gate.
    {
      const m = buildGate.pendingMessage;
      if (m) { msg.className = "auth-msg " + m.kind; msg.textContent = m.text; buildGate.pendingMessage = null; }
    }
  }

  function friendly(err) {
    const m = (err && err.message) || String(err);
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Confirm your email first — check your inbox for the link.";
    if (/already registered/i.test(m)) return "That email already has an account. Switch to Sign in.";
    if (/password should be at least/i.test(m)) return "Password must be at least 6 characters.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a minute and try again.";
    if (/failed to fetch|networkerror/i.test(m)) return "Can't reach Supabase — check your connection or the Project URL.";
    return m;
  }

  function removeGate() {
    const el = document.getElementById("authScreen");
    if (el) el.remove();
  }

  function openApp() {
    root.classList.remove("locked");
    removeGate();
    renderAccountBar();
    renderProfile();
  }

  function closeApp(message) {
    root.classList.add("locked");
    if (message) buildGate.pendingMessage = message;
    buildGate();
  }

  // ------------------------------------------------------------ progress IO --
  async function pullProgress() {
    if (!sb || !user) return;
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(T_PROGRESS).select("problem_id")
        .eq("user_id", user.id)
        .eq("status", "solved")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data.map(r => r.problem_id));
      if (data.length < PAGE) break;
    }
    lastSynced = new Set(rows);
    window.ICPCProgress.replaceAll(rows);
  }

  // Diff against the last synced snapshot so a toggle costs one small request.
  async function pushProgress(ids) {
    if (!sb || !user) return;
    const now = new Set(ids);
    const added = [...now].filter(id => !lastSynced.has(id));
    const removed = [...lastSynced].filter(id => !now.has(id));
    if (!added.length && !removed.length) return;

    setSyncState("saving");
    try {
      if (added.length) {
        for (let i = 0; i < added.length; i += 500) {
          const chunk = added.slice(i, i + 500)
            .map(problem_id => ({ user_id: user.id, problem_id, status: "solved" }));
          const { error } = await sb.from(T_PROGRESS).upsert(chunk, { onConflict: "user_id,problem_id" });
          if (error) throw error;
        }
      }
      if (removed.length) {
        for (let i = 0; i < removed.length; i += 500) {
          const chunk = removed.slice(i, i + 500);
          const { error } = await sb.from(T_PROGRESS).delete()
            .eq("user_id", user.id).in("problem_id", chunk);
          if (error) throw error;
        }
      }
      lastSynced = now;
      setSyncState("saved");
      renderProfile();
    } catch (err) {
      setSyncState("error", friendly(err));
    }
  }

  // ------------------------------------------------- templates + settings --
  // Templates are small in number, so the whole set is replaced on save rather
  // than diffed; that keeps ordering and deletes trivially correct.
  async function pullTemplates() {
    if (!sb || !user) return;
    const { data, error } = await sb.from(T_TEMPLATES)
      .select("*").eq("user_id", user.id)
      .order("category").order("position");
    if (error) throw error;
    const mapped = (data || []).map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      description: r.description || "",
      timeComplexity: r.time_complexity || "",
      spaceComplexity: r.space_complexity || "",
      code: r.code || "",
      createdAt: r.created_at,
    }));
    if (window.ICPCTemplates) window.ICPCTemplates.replaceAll(mapped);
  }

  async function pushTemplates(list) {
    if (!sb || !user) return;
    setSyncState("saving");
    try {
      const rows = list.map((t, i) => ({
        id: /^[0-9a-f-]{36}$/i.test(t.id || "") ? t.id : undefined,
        user_id: user.id,
        title: t.title,
        category: t.category || "Misc",
        description: t.description || "",
        time_complexity: t.timeComplexity || "",
        space_complexity: t.spaceComplexity || "",
        code: t.code || "",
        position: i,
      }));
      const keep = rows.filter(r => r.id).map(r => r.id);
      let del = sb.from(T_TEMPLATES).delete().eq("user_id", user.id);
      if (keep.length) del = del.not("id", "in", "(" + keep.join(",") + ")");
      const { error: delErr } = await del;
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await sb.from(T_TEMPLATES).upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
      setSyncState("saved");
    } catch (err) {
      setSyncState("error", friendly(err));
    }
  }

  async function pullSettings() {
    if (!sb || !user) return;
    const { data } = await sb.from(T_SETTINGS).select("*").eq("user_id", user.id).single();
    if (!data) return;
    settings = data;
    if (window.ICPCSettings) window.ICPCSettings.apply(data);
  }

  async function pushSettings(patch) {
    if (!sb || !user) return;
    try {
      const { error } = await sb.from(T_SETTINGS)
        .upsert(Object.assign({ user_id: user.id }, patch), { onConflict: "user_id" });
      if (error) throw error;
      settings = Object.assign(settings || {}, patch);
    } catch (err) {
      setSyncState("error", friendly(err));
    }
  }

  function scheduleSync(ids) {
    clearTimeout(syncTimer);
    setSyncState("pending");
    syncTimer = setTimeout(() => pushProgress(ids), 700);
  }

  function setSyncState(state, detail) {
    const el = document.getElementById("syncState");
    if (!el) return;
    const label = { pending: "Saving…", saving: "Saving…", saved: "Saved", error: "Not saved" };
    el.textContent = label[state] || "";
    el.className = "sync-state " + state;
    el.title = detail || "";
  }

  // --------------------------------------------------------- header account --
  function renderAccountBar() {
    const host = document.getElementById("accountBar");
    if (!host) return;
    if (offline || !user) {
      host.innerHTML = '<span class="acct-offline" title="Progress is saved in this browser only">Offline mode</span>';
      return;
    }
    const name = (profile && (profile.display_name || profile.handle)) || user.email.split("@")[0];
    host.innerHTML =
      '<span class="sync-state" id="syncState"></span>' +
      '<button class="acct-btn" id="acctBtn" type="button" title="' + esc(user.email) + '">' +
        '<span class="acct-avatar">' + esc(name.slice(0, 1).toUpperCase()) + "</span>" +
        '<span class="acct-name">' + esc(name) + "</span>" +
      "</button>";
    document.getElementById("acctBtn").addEventListener("click", () => {
      document.querySelector('.tab[data-tab="profile"]').click();
    });
  }

  // -------------------------------------------------------------- profile --
  function renderProfile() {
    const host = document.getElementById("profileBody");
    if (!host || !window.ICPCProgress) return;

    const done = window.ICPCProgress.snapshot().length;
    const total = window.ICPCProgress.total();
    const pct = total ? (100 * done / total) : 0;
    const bd = window.ICPCProgress.breakdown();

    const who = offline || !user
      ? { name: "Offline", email: "No account — progress is saved in this browser only", since: null }
      : {
          name: (profile && (profile.display_name || profile.handle)) || user.email.split("@")[0],
          email: user.email,
          since: (profile && profile.created_at) || user.created_at,
        };

    const rows = list => list.map(x => {
      const p = x.total ? (100 * x.done / x.total) : 0;
      return '<div class="pf-row">' +
        '<span class="pf-row-name">' + esc(x.name) + (x.weeks ? ' <span class="pf-weeks">' + esc(x.weeks) + "</span>" : "") + "</span>" +
        '<span class="pf-row-count mono">' + x.done + " / " + x.total + "</span>" +
        '<span class="bar"><i style="width:' + p.toFixed(1) + '%"></i></span>' +
        '<span class="pf-row-pct mono">' + p.toFixed(0) + "%</span>" +
      "</div>";
    }).join("");

    host.innerHTML =
      '<div class="pf-head">' +
        '<span class="pf-avatar">' + esc(who.name.slice(0, 1).toUpperCase()) + "</span>" +
        '<div class="pf-id">' +
          "<h2>" + esc(who.name) + "</h2>" +
          '<p class="pf-email">' + esc(who.email) + "</p>" +
          (who.since ? '<p class="pf-since">Member since ' +
            esc(new Date(who.since).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })) +
            "</p>" : "") +
        "</div>" +
        (offline || !user ? "" : '<button class="btn danger" id="signOutBtn" type="button">Sign out</button>') +
      "</div>" +

      '<div class="stat-row">' +
        '<div class="stat"><span class="num">' + done.toLocaleString() + '</span><span class="label">Solved</span></div>' +
        '<div class="stat"><span class="num">' + (total - done).toLocaleString() + '</span><span class="label">Remaining</span></div>' +
        '<div class="stat"><span class="num">' + pct.toFixed(1) + '%</span><span class="label">Complete</span></div>' +
        '<div class="stat"><span class="num">' + bd.phases.filter(p => p.done === p.total && p.total).length +
          '</span><span class="label">Blocks finished</span></div>' +
      "</div>" +

      '<section class="doc-section"><h2>By training block</h2><div class="pf-list">' + rows(bd.phases) + "</div></section>" +
      '<section class="doc-section"><h2>By source file</h2><div class="pf-list">' + rows(bd.files) + "</div></section>" +

      '<section class="doc-section"><h2>Your data</h2>' +
        '<p>Progress is stored against your account, so signing in on another device brings it with you. ' +
        'These export and import the same JSON the Checklist tab uses.</p>' +
        '<div class="btn-row" style="margin-left:0">' +
          '<button class="btn" id="pfExport" type="button">Export progress</button>' +
          '<button class="btn" id="pfImport" type="button">Import progress</button>' +
        "</div>" +
      "</section>";

    const out = document.getElementById("signOutBtn");
    if (out) out.addEventListener("click", signOut);
    document.getElementById("pfExport").addEventListener("click", () => document.getElementById("exportBtn").click());
    document.getElementById("pfImport").addEventListener("click", () => document.getElementById("importBtn").click());
  }

  async function signOut() {
    clearTimeout(syncTimer);
    if (syncTimer) await pushProgress(window.ICPCProgress.snapshot());
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    user = null; profile = null; lastSynced = new Set();
    window.ICPCProgress.clearLocal();
    closeApp({ kind: "ok", text: "Signed out." });
  }

  // ------------------------------------------------------------------ boot --
  async function afterSignIn(session) {
    user = session.user;
    try {
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
      profile = data || null;
    } catch (e) { profile = null; }

    // Merge anything ticked offline before signing in, then adopt the server set.
    const localOnly = window.ICPCProgress.snapshot();
    try {
      await pullProgress();
      if (localOnly.length) {
        const merged = new Set([...lastSynced, ...localOnly]);
        if (merged.size !== lastSynced.size) {
          window.ICPCProgress.replaceAll([...merged]);
          await pushProgress([...merged]);
        }
      }
      await pullSettings();
      await pullTemplates();
    } catch (err) {
      setSyncState("error", friendly(err));
    }
    openApp();
    setSyncState("saved");
  }

  async function start() {
    const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    offline = !(url && key && window.supabase);

    window.ICPCProgress = Object.assign(window.ICPCProgress || {}, {
      onChange(ids) { if (!offline && user) scheduleSync(ids); },
    });
    window.ICPCTemplates = Object.assign(window.ICPCTemplates || {}, {
      onChange(list) {
        if (offline || !user) return;
        clearTimeout(tplTimer);
        setSyncState("pending");
        tplTimer = setTimeout(() => pushTemplates(list), 700);
      },
    });
    window.ICPCSettings = Object.assign(window.ICPCSettings || {}, {
      onChange(patch) { if (!offline && user) pushSettings(patch); },
    });

    if (offline) { buildGate(); return; }

    sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    sb.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        if (!user || user.id !== session.user.id) afterSignIn(session);
      } else if (event === "SIGNED_OUT") {
        user = null; profile = null;
      }
    });

    const { data } = await sb.auth.getSession();
    if (data && data.session) await afterSignIn(data.session);
    else buildGate();
  }

  window.ICPCAccount = {
    signOut,
    refreshProfile: renderProfile,
    isOffline: () => offline,
    currentUser: () => user,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
