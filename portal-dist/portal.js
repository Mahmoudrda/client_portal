/* ============================================================
   THE REEL RECIPE — portal.js
   Fetches live data from /api/me + /api/deliverables.
============================================================ */

(function () {
  'use strict';

  const content = document.getElementById('portalContent');
  const tabsEl  = document.querySelector('.portal-tabs');
  const statPub = document.getElementById('statPublished');
  const statPrg = document.getElementById('statProgress');

  const ccStrategyBtn   = document.querySelector('[data-cc="strategy"]');
  const ccPlanBtn       = document.querySelector('[data-cc="plan"]');
  const ccStrategyPanel = document.getElementById('cc-strategy-panel');
  const ccPlanPanel     = document.getElementById('cc-plan-panel');

  if (!content || !tabsEl) return;

  let months = [];

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

  /* ── Strategy & Plan ── */
  function setClientContext(strategy, plan) {
    if (ccStrategyPanel) ccStrategyPanel.textContent = strategy || '';
    if (ccPlanPanel)     ccPlanPanel.textContent     = plan || '';
    if (ccStrategyBtn) {
      ccStrategyBtn.disabled = !strategy;
      ccStrategyBtn.setAttribute('aria-expanded', 'false');
    }
    if (ccPlanBtn) {
      ccPlanBtn.disabled = !plan;
      ccPlanBtn.setAttribute('aria-expanded', 'false');
    }
    if (ccStrategyPanel) ccStrategyPanel.hidden = true;
    if (ccPlanPanel)     ccPlanPanel.hidden     = true;
  }

  function bindCCToggle(btn, panel) {
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const open = btn.getAttribute('aria-expanded') === 'true';
      const next = !open;
      btn.setAttribute('aria-expanded', String(next));
      panel.hidden = !next;
    });
  }
  bindCCToggle(ccStrategyBtn, ccStrategyPanel);
  bindCCToggle(ccPlanBtn,     ccPlanPanel);

  /* ── Reel list HTML ── */
  function buildReelList(reels) {
    if (!reels.length) {
      return `<div class="reel-list-section"><div class="rls-header"><span class="rls-title">No reels this month</span></div></div>`;
    }

    const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 9 17 20 7"/></svg>`;
    const xIcon     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const msgIcon   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;

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
             <span class="reel-btn-label">Script</span>
           </button>`
        : `<span class="reel-no-script" aria-hidden="true"></span>`;

      const watchBtn = reel.driveLink
        ? `<a href="${esc(reel.driveLink)}" target="_blank" rel="noopener noreferrer" class="reel-watch-btn" aria-label="Watch video">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
             <span class="reel-btn-label">Watch</span>
           </a>`
        : `<span class="reel-no-script" aria-hidden="true"></span>`;

      const fbBtnCls   = submitted ? `reel-feedback-btn ${approved ? 'rfb-approved' : 'rfb-rejected'}` : 'reel-feedback-btn';
      const fbBtnIcon  = submitted ? (approved ? checkIcon : xIcon) : msgIcon;
      const fbBtnLabel = submitted ? (approved ? 'Approved' : 'Rejected') : 'Feedback';
      const feedbackBtn = `<button class="${fbBtnCls}" data-reel-fb="${i}" aria-expanded="false" type="button" aria-label="${submitted ? 'View feedback' : 'Leave feedback'}">${fbBtnIcon}<span class="reel-btn-label">${fbBtnLabel}</span></button>`;

      let feedbackPanel;
      if (submitted) {
        const statusLabel = approved ? 'Approved' : 'Rejected';
        const statusCls   = approved ? 'rfp-badge-approved' : 'rfp-badge-rejected';
        const commentHtml = reel.clientComment
          ? `<p class="rfp-locked-comment">${esc(reel.clientComment)}</p>`
          : '';
        feedbackPanel = `
        <div class="reel-feedback-panel" id="rfeedback-${i}" hidden>
          <div class="rfp-locked">
            <span class="rfp-badge ${statusCls}">${fbBtnIcon} ${statusLabel}</span>
            ${commentHtml}
          </div>
        </div>`;
      } else {
        feedbackPanel = `
        <div class="reel-feedback-panel" id="rfeedback-${i}" hidden>
          <div class="rfp-form">
            <textarea class="rfp-textarea" placeholder="Add a comment (optional)..."></textarea>
            <div class="rfp-actions">
              <button class="rfp-submit rfp-btn-approve" data-reel-id="${esc(reel.id)}" data-reel-idx="${i}" data-status="approved" type="button">
                ${checkIcon} Approve
              </button>
              <button class="rfp-submit rfp-btn-reject" data-reel-id="${esc(reel.id)}" data-reel-idx="${i}" data-status="rejected" type="button">
                ${xIcon} Reject
              </button>
            </div>
          </div>
        </div>`;
      }

      return `
        <div class="reel-row">
          <div class="reel-row-main">
            <span class="reel-num" aria-hidden="true">${i + 1}</span>
            <span class="reel-title">${esc(reel.title)}</span>
            <span class="reel-date">${fmtDate(reel.date)}</span>
            ${stageBadge(reel.stage)}
            ${watchBtn}
            ${scriptBtn}
            ${feedbackBtn}
          </div>
          ${scriptPanel}
          ${feedbackPanel}
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

  /* ── Script toggle (delegated) ── */
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

  /* ── Feedback toggle (delegated) ── */
  content.addEventListener('click', e => {
    const btn = e.target.closest('.reel-feedback-btn');
    if (!btn) return;
    const idx   = btn.dataset.reelFb;
    const panel = document.getElementById(`rfeedback-${idx}`);
    if (!panel) return;
    const next = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(next));
    panel.hidden = !next;
  });

  /* ── Feedback submit (delegated) ── */
  content.addEventListener('click', e => {
    const btn = e.target.closest('.rfp-submit');
    if (!btn) return;
    handleFeedbackSubmit(btn);
  });

  async function handleFeedbackSubmit(btn) {
    const reelId  = btn.dataset.reelId;
    const reelIdx = btn.dataset.reelIdx;
    const status  = btn.dataset.status;
    const panel   = document.getElementById(`rfeedback-${reelIdx}`);
    const comment = (panel?.querySelector('.rfp-textarea')?.value ?? '').trim();

    const allBtns = panel?.querySelectorAll('.rfp-submit');
    allBtns?.forEach(b => { b.disabled = true; });

    const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 9 17 20 7"/></svg>`;
    const xIcon     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    try {
      const res = await fetch(`/api/deliverables/${encodeURIComponent(reelId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment }),
      });
      if (!res.ok) throw new Error('failed');

      const approved    = status === 'approved';
      const statusIcon  = approved ? checkIcon : xIcon;
      const statusLabel = approved ? 'Approved' : 'Rejected';
      const statusCls   = approved ? 'rfp-badge-approved' : 'rfp-badge-rejected';

      for (const month of months) {
        const reel = month.reels.find(r => r.id === reelId);
        if (reel) {
          reel.clientFeedbackStatus = approved ? 'Client Approved' : 'Client Rejected';
          reel.clientComment = comment || null;
          break;
        }
      }

      const fbBtn = document.querySelector(`[data-reel-fb="${reelIdx}"]`);
      if (fbBtn) {
        fbBtn.className = `reel-feedback-btn ${approved ? 'rfb-approved' : 'rfb-rejected'}`;
        fbBtn.setAttribute('aria-label', 'View feedback');
        fbBtn.innerHTML = `${statusIcon}<span class="reel-btn-label">${statusLabel}</span>`;
      }

      if (panel) {
        const commentHtml = comment ? `<p class="rfp-locked-comment">${esc(comment)}</p>` : '';
        panel.innerHTML = `
          <div class="rfp-locked">
            <span class="rfp-badge ${statusCls}">${statusIcon} ${statusLabel}</span>
            ${commentHtml}
          </div>`;
      }
    } catch {
      allBtns?.forEach(b => { b.disabled = false; });
      alert('Could not submit feedback. Please try again.');
    }
  }

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

  /* ── Render tabs ── */
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

  /* ── Loading / error states ── */
  function showLoading() {
    tabsEl.innerHTML = '';
    content.innerHTML = `
      <div class="portal-state">
        <div class="portal-spinner" aria-hidden="true"></div>
        <p class="portal-state-msg">Loading your content…</p>
      </div>`;
  }

  function showError() {
    content.innerHTML = `
      <div class="portal-state">
        <p class="portal-state-msg">Could not load your content. Please refresh the page.</p>
      </div>`;
  }

  /* ── Init ── */
  async function init() {
    showLoading();
    try {
      const [meRes, delRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/deliverables'),
      ]);

      if (meRes.ok) {
        const me = await meRes.json();
        document.querySelectorAll('[data-portal-client-name]').forEach(el => {
          if (me.name) el.textContent = me.name;
        });
      }

      if (!delRes.ok) { showError(); return; }

      const data = await delRes.json();
      months = data.months || [];
      setClientContext(data.strategy, data.plan);

      if (!months.length) {
        content.innerHTML = `<div class="portal-state"><p class="portal-state-msg">No content found for your account.</p></div>`;
        return;
      }

      renderTabs();
    } catch {
      showError();
    }
  }

  init();
})();
