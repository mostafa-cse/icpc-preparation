/*
 * Admin panel — review of new accounts.
 *
 * Everything here is a convenience over four database calls: admin_list_users,
 * admin_set_status, admin_set_role and a read of moderation_log. None of the
 * authority lives in this file. The anon key ships in the browser, so any
 * "check" written here could be stepped around with curl; approval is enforced
 * by RLS and by the security-definer functions in supabase-schema.sql, which
 * refuse a caller who is not an approved admin. Hiding the tab is presentation,
 * not protection.
 */
(function () {
  "use strict";

  const STATUS = {
    pending:  { label: "Pending",  cls: "st-pending" },
    approved: { label: "Approved", cls: "st-approved" },
    declined: { label: "Declined", cls: "st-declined" },
    banned:   { label: "Banned",   cls: "st-banned" },
  };

  let sb = null;
  let me = null;
  let users = [];
  let log = [];
  let filter = "pending";
  let query = "";
  let busy = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function when(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + " days ago";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function host() { return document.getElementById("adminBody"); }

  function note(text, kind) {
    const el = document.getElementById("adminNote");
    if (!el) return;
    el.textContent = text || "";
    el.className = "admin-note" + (kind ? " " + kind : "");
  }

  // ------------------------------------------------------------------ data --
  async function load() {
    if (!sb) return;
    const [usersRes, logRes] = await Promise.all([
      sb.rpc("admin_list_users"),
      sb.from("moderation_log").select("*").order("created_at", { ascending: false }).limit(30)
    ]);
    if (usersRes.error) throw usersRes.error;
    users = usersRes.data || [];
    log = logRes.error ? [] : (logRes.data || []);
  }

  async function act(id, fn) {
    if (busy) return;
    busy = true;
    note("Working…");
    try {
      await fn();
      await load();
      render();
      note("Done.", "ok");
    } catch (err) {
      // The database's own message is the useful one here — "that is the last
      // active admin" says more than any wording this file could invent.
      note((err && err.message) || String(err), "bad");
    } finally {
      busy = false;
    }
  }

  const setStatus = (id, status, reason) =>
    sb.rpc("admin_set_status", { target: id, new_status: status, reason: reason || null })
      .then(r => { if (r.error) throw r.error; });

  const setRole = (id, role) =>
    sb.rpc("admin_set_role", { target: id, new_role: role })
      .then(r => { if (r.error) throw r.error; });

  // ---------------------------------------------------------------- render --
  function visible() {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      if (filter !== "all" && u.status !== filter) return false;
      if (!q) return true;
      return (u.email || "").toLowerCase().includes(q) ||
             (u.display_name || "").toLowerCase().includes(q);
    });
  }

  function counts() {
    const c = { all: users.length, pending: 0, approved: 0, declined: 0, banned: 0 };
    users.forEach(u => { if (c[u.status] != null) c[u.status]++; });
    return c;
  }

  function actionsFor(u) {
    const isMe = me && u.id === me.id;
    const btn = (act, label, cls) =>
      '<button type="button" class="btn ' + cls + '" data-act="' + act + '" data-id="' + esc(u.id) + '">' +
        label + "</button>";
    const out = [];

    // One action per outcome — a banned row previously offered both "Approve"
    // and "Reinstate", which called the same thing.
    if (u.status === "pending") {
      out.push(btn("approve", "Approve", "primary"), btn("decline", "Decline", ""));
    } else if (u.status === "declined") {
      out.push(btn("approve", "Approve", "primary"));
    } else if (u.status === "banned") {
      out.push(btn("approve", "Reinstate", "primary"));
    }
    if (u.status !== "banned" && !isMe) out.push(btn("ban", "Ban", "danger"));
    if (u.status === "approved" && !isMe) {
      out.push(u.role === "admin"
        ? btn("demote", "Revoke admin", "")
        : btn("promote", "Make admin", ""));
    }
    // Self-service on your own row is refused by the database; saying so up
    // front beats letting someone click and read an error.
    if (isMe) out.push('<span class="admin-self">This is you</span>');
    return out.join("");
  }

  function rowHtml(u) {
    const st = STATUS[u.status] || { label: u.status, cls: "" };
    return '<div class="admin-row" data-row="' + esc(u.id) + '">' +
      '<div class="admin-who">' +
        '<span class="admin-avatar">' + esc((u.display_name || u.email || "?").slice(0, 1).toUpperCase()) + "</span>" +
        "<div>" +
          '<strong>' + esc(u.display_name || "—") +
            (u.role === "admin" ? ' <span class="admin-badge">admin</span>' : "") + "</strong>" +
          '<span class="admin-email">' + esc(u.email || "no email on record") + "</span>" +
        "</div>" +
      "</div>" +
      '<span class="admin-status ' + st.cls + '">' + esc(st.label) + "</span>" +
      '<span class="admin-meta">joined ' + esc(when(u.created_at)) +
        '<i>' + Number(u.solved_count || 0).toLocaleString() + " solved</i></span>" +
      '<div class="admin-actions">' + actionsFor(u) + "</div>" +
      (u.status_reason
        ? '<p class="admin-reason">“' + esc(u.status_reason) + '”</p>'
        : "") +
    "</div>";
  }

  function render() {
    const h = host();
    if (!h) return;
    const c = counts();
    const list = visible();

    const tab = (key, label) =>
      '<button type="button" class="admin-filter' + (filter === key ? " active" : "") +
        '" data-filter="' + key + '">' + label +
        '<i>' + c[key] + "</i></button>";

    h.innerHTML =
      '<div class="admin-head">' +
        "<div>" +
          "<h2>Accounts</h2>" +
          '<p class="admin-sub">New signups wait here until you approve them. ' +
            'Approval is enforced by the database, so a declined or banned account ' +
            'cannot reach its data even outside this page.</p>' +
        "</div>" +
        '<button type="button" class="btn" id="adminRefresh">Refresh</button>' +
      "</div>" +

      (c.pending
        ? '<div class="admin-alert"><b>' + c.pending + "</b> account" +
          (c.pending === 1 ? "" : "s") + " waiting for review.</div>"
        : "") +

      '<div class="admin-bar">' +
        '<div class="admin-filters">' +
          tab("pending", "Pending") + tab("approved", "Approved") +
          tab("declined", "Declined") + tab("banned", "Banned") + tab("all", "All") +
        "</div>" +
        '<input type="search" id="adminSearch" placeholder="Search name or email" value="' + esc(query) + '">' +
      "</div>" +

      '<p class="admin-note" id="adminNote"></p>' +

      '<div class="admin-list">' +
        (list.length ? list.map(rowHtml).join("")
                     : '<p class="empty-note">Nothing here.</p>') +
      "</div>" +

      '<section class="doc-section"><h2>Recent decisions</h2>' +
        (log.length
          ? '<div class="admin-log">' + log.map(entry => {
              const target = users.find(u => u.id === entry.target_id);
              const actor = users.find(u => u.id === entry.actor_id);
              return '<div class="admin-log-row">' +
                '<span class="mono">' + esc(entry.action) + "</span>" +
                "<span>" + esc((target && (target.display_name || target.email)) || "deleted user") + "</span>" +
                '<span class="admin-log-by">by ' +
                  esc((actor && (actor.display_name || actor.email)) || "—") +
                  " · " + esc(when(entry.created_at)) + "</span>" +
                (entry.reason ? '<i>“' + esc(entry.reason) + '”</i>' : "") +
              "</div>";
            }).join("") + "</div>"
          : '<p class="empty-note">No decisions recorded yet.</p>') +
      "</section>";

    wire();
  }

  function wire() {
    const h = host();
    if (!h) return;

    h.querySelectorAll(".admin-filter").forEach(b =>
      b.addEventListener("click", () => { filter = b.dataset.filter; render(); }));

    const refresh = document.getElementById("adminRefresh");
    if (refresh) refresh.addEventListener("click", () =>
      act(null, async () => {}));

    const search = document.getElementById("adminSearch");
    if (search) {
      search.addEventListener("input", () => {
        query = search.value;
        const at = search.selectionStart;
        render();
        const again = document.getElementById("adminSearch");
        if (again) { again.focus(); again.setSelectionRange(at, at); }
      });
    }

    h.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.id;
      const u = users.find(x => x.id === id);
      const who = (u && (u.display_name || u.email)) || "this account";
      switch (b.dataset.act) {
        case "approve":
          return act(id, () => setStatus(id, "approved"));
        case "decline": {
          const why = prompt("Decline " + who + "?\n\nOptional reason (they will see it):", "");
          if (why === null) return;
          return act(id, () => setStatus(id, "declined", why));
        }
        case "ban": {
          const why = prompt("Ban " + who + "?\n\nThey lose access to their data immediately.\nOptional reason (they will see it):", "");
          if (why === null) return;
          return act(id, () => setStatus(id, "banned", why));
        }
        case "promote":
          if (!confirm("Make " + who + " an admin?\n\nThey will be able to approve and ban other accounts, including yours.")) return;
          return act(id, () => setRole(id, "admin"));
        case "demote":
          if (!confirm("Revoke admin from " + who + "?")) return;
          return act(id, () => setRole(id, "member"));
      }
    }));
  }

  // ------------------------------------------------------------------ boot --
  async function attach(client, currentUser) {
    sb = client;
    me = currentUser;
    const panel = document.getElementById("panel-admin");
    if (!panel) return;
    try {
      await load();
      render();
    } catch (err) {
      const h = host();
      if (h) h.innerHTML = '<p class="empty-note">Could not load the account list: ' +
        esc((err && err.message) || String(err)) +
        "<br>Re-run database/supabase-schema.sql if you have not since the admin panel was added.</p>";
    }
  }

  window.ICPCAdmin = { attach, reload: () => act(null, async () => {}) };
})();
