/* ============================================================
   THE REEL RECIPE — admin.js
   Read-only admin view. Fetches /api/admin/clients then
   /api/admin/deliverables for the selected client + year.
============================================================ */

(function () {
  'use strict';

  const content       = document.getElementById('portalContent');
  const tabsEl        = document.querySelector('.portal-tabs');
  const statPub       = document.getElementById('statPublished');
  const statPrg       = document.getElementById('statProgress');
  const clientSelect  = document.getElementById('adminClientSelect');
  const yearSelect    = document.getElementById('adminYearSelect');
  const nameTargets   = document.querySelectorAll('[data-admin-current-name]');

  if (!content || !tabsEl || !clientSelect || !yearSelect) return;

  const STORAGE_CLIENT = 'trr.admin.client';
  const STORAGE_YEAR   = 'trr.admin.year';

  let months  = [];
  let clients = [];

  /* ── Utilities ── */
  function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function stageBadge(stage) {
    const map = {
      'Published':     'stage-published',
      'Ready To Post': 'stage-ready',
      'In Progress':   'stage-progress',
    };
    const cls = map[stage] || 'stage-progress';
    return `<span class="reel-stage ${cls}">${esc(stage)}</span>`;
  }

  function updateClientName(name) {
    nameTargets.forEach(el => { el.textContent = name || '—'; });
  }

  /* ── Reel list HTML (read-only — no feedback buttons) ── */
  function buildReelList(reels) {
    if (!reels.length) {
      return `<div class="reel-list-section"><div class="rls-header"><span class="rls-title">No reels for this selection</span></div></div>`;
    }

    const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 9 17 20 7"/></svg>`;
    const xIcon     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const rows = reels.map((reel, i) => {
      const hasScript = reel.script && reel.script.trim().length > 0;
      const submitted = !!reel.clientFeedbackStatus;
      const approved  = reel.clientFeedbackStatus === 'Client Approved';

      const scriptPanel = hasScript ? `
        <div class="reel-script-panel" id="rscript-${i}" hidden>
          <div class="reel-script-content">${esc(reel.script.trim())}</div>
        </div>` : '';

      const scriptBtn = hasScript
        ? `<button class="reel-script-btn" data-reel="${i}" aria-expanded="false" type="button" aria-label="View script">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
           </button>`
        : `<span class="reel-no-script" aria-hidden="true"></span>`;

      const watchBtn = reel.driveLink
        ? `<a href="${esc(reel.driveLink)}" target="_blank" rel="noopener noreferrer" class="reel-watch-btn" aria-label="Watch video">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
           </a>`
        : `<span class="reel-no-script" aria-hidden="true"></span>`;

      // Read-only feedback display: show badge if submitted, otherwise show "no feedback yet"
      let feedbackBadge = '';
      if (submitted) {
        const statusLabel = approved ? 'Approved' : 'Rejected';
        const statusCls   = approved ? 'rfb-approved' : 'rfb-rejected';
        const icon        = approved ? checkIcon : xIcon;
        feedbackBadge = `<span class="reel-feedback-btn ${statusCls}" aria-label="${statusLabel}" title="${statusLabel}">${icon}</span>`;
      } else {
        feedbackBadge = `<span class="reel-no-script" aria-hidden="true"></span>`;
      }

      const commentPanel = (submitted && reel.clientComment) ? `
        <div class="reel-feedback-panel" id="rfeedback-${i}" hidden>
          <div class="rfp-locked">
            <p class="rfp-locked-comment">${esc(reel.clientComment)}</p>
          </div>
        </div>` : '';

      return `
        <div class="reel-row">
          <div class="reel-row-main">
            <span class="reel-num" aria-hidden="true">${i + 1}</span>
            <span class="reel-title">${esc(reel.title)}</span>
            <span class="reel-date">${fmtDate(reel.date)}</span>
            ${stageBadge(reel.stage)}
            ${watchBtn}
            ${scriptBtn}
            ${feedbackBadge}
          </div>
          ${scriptPanel}
          ${commentPanel}
        </div>`;
    }).join('');

    const pub = reels.filter(r => r.stage === 'Published' || r.stage === 'Ready To Post').length;
    const prg = reels.filter(r => r.stage === 'In Progress').length;

    const stats = [
      pub > 0 ? `<span class="rls-stat rls-stat-pub">${pub} published</span>` : '',
      prg > 0 ? `<span class="rls-stat rls-stat-prg">${prg} in progress</span>` : '',
    ].join('');

    return `
      <div class="reel-list-section" role="region" aria-label="Reel list">
        <div class="rls-header">
          <span class="rls-title">Reels</span>
          <div class="rls-stats">${stats}</div>
        </div>
        <div class="reel-list" role="list">${rows}</div>
      </div>`;
  }

  /* ── Render month ── */
  function renderMonth(month) {
    const pub = month.reels.filter(r => r.stage === 'Published' || r.stage === 'Ready To Post').length;
    const prg = month.reels.filter(r => r.stage === 'In Progress').length;
    if (statPub) statPub.textContent = pub;
    if (statPrg) statPrg.textContent = prg;

    content.innerHTML = `
      <div class="month-content" data-month="${esc(month.key)}">
        ${buildReelList(month.reels)}
      </div>`;
  }

  /* ── Script toggle ── */
  content.addEventListener('click', e => {
    const btn = e.target.closest('.reel-script-btn');
    if (!btn) return;
    const idx   = btn.dataset.reel;
    const panel = document.getElementById(`rscript-${idx}`);
    if (!panel) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    const next = !open;
    btn.setAttribute('aria-expanded', String(next));
    btn.classList.toggle('reel-script-btn-open', next);
    panel.hidden = !next;
    const poly = btn.querySelector('polyline');
    if (poly) poly.setAttribute('points', next ? '18 15 12 9 6 15' : '6 9 12 15 18 9');
  });

  /* ── Tab activation ── */
  function activateTab(tab) {
    tabsEl.querySelectorAll('.ptab').forEach(t => {
      t.classList.remove('ptab-active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('ptab-active');
    tab.setAttribute('aria-selected', 'true');
    const month = months.find(m => m.key === tab.dataset.key);
    if (month) renderMonth(month);
  }

  function renderTabs() {
    tabsEl.innerHTML = months.map((m, i) => {
      const active = i === months.length - 1;
      return `<button class="ptab${active ? ' ptab-active' : ''}" data-key="${esc(m.key)}" role="tab" aria-selected="${active}">
        ${esc(m.label)} <span class="ptab-count">${m.reels.length}</span>
      </button>`;
    }).join('');

    tabsEl.querySelectorAll('.ptab').forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab));
    });

    const active = tabsEl.querySelector('.ptab-active');
    if (active) {
      const month = months.find(m => m.key === active.dataset.key);
      if (month) renderMonth(month);
    }
  }

  /* ── State helpers ── */
  function showLoading(msg) {
    tabsEl.innerHTML = '';
    if (statPub) statPub.textContent = 0;
    if (statPrg) statPrg.textContent = 0;
    content.innerHTML = `
      <div class="portal-state">
        <div class="portal-spinner" aria-hidden="true"></div>
        <p class="portal-state-msg">${esc(msg || 'Loading…')}</p>
      </div>`;
  }

  function showMessage(msg) {
    tabsEl.innerHTML = '';
    if (statPub) statPub.textContent = 0;
    if (statPrg) statPrg.textContent = 0;
    content.innerHTML = `
      <div class="portal-state">
        <p class="portal-state-msg">${esc(msg)}</p>
      </div>`;
  }

  /* ── Year dropdown ── */
  function populateYears() {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = current + 1; y >= current - 3; y--) years.push(y);

    const saved = localStorage.getItem(STORAGE_YEAR);
    const defaultYear = saved || String(current);

    yearSelect.innerHTML =
      '<option value="">All years</option>' +
      years.map(y => `<option value="${y}"${String(y) === defaultYear ? ' selected' : ''}>${y}</option>`).join('');
  }

  /* ── Client dropdown ── */
  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clientSelect.innerHTML = '<option value="">Access denied</option>';
          showMessage('You are not authorized to use the admin console.');
          return;
        }
        throw new Error('failed');
      }
      const data = await res.json();
      clients = data.clients || [];

      if (!clients.length) {
        clientSelect.innerHTML = '<option value="">No clients assigned to you</option>';
        showMessage('No clients are currently assigned to you as Account Manager.');
        return;
      }

      const saved = localStorage.getItem(STORAGE_CLIENT);
      clientSelect.innerHTML =
        '<option value="">— Choose a client —</option>' +
        clients.map(c => {
          const sel = (saved && saved === c.email) ? ' selected' : '';
          const label = c.name ? `${esc(c.name)} (${esc(c.email)})` : esc(c.email);
          return `<option value="${esc(c.email)}"${sel}>${label}</option>`;
        }).join('');
      clientSelect.disabled = false;

      if (saved && clients.some(c => c.email === saved)) {
        loadDeliverables();
      }
    } catch {
      clientSelect.innerHTML = '<option value="">Error loading</option>';
      showMessage('Could not load client list. Please refresh.');
    }
  }

  /* ── Deliverables fetch ── */
  async function loadDeliverables() {
    const email = clientSelect.value;
    const year  = yearSelect.value;

    if (!email) {
      months = [];
      tabsEl.innerHTML = '';
      updateClientName(null);
      content.innerHTML = `<div class="portal-state"><p class="portal-state-msg">Select a client to view their content.</p></div>`;
      return;
    }

    const client = clients.find(c => c.email === email);
    updateClientName(client?.name || email);

    showLoading('Loading content…');

    const params = new URLSearchParams({ email });
    if (year) params.set('year', year);

    try {
      const res = await fetch(`/api/admin/deliverables?${params.toString()}`);
      if (!res.ok) {
        showMessage('Could not load content for this client.');
        return;
      }
      const data = await res.json();
      months = data.months || [];

      if (!months.length) {
        const who = client?.name || email;
        showMessage(year ? `No reels assigned to you for ${esc(who)} in ${year}.` : `No reels assigned to you for ${esc(who)}.`);
        return;
      }

      renderTabs();
    } catch {
      showMessage('Could not load content. Please try again.');
    }
  }

  /* ── Wire up controls ── */
  clientSelect.addEventListener('change', () => {
    localStorage.setItem(STORAGE_CLIENT, clientSelect.value);
    loadDeliverables();
  });
  yearSelect.addEventListener('change', () => {
    localStorage.setItem(STORAGE_YEAR, yearSelect.value);
    loadDeliverables();
  });

  /* ── Init ── */
  populateYears();
  loadClients();
})();
