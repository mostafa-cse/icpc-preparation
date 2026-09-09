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
  let lastFlags = new Set();
  let syncTimer = null;
  let tplTimer = null;
  let settings = null;
  let offline = false;
  let recovering = false;   // arrived on a password-reset link

  // Captured before the Supabase client exists: detectSessionInUrl consumes the
  // fragment as soon as createClient runs, so reading location.hash later finds
  // nothing and the reset screen never opens.
  const ARRIVED_ON_RESET = /(^|[#&?])type=recovery(&|$)/.test(location.hash + location.search);

  // Mirrors signup_domain_allowed() in supabase-schema.sql. This is the polite
  // message, not the control: the trigger on auth.users is what actually holds,
  // since the anon key lets anyone POST to /auth/v1/signup directly.
  const SIGNUP_DOMAINS = ["gmail.com", "googlemail.com"];

  function signupEmailProblem(email) {
    const at = String(email || "").lastIndexOf("@");
    if (at < 1) return "That doesn't look like an email address.";
    const domain = email.slice(at + 1).toLowerCase();
    if (SIGNUP_DOMAINS.indexOf(domain) === -1) {
      return "Accounts can only be created with a Gmail address.";
    }
    return null;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------- gate UI --
  // Adds a reveal toggle to every password box in `scope`. Applied after each
  // render rather than written into the markup, so the sign-in card, the reset
  // screen and Profile all get it from one place and cannot drift apart.
  const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'd="M1.8 12S5.4 5.5 12 5.5 22.2 12 22.2 12 18.6 18.5 12 18.5 1.8 12 1.8 12Z"/>' +
    '<circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'd="M1.8 12S5.4 5.5 12 5.5c1.6 0 3 .4 4.2 1M22.2 12s-3.6 6.5-10.2 6.5c-1.6 0-3-.4-4.2-1"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M9.9 9.9a3.1 3.1 0 0 0 4.2 4.2"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M3.5 3.5l17 17"/></svg>';

  function addPasswordToggles(scope) {
    (scope || document).querySelectorAll('input[type="password"]').forEach(input => {
      if (input.dataset.pwToggle) return;
      input.dataset.pwToggle = "1";

      const wrap = document.createElement("span");
      wrap.className = "pw-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement("button");
      btn.type = "button";           // never submit the form it sits in
      btn.className = "pw-eye";
      btn.innerHTML = EYE;
      btn.title = "Show password";
      btn.setAttribute("aria-label", "Show password");
      btn.setAttribute("aria-pressed", "false");
      // Keep focus in the field: clicking the eye should not blur what you type.
      btn.addEventListener("mousedown", e => e.preventDefault());
      btn.addEventListener("click", () => {
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        btn.innerHTML = reveal ? EYE_OFF : EYE;
        btn.title = reveal ? "Hide password" : "Show password";
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("aria-pressed", String(reveal));
        btn.classList.toggle("is-on", reveal);
        const at = input.value.length;
        input.focus();
        try { input.setSelectionRange(at, at); } catch (e) {}
      });
      wrap.appendChild(btn);
    });
  }

  function buildGate() {
    if (document.getElementById("authScreen") || !document.body) return;
    const el = document.createElement("div");
    el.id = "authScreen";
    el.innerHTML =
      '<div class="auth-card-wrap">' +
        '<form class="auth-card" id="authForm" autocomplete="on">' +
          '<span class="lock-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>' +
          '<h1>ICPC · 16-Week Plan</h1>' +
          '<p class="auth-sub" id="authSub">Sign in to load your progress.</p>' +
          '<div class="auth-tabs">' +
            '<button type="button" class="auth-tab active" data-mode="signin">Sign in</button>' +
            '<button type="button" class="auth-tab" data-mode="signup">Create account</button>' +
          '</div>' +
          '<label class="auth-field auth-name" hidden>Display name' +
            '<input type="text" id="authName" autocomplete="nickname" placeholder="Mostafa"></label>' +
          '<label class="auth-field">Email' +
            '<input type="email" id="authEmail" autocomplete="email" required placeholder="you@gmail.com">' +
            '<small class="auth-hint" id="authEmailHint" hidden>Gmail addresses only. ' +
              "You'll get a confirmation link before you can sign in.</small></label>" +
          '<label class="auth-field">Password' +
            '<input type="password" id="authPass" autocomplete="current-password" required placeholder="At least 6 characters"></label>' +
          '<p class="auth-msg" id="authMsg" role="alert"></p>' +
          '<button type="submit" class="btn primary" id="authBtn">Sign in</button>' +
          '<button type="button" class="lock-link" id="authForgot">Forgot password?</button>' +
        '</form>' +
      '</div>' +
      '<footer class="auth-footer">' +
        '<p>© 2026 Mostafa Kamal · Built for the ICPC final sprint</p>' +
        '<p class="auth-foot-sub">5,089 problems · 10 training blocks · Syncs across your devices</p>' +
      '</footer>';
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
        document.getElementById("authEmailHint").hidden = mode !== "signup";
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
          const bad = signupEmailProblem(email);
          if (bad) {
            msg.className = "auth-msg err";
            msg.textContent = bad;
            btn.disabled = false;
            btn.textContent = "Create account";
            return;
          }
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
      const btnEl = document.getElementById("authForgot");
      btnEl.disabled = true;
      // A clean page URL: location.href can already carry a token fragment, and
      // Supabase only honours redirects that match its allow-list exactly.
      const back = location.origin + location.pathname;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      btnEl.disabled = false;
      msg.className = error ? "auth-msg err" : "auth-msg ok";
      msg.textContent = error
        ? friendly(error)
        : "If " + email + " has an account, a reset link is on its way. Check spam — " +
          "Supabase's built-in mail is rate limited and often lands there.";
    });

    addPasswordToggles(el);

    // A message queued by closeApp() (e.g. "Signed out.") shows on the fresh gate.
    {
      const m = buildGate.pendingMessage;
      if (m) { msg.className = "auth-msg " + m.kind; msg.textContent = m.text; buildGate.pendingMessage = null; }
    }
  }

  // Shown when the user arrives on a reset link. Without this the link merely
  // signed them in and dropped them into the app, with nowhere to set a new
  // password — which is what made "Forgot password?" look broken.
  function buildResetScreen() {
    recovering = true;
    root.classList.add("locked");
    removeGate();
    const el = document.createElement("div");
    el.id = "authScreen";
    el.innerHTML =
      '<div class="auth-card-wrap">' +
        '<form class="auth-card" id="pwForm" autocomplete="on" novalidate>' +
          '<span class="lock-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path></svg></span>' +
          "<h1>Set a new password</h1>" +
          '<p class="auth-sub">You followed a reset link. Choose a new password to finish.</p>' +
          '<label class="auth-field">New password' +
            '<input type="password" id="pwPass" autocomplete="new-password" required ' +
              'placeholder="At least 6 characters"></label>' +
          '<label class="auth-field">Repeat it' +
            '<input type="password" id="pwPass2" autocomplete="new-password" required ' +
              'placeholder="Same again"></label>' +
          '<p class="auth-msg" id="pwMsg" role="alert"></p>' +
          '<button type="submit" class="btn primary" id="pwBtn">Save password</button>' +
        '</form>' +
      '</div>' +
      '<footer class="auth-footer">' +
        '<p>© 2026 Mostafa Kamal · Built for the ICPC final sprint</p>' +
      '</footer>';
    document.body.appendChild(el);

    addPasswordToggles(el);
    const msg = document.getElementById("pwMsg");
    const btn = document.getElementById("pwBtn");
    document.getElementById("pwForm").addEventListener("submit", async e => {
      e.preventDefault();
      const a = document.getElementById("pwPass").value;
      const b = document.getElementById("pwPass2").value;
      msg.className = "auth-msg";
      if (a.length < 6) { msg.className = "auth-msg err"; msg.textContent = "At least 6 characters."; return; }
      if (a !== b) { msg.className = "auth-msg err"; msg.textContent = "Those two don't match."; return; }
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) throw error;
        // Drop the recovery token so a refresh does not re-enter this screen.
        history.replaceState(null, "", location.pathname + location.search);
        recovering = false;
        const { data } = await sb.auth.getSession();
        removeGate();
        if (data && data.session) await afterSignIn(data.session);
        else closeApp({ kind: "ok", text: "Password changed. Sign in with it." });
      } catch (err) {
        msg.className = "auth-msg err";
        msg.textContent = friendly(err);
        btn.disabled = false; btn.textContent = "Save password";
      }
    });
  }

  function friendly(err) {
    const m = (err && err.message) || String(err);
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Confirm your email first — check your inbox for the link.";
    if (/already registered/i.test(m)) return "That email already has an account. Switch to Sign in.";
    if (/password should be at least/i.test(m)) return "Password must be at least 6 characters.";
    if (/database error saving new user|unexpected_failure/i.test(m))
      return "Accounts can only be created with a Gmail address, and disposable addresses are not accepted.";
    if (/rate limit|too many|for security purposes/i.test(m))
      return "Too many attempts. Supabase's built-in mail is rate limited — wait a few minutes.";
    if (/same as the old|should be different/i.test(m)) return "That is already your password.";
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
    const adminTab = document.querySelector('.tab[data-tab="admin"]');
    if (adminTab) adminTab.hidden = !isAdmin();
    if (isAdmin() && window.ICPCAdmin) window.ICPCAdmin.attach(sb, user);
  }

  function isAdmin() {
    return !!(profile && profile.role === "admin" && profile.status === "approved");
  }

  // A profile with no `status` at all means supabase-schema.sql has not been
  // re-run since approval was added. Treat that as approved rather than locking
  // every existing user out of their own tracker.
  function accountState() {
    if (!profile || profile.status == null) return "approved";
    return profile.status;
  }

  // Shown instead of the app when an account is not approved. Deliberately a
  // dead end with only a sign-out: the database refuses this account's data
  // anyway, so there is nothing to show behind it.
  function buildStatusScreen() {
    const state = accountState();
    const copy = {
      pending: {
        mark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        title: "Waiting for approval",
        body: "Your account has been created and is in the queue for review. " +
              "You will be able to sign in as soon as an admin approves it.",
      },
      declined: {
        mark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
        title: "Account not approved",
        body: "An admin reviewed this account and did not approve it.",
      },
      banned: {
        mark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        title: "Account suspended",
        body: "Access to this site has been withdrawn for this account.",
      },
    }[state] || {
      mark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      title: "Waiting for approval",
      body: ""
    };

    removeGate();
    const el = document.createElement("div");
    el.id = "authScreen";
    el.innerHTML =
      '<div class="auth-card-wrap">' +
        '<div class="auth-card status-card">' +
          '<span class="lock-mark">' + copy.mark + "</span>" +
          "<h1>" + esc(copy.title) + "</h1>" +
          '<p class="auth-sub">' + esc(copy.body) + "</p>" +
          (profile && profile.status_reason
            ? '<p class="status-reason"><b>Reason:</b> ' + esc(profile.status_reason) + "</p>"
            : "") +
          '<p class="status-who">' + esc((user && user.email) || "") + "</p>" +
          '<button type="button" class="btn" id="statusSignOut">Sign out</button>' +
        '</div>' +
      '</div>' +
      '<footer class="auth-footer">' +
        '<p>© 2026 Mostafa Kamal · Built for the ICPC final sprint</p>' +
      '</footer>';
    document.body.appendChild(el);
    document.getElementById("statusSignOut").addEventListener("click", async () => {
      try { if (sb) await sb.auth.signOut(); } catch (e) {}
      user = null; profile = null;
      window.location.reload();
    });
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
    const flags = [];
    const dates = {};
    try {
      const { data, error } = await sb
        .from(T_PROGRESS)
        .select("problem_id, flagged, solved_at")
        .eq("user_id", user.id)
        .eq("status", "solved")
        .limit(10000);
      if (error) throw error;
      (data || []).forEach(r => {
        rows.push(r.problem_id);
        if (r.flagged) flags.push(r.problem_id);
        if (r.solved_at) dates[r.problem_id] = r.solved_at.slice(0, 10);
      });
    } catch (err) {
      // Fallback defensively if schema predates flagged/solved_at columns
      const { data, error } = await sb
        .from(T_PROGRESS)
        .select("problem_id")
        .eq("user_id", user.id)
        .eq("status", "solved")
        .limit(10000);
      if (error) throw error;
      (data || []).forEach(r => rows.push(r.problem_id));
    }
    lastSynced = new Set(rows);
    lastFlags = new Set(flags);
    window.ICPCProgress.replaceAll(rows, flags, dates);
  }

  // Diff against the last synced snapshot so a toggle costs one small request.
  async function pushProgress(ids, flags) {
    if (!sb || !user) return;
    const now = new Set(ids);
    const nowFlags = new Set(flags || lastFlags);
    const added = [...now].filter(id => !lastSynced.has(id));
    const removed = [...lastSynced].filter(id => !now.has(id));
    // A flag can move without the solved set moving at all, so changed flags
    // are re-upserted even when `added` is empty.
    const flagMoved = [...new Set([...nowFlags, ...lastFlags])]
      .filter(id => nowFlags.has(id) !== lastFlags.has(id) && now.has(id));
    if (!added.length && !removed.length && !flagMoved.length) return;

    setSyncState("saving");
    try {
      const toWrite = [...new Set(added.concat(flagMoved))];
      const tasks = [];

      if (toWrite.length) {
        for (let i = 0; i < toWrite.length; i += 500) {
          const chunk = toWrite.slice(i, i + 500)
            .map(problem_id => ({ user_id: user.id, problem_id, status: "solved", flagged: nowFlags.has(problem_id) }));
          tasks.push((async () => {
            let { error } = await sb.from(T_PROGRESS).upsert(chunk, { onConflict: "user_id,problem_id" });
            if (error && /column .*flagged/i.test(error.message || "")) {
              // Schema predates flags: save the solved state and keep the flags
              // in this browser rather than losing the whole write.
              const bare = chunk.map(r => ({ user_id: r.user_id, problem_id: r.problem_id, status: r.status }));
              ({ error } = await sb.from(T_PROGRESS).upsert(bare, { onConflict: "user_id,problem_id" }));
            }
            if (error) throw error;
          })());
        }
      }

      if (removed.length) {
        for (let i = 0; i < removed.length; i += 500) {
          const chunk = removed.slice(i, i + 500);
          tasks.push((async () => {
            const { error } = await sb.from(T_PROGRESS).delete()
              .eq("user_id", user.id).in("problem_id", chunk);
            if (error) throw error;
          })());
        }
      }

      await Promise.all(tasks);
      lastSynced = now;
      lastFlags = nowFlags;
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
      .select("id, title, category, description, time_complexity, space_complexity, code, created_at, position")
      .eq("user_id", user.id)
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
      // Every row must carry an id: supabase-js derives the `columns` list from
      // the object keys, so an `id: undefined` still sends the column and
      // PostgREST reads it as NULL, which the primary key rejects.
      const rows = list.map((t, i) => ({
        id: t.id,
        user_id: user.id,
        title: t.title,
        category: t.category || "Misc",
        description: t.description || "",
        time_complexity: t.timeComplexity || "",
        space_complexity: t.spaceComplexity || "",
        code: t.code || "",
        position: i,
      }));
      const keep = rows.map(r => r.id).filter(Boolean);
      let del = sb.from(T_TEMPLATES).delete().eq("user_id", user.id);
      if (keep.length) del = del.not("id", "in", "(" + keep.join(",") + ")");

      const tasks = [del];
      if (rows.length) {
        tasks.push(sb.from(T_TEMPLATES).upsert(rows, { onConflict: "id" }));
      }
      const results = await Promise.all(tasks);
      for (const res of results) {
        if (res && res.error) throw res.error;
      }
      setSyncState("saved");
    } catch (err) {
      setSyncState("error", friendly(err));
    }
  }

  async function pullSettings() {
    if (!sb || !user) return;
    const { data } = await sb.from(T_SETTINGS).select("*").eq("user_id", user.id).maybeSingle();
    if (!data) return;
    settings = data;
    // Modules own their own settings; they subscribe rather than being called.
    document.dispatchEvent(new CustomEvent("icpc:settings", { detail: data }));
  }

  // Columns dropped by the server because supabase-schema.sql has not been
  // re-run yet. Retried without them so one stale column cannot block the rest
  // of a settings save; the preference still lives in localStorage either way.
  const missingCols = new Set();

  async function pushSettings(patch) {
    if (!sb || !user) return;
    const send = {};
    for (const k of Object.keys(patch)) if (!missingCols.has(k)) send[k] = patch[k];
    if (!Object.keys(send).length) return;
    try {
      const { error } = await sb.from(T_SETTINGS)
        .upsert(Object.assign({ user_id: user.id }, send), { onConflict: "user_id" });
      if (error) throw error;
      settings = Object.assign(settings || {}, send);
      setSyncState("saved");
    } catch (err) {
      const m = (err && err.message) || "";
      const unknown = /Could not find the '(\w+)' column/.exec(m);
      if (unknown && !missingCols.has(unknown[1])) {
        missingCols.add(unknown[1]);
        setSyncState("saved", "Saved in this browser. Re-run supabase-schema.sql to sync '" +
          unknown[1] + "' across devices.");
        const rest = Object.assign({}, send); delete rest[unknown[1]];
        if (Object.keys(rest).length) return pushSettings(rest);
        return;
      }
      setSyncState("error", friendly(err));
    }
  }

  function scheduleSync(ids, flags) {
    clearTimeout(syncTimer);
    setSyncState("pending");
    syncTimer = setTimeout(() => pushProgress(ids, flags), 700);
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

    let localProf = {};
    try {
      localProf = JSON.parse(localStorage.getItem("icpc_profile_data") || "{}") || {};
    } catch (e) {}

    const displayName = (profile && profile.display_name) || localProf.displayName || (user ? user.email.split("@")[0] : "Competitor");
    const avatarEmoji = (profile && profile.avatar_emoji) || localProf.avatarEmoji || "";
    const bio = (profile && profile.bio) || localProf.bio || "";
    const targetRating = (profile && profile.target_rating) || localProf.targetRating || "";
    const accounts = (profile && profile.cp_accounts) || localProf.accounts || {};

    const who = offline || !user
      ? { name: displayName, email: "No account — progress is saved in this browser only", since: null }
      : {
          name: displayName,
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

    // Build CP accounts badges
    const cpPlats = [
      { id: "codeforces", name: "Codeforces", badge: "CF", color: "#1f8acb", url: h => "https://codeforces.com/profile/" + encodeURIComponent(h) },
      { id: "leetcode", name: "LeetCode", badge: "LC", color: "#ffa116", url: h => "https://leetcode.com/u/" + encodeURIComponent(h) },
      { id: "atcoder", name: "AtCoder", badge: "AC", color: "#64748b", url: h => "https://atcoder.jp/users/" + encodeURIComponent(h) },
      { id: "codechef", name: "CodeChef", badge: "CC", color: "#d97706", url: h => "https://www.codechef.com/users/" + encodeURIComponent(h) },
      { id: "vjudge", name: "VJudge", badge: "VJ", color: "#0284c7", url: h => "https://vjudge.net/user/" + encodeURIComponent(h) },
      { id: "cses", name: "CSES", badge: "CS", color: "#10b981", url: h => "https://cses.fi/user/" + encodeURIComponent(h) },
      { id: "hackerrank", name: "HackerRank", badge: "HR", color: "#059669", url: h => "https://www.hackerrank.com/" + encodeURIComponent(h) },
      { id: "github", name: "GitHub", badge: "GH", color: "#6366f1", url: h => "https://github.com/" + encodeURIComponent(h) },
    ];

    const activeCpList = cpPlats.filter(p => accounts[p.id] && accounts[p.id].trim());
    const cpBadgesHtml = activeCpList.length
      ? '<div class="pf-cp-grid">' +
          activeCpList.map(p =>
            '<a href="' + esc(p.url(accounts[p.id].trim())) + '" target="_blank" rel="noopener noreferrer" class="pf-cp-card">' +
              '<span class="pf-cp-badge" style="background:' + p.color + ';color:#fff">' + esc(p.badge) + '</span>' +
              '<div class="pf-cp-info">' +
                '<span class="pf-cp-platform">' + esc(p.name) + '</span>' +
                '<span class="pf-cp-handle">' + esc(accounts[p.id].trim()) + '</span>' +
              '</div>' +
              '<span class="pf-cp-arrow">↗</span>' +
            '</a>'
          ).join("") +
        '</div>'
      : '<p class="pf-empty-note">No CP accounts saved yet — <button type="button" class="rt-linkbtn" id="pfLinkCpBtn">link your accounts in Settings →</button></p>';

    // Routine & Milestones card
    const routinePreset = window.ICPCRoutine ? window.ICPCRoutine.currentPreset() : { name: "Intense ICPC Sprint", tagline: "12–14h/day" };
    const dayStartHHMM = window.ICPCRoutine ? window.ICPCRoutine.dayStartHHMM() : "06:00";
    const startDate = localStorage.getItem("icpc_start_date") || new Date().toISOString().slice(0, 10);
    const targetDate = localStorage.getItem("icpc_target_date") || "";
    let targetMsg = "";
    if (targetDate) {
      const diff = Math.ceil((new Date(targetDate + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
      targetMsg = diff > 0 ? diff + " days until Target Contest" : diff === 0 ? "Contest is TODAY!" : "Contest passed";
    }

    host.innerHTML =
      '<div class="pf-head">' +
        '<span class="pf-avatar">' + (avatarEmoji && !avatarEmoji.match(/[\uD800-\uDFFF\u2600-\u27BF]/) ? esc(avatarEmoji) : esc(who.name.slice(0, 2).toUpperCase())) + "</span>" +
        '<div class="pf-id">' +
          "<h2>" + esc(who.name) + "</h2>" +
          (bio ? '<p class="pf-bio">' + esc(bio) + "</p>" : "") +
          '<p class="pf-email">' + esc(who.email) + "</p>" +
          (targetRating ? '<p class="pf-target-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>' + esc(targetRating) + '</p>' : "") +
          (who.since ? '<p class="pf-since">Member since ' +
            esc(new Date(who.since).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })) +
            "</p>" : "") +
        "</div>" +
        '<div class="pf-head-actions">' +
          '<button class="btn" id="pfSettingsBtn" type="button"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:0.3rem" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>Settings</button>' +
          (offline || !user ? "" : '<button class="btn danger" id="signOutBtn" type="button">Sign out</button>') +
        "</div>" +
      "</div>" +

      '<div class="stat-row">' +
        '<div class="stat"><span class="num">' + done.toLocaleString() + '</span><span class="label">Solved</span></div>' +
        '<div class="stat"><span class="num">' + (total - done).toLocaleString() + '</span><span class="label">Remaining</span></div>' +
        '<div class="stat"><span class="num">' + pct.toFixed(1) + '%</span><span class="label">Complete</span></div>' +
        '<div class="stat"><span class="num">' + bd.phases.filter(p => p.done === p.total && p.total).length +
          '</span><span class="label">Blocks finished</span></div>' +
      "</div>" +

      '<section class="doc-section"><h2>Competitive Programming Profiles</h2>' +
        cpBadgesHtml +
      '</section>' +

      '<section class="doc-section"><h2>Training Program &amp; Schedule</h2>' +
        '<div class="pf-routine-summary">' +
          '<div class="pf-routine-item">' +
            '<strong>Routine Strategy</strong>' +
            '<span>' + esc(routinePreset.name) + ' (' + esc(routinePreset.tagline) + ')</span>' +
          '</div>' +
          '<div class="pf-routine-item">' +
            '<strong>Training Day Start</strong>' +
            '<span>' + esc(dayStartHHMM) + '</span>' +
          '</div>' +
          '<div class="pf-routine-item">' +
            '<strong>Sprint Start Date</strong>' +
            '<span>' + esc(startDate) + '</span>' +
          '</div>' +
          (targetDate ?
            '<div class="pf-routine-item">' +
              '<strong>Target Contest</strong>' +
              '<span>' + esc(targetDate) + ' (' + esc(targetMsg) + ')</span>' +
            '</div>' : "") +
        '</div>' +
      '</section>' +

      '<section class="doc-section"><h2>By training block</h2><div class="pf-list">' + rows(bd.phases) + "</div></section>" +
      '<section class="doc-section"><h2>By source file</h2><div class="pf-list">' + rows(bd.files) + "</div></section>";

    addPasswordToggles(host);

    const out = document.getElementById("signOutBtn");
    if (out) out.addEventListener("click", signOut);

    const stBtn = document.getElementById("pfSettingsBtn");
    if (stBtn) stBtn.addEventListener("click", () => {
      const tab = document.querySelector('.tab[data-tab="settings"]');
      if (tab) tab.click();
    });

    const linkCpBtn = document.getElementById("pfLinkCpBtn");
    if (linkCpBtn) linkCpBtn.addEventListener("click", () => {
      const tab = document.querySelector('.tab[data-tab="settings"]');
      if (tab) tab.click();
    });
  }

  async function signOut() {
    signingIn = false;
    clearTimeout(syncTimer);
    if (syncTimer) await pushProgress(window.ICPCProgress.snapshot(), window.ICPCProgress.flagSnapshot());
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    user = null; profile = null; lastSynced = new Set();
    window.ICPCProgress.clearLocal();
    closeApp({ kind: "ok", text: "Signed out." });
  }

  // ------------------------------------------------------------------ boot --
  let signingIn = false;
  async function afterSignIn(session) {
    if (signingIn) return;
    signingIn = true;
    user = session.user;

    // CALL 1 of 2: Profile & Authorization
    try {
      const { data } = await sb.from("profiles")
        .select("id, status, role, display_name, handle, avatar_emoji, created_at, cf_handle, atcoder_handle, vjudge_handle, cses_handle, leetcode_handle")
        .eq("id", user.id)
        .single();
      profile = data || null;
    } catch (e) {
      profile = null;
    }

    // Stop before pulling anything: an unapproved account is refused by RLS, so
    // stop immediately in 1 database call.
    if (accountState() !== "approved") {
      root.classList.add("locked");
      buildStatusScreen();
      signingIn = false;
      return;
    }

    // CALL 2 of 2: Consolidated bundle fetch (settings, progress, templates)
    // Runs in 1 single RPC query transaction on the database.
    let bundle = null;
    try {
      const { data, error } = await sb.rpc("get_user_bundle");
      if (error) throw error;
      bundle = data;
    } catch (rpcErr) {
      // Bulletproof fallback if get_user_bundle RPC is not deployed yet:
      // Run the 3 requests concurrently in a single round-trip flight.
      const [progRes, setRes, tplRes] = await Promise.allSettled([
        sb.from(T_PROGRESS).select("problem_id, flagged, solved_at").eq("user_id", user.id).eq("status", "solved").limit(10000),
        sb.from(T_SETTINGS).select("*").eq("user_id", user.id).maybeSingle(),
        sb.from(T_TEMPLATES).select("id, title, category, description, time_complexity, space_complexity, code, created_at, position").eq("user_id", user.id).order("category").order("position"),
      ]);
      const pRows = progRes.status === "fulfilled" && !progRes.value.error ? progRes.value.data : [];
      const sData = setRes.status === "fulfilled" && !setRes.value.error ? setRes.value.data : null;
      const tData = tplRes.status === "fulfilled" && !tplRes.value.error ? tplRes.value.data : [];
      bundle = {
        settings: sData || {},
        progress: (pRows || []).map(r => ({
          p: r.problem_id,
          f: !!r.flagged,
          d: r.solved_at ? r.solved_at.slice(0, 10) : ""
        })),
        templates: (tData || []).map(r => ({
          id: r.id,
          title: r.title,
          category: r.category,
          description: r.description || "",
          timeComplexity: r.time_complexity || "",
          spaceComplexity: r.space_complexity || "",
          code: r.code || "",
          createdAt: r.created_at,
        }))
      };
    }

    // 1. Hydrate settings
    if (bundle && bundle.settings && Object.keys(bundle.settings).length) {
      settings = bundle.settings;
      document.dispatchEvent(new CustomEvent("icpc:settings", { detail: settings }));
    }

    // 2. Hydrate templates
    if (bundle && bundle.templates && window.ICPCTemplates) {
      window.ICPCTemplates.replaceAll(bundle.templates);
    }

    // 3. Hydrate progress + merge local offline state if any
    const rows = [];
    const flags = [];
    const dates = {};
    if (bundle && bundle.progress) {
      bundle.progress.forEach(item => {
        if (item.p) {
          rows.push(item.p);
          if (item.f) flags.push(item.p);
          if (item.d) dates[item.p] = item.d;
        }
      });
    }
    lastSynced = new Set(rows);
    lastFlags = new Set(flags);

    const localOnly = window.ICPCProgress.snapshot();
    const localFlags = window.ICPCProgress.flagSnapshot();
    if (localOnly.length || localFlags.length) {
      const merged = new Set([...lastSynced, ...localOnly]);
      const mergedFlags = new Set([...lastFlags, ...localFlags]);
      if (merged.size !== lastSynced.size || mergedFlags.size !== lastFlags.size) {
        window.ICPCProgress.replaceAll([...merged], [...mergedFlags], dates);
        pushProgress([...merged], [...mergedFlags]);
      } else {
        window.ICPCProgress.replaceAll(rows, flags, dates);
      }
    } else {
      window.ICPCProgress.replaceAll(rows, flags, dates);
    }

    openApp();
    setSyncState("saved");
    signingIn = false;
  }

  async function start() {
    const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    offline = !(url && key && window.supabase);

    window.ICPCProgress = Object.assign(window.ICPCProgress || {}, {
      onChange(ids, flags) { if (!offline && user) scheduleSync(ids, flags); },
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
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Override Navigator LockManager to avoid "Acquiring an exclusive Navigator LockManager lock immediately failed"
        lock: async (_name, _acquireTimeout, fn) => {
          return await fn();
        },
      },
    });

    sb.auth.onAuthStateChange((event, session) => {
      // Must come first: a recovery link also produces a session, and letting
      // that fall through would drop the user into the app with no way to set
      // the password they came here to change.
      if (event === "PASSWORD_RECOVERY") { buildResetScreen(); return; }
      if (recovering) return;
      if (session && session.user) {
        if (!user || user.id !== session.user.id) afterSignIn(session);
      } else if (event === "SIGNED_OUT") {
        user = null; profile = null;
      }
    });

    // Checked as well as the event: whether PASSWORD_RECOVERY fires depends on
    // the token still being valid, but arriving on the link at all should show
    // the screen either way.
    if (ARRIVED_ON_RESET) { buildResetScreen(); return; }

    const { data } = await sb.auth.getSession();
    if (recovering) return;
    if (data && data.session) await afterSignIn(data.session);
    else buildGate();
  }

  async function updateProfile(patch) {
    profile = Object.assign(profile || {}, patch);
    try {
      localStorage.setItem("icpc_profile_cache", JSON.stringify(profile));
      if (sb && user) {
        await sb.from("profiles").update(patch).eq("id", user.id);
      }
    } catch (e) {
      console.warn("Could not save profile to Supabase", e);
    }
    renderAccountBar();
    renderProfile();
  }

  window.ICPCAccount = {
    signOut,
    refreshProfile: renderProfile,
    updateProfile,
    getProfile: () => profile,
    getSettings: () => settings,
    isOffline: () => offline,
    currentUser: () => user,
    addPasswordToggles,
    changePassword: async (newPassword) => {
      if (!sb || !user) throw new Error("Not signed in to an account.");
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return true;
    },
    openAuthModal: () => {
      if (document.getElementById("authScreen")) return;
      buildGate();
      const screen = document.getElementById("authScreen");
      if (screen && !screen.querySelector(".auth-close-btn")) {
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "auth-close-btn";
        closeBtn.innerHTML = "&times;";
        closeBtn.title = "Close";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.style.cssText = "position:absolute;top:0.75rem;right:0.9rem;background:none;border:none;font-size:1.6rem;cursor:pointer;color:var(--ink-soft);line-height:1;padding:0.25rem 0.5rem;border-radius:var(--r-sm);z-index:10;";
        closeBtn.addEventListener("click", () => removeGate());
        const card = screen.querySelector(".auth-card");
        if (card) {
          card.style.position = "relative";
          card.appendChild(closeBtn);
        }
      }
    },
  };

  // Profile summarises the checklist, which changes constantly on another tab.
  // Redraw on the way in rather than trusting the copy made at sign-in.
  document.addEventListener("icpc:tab", e => {
    if (e.detail === "profile") renderProfile();
    if (e.detail === "admin" && isAdmin() && window.ICPCAdmin) window.ICPCAdmin.attach(sb, user);
  });


  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
