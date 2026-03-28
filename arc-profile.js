/**
 * arc-profile.js
 * Drop this script into any ARC Dynasty page.
 * Handles: display name setup, points, tiers, achievement toasts,
 *          nav badge, and the profile drawer.
 *
 * Usage: <script src="arc-profile.js"></script>
 * Requires: API_BASE must be defined on the page, or falls back to the
 *           hardcoded Vercel URL below.
 */

(function() {
'use strict';

const BASE = (typeof API_BASE !== 'undefined' && API_BASE)
  ? API_BASE
  : (typeof API !== 'undefined' && API && !API.includes('localhost') ? API : null)
  || 'https://arc-two-mu.vercel.app/api';

// ── Tiers (must match server) ────────────────────────────────────────────────
const TIERS = [
  { key:'commissioner',    label:'Commissioner',    min:200, color:'#a855f7', animated:true  },
  { key:'dynasty_builder', label:'Dynasty Builder', min:100, color:'#f59e0b', animated:false },
  { key:'league_winner',   label:'League Winner',   min:50,  color:'#eab308', animated:false },
  { key:'starter',         label:'Starter',         min:25,  color:'#22c55e', animated:false },
  { key:'depth_chart',     label:'Depth Chart',     min:10,  color:'#3b82f6', animated:false },
  { key:'waiver_wire',     label:'Waiver Wire',     min:0,   color:'#64748b', animated:false },
];
function getTier(pts) {
  return TIERS.find(t => pts >= t.min) || TIERS[TIERS.length-1];
}

// ── State ────────────────────────────────────────────────────────────────────
let _profile = null;         // full profile from API
let _pendingActions = [];    // queued before profile loaded

function getDeviceId() {
  let id = localStorage.getItem('diq_device_id');
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0;
      return (c==='x'?r:(r&0x3|0x8)).toString(16);
    });
    localStorage.setItem('diq_device_id', id);
  }
  return id;
}

function getDisplayName() { return localStorage.getItem('diq_display_name'); }
function saveDisplayName(n) { localStorage.setItem('diq_display_name', n); }

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchProfile() {
  try {
    // Use POST with device_id in body instead of GET with URL param
    // Ad blockers intercept ?device_id= URL params as tracking — POST body is invisible to them
    const r = await fetch(`${BASE}/achievements`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ device_id: getDeviceId(), action: 'get_profile' }),
    });
    const d = await r.json();
    _profile = d;
    renderNav();
    return d;
  } catch { return null; }
}

async function awardPoints(action, extra = {}) {
  try {
    const r = await fetch(`${BASE}/achievements`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: getDeviceId(), action, ...extra }),
    });
    const d = await r.json();
    if (d.new_achievements?.length) {
      d.new_achievements.forEach(a => showAchievementToast(a));
    }
    if (d.tier_changed && d.tier) {
      showTierToast(d.tier);
    }
    // Refresh profile silently
    fetchProfile();
    return d;
  } catch { return null; }
}

async function awardSecret(action) {
  // Fire-and-forget secret achievement — no points, just badge unlock
  try {
    const r = await fetch(`${BASE}/achievements`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: getDeviceId(), action }),
    });
    const d = await r.json();
    if (d.new_achievements?.length) {
      d.new_achievements.forEach(a => showAchievementToast({
        ...a,
        secret: true,
      }));
      fetchProfile();
    }
  } catch { }
}

async function setDisplayName(name) {
  saveDisplayName(name);
  try {
    await fetch(`${BASE}/achievements`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: getDeviceId(), action: 'set_name', display_name: name }),
    });
    fetchProfile();
  } catch {}
}

// ── Expose globally so existing page code can call awardPoints ────────────────
window.arcPoints = { award: awardPoints, awardSecret: awardSecret };

// ── Inject CSS ────────────────────────────────────────────────────────────────
const CSS = `
@keyframes arcFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes arcFadeOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}
@keyframes arcSpin{to{transform:rotate(360deg)}}
@keyframes arcGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

.arc-badge{display:inline-flex;align-items:center;gap:5px;border-radius:12px;
  padding:3px 9px;font-size:11px;font-weight:700;border:1px solid;
  cursor:pointer;transition:opacity .14s;white-space:nowrap}
.arc-badge:hover{opacity:.85}
.arc-badge.animated{
  background:linear-gradient(270deg,#a855f7,#7c3aed,#3b82f6,#a855f7);
  background-size:300% 300%;animation:arcGradient 3s ease infinite;
  border-color:rgba(168,85,247,.5);color:#fff}
.arc-badge.plain{border-color:rgba(255,255,255,.12);color:#e2eaf8}

.arc-toast{position:fixed;bottom:24px;right:24px;z-index:9999;
  background:#0d1f35;border:1px solid rgba(56,98,168,.35);border-radius:12px;
  padding:14px 18px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.5);
  animation:arcFadeUp .3s ease;pointer-events:none}
.arc-toast.out{animation:arcFadeOut .3s ease forwards}
.arc-toast-title{font-size:13px;font-weight:700;color:#e2eaf8;margin-bottom:4px}
.arc-toast-sub{font-size:12px;color:#8da8c0;line-height:1.5}

.arc-drawer-overlay{position:fixed;inset:0;background:rgba(2,8,18,.88);
  z-index:500;display:flex;align-items:flex-start;justify-content:flex-end}
.arc-drawer{background:#0d1f35;border-left:1px solid rgba(56,98,168,.25);
  width:360px;max-width:95vw;height:100vh;overflow-y:auto;
  padding:24px;animation:arcFadeUp .22s ease}
.arc-drawer-close{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  border-radius:8px;width:32px;height:32px;color:#64748b;font-size:16px;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.arc-drawer-close:hover{color:#94a3b8}
.arc-section{margin-bottom:24px}
.arc-section-label{font-size:9px;font-weight:700;letter-spacing:.14em;color:#64748b;
  font-family:monospace;text-transform:uppercase;margin-bottom:10px}
.arc-tier-bar-track{height:6px;background:#0d1e33;border-radius:3px;overflow:hidden;margin:8px 0}
.arc-tier-bar-fill{height:100%;border-radius:3px;transition:width .6s ease}
.arc-achievement{display:flex;align-items:center;gap:10px;padding:8px 0;
  border-bottom:1px solid rgba(56,98,168,.08)}
.arc-achievement:last-child{border-bottom:none}
.arc-ach-icon{font-size:18px;width:28px;text-align:center;flex-shrink:0}
.arc-ach-label{font-size:12px;color:#dbeafe;font-weight:600}
.arc-ach-desc{font-size:11px;color:#8da8c0;margin-top:2px}
.arc-ach-date{font-size:10px;color:#4a6a8a;font-family:monospace;margin-top:2px}
.arc-victory{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;
  margin-bottom:6px;border:1px solid}
.arc-name-input{width:100%;background:#071420;border:1px solid rgba(56,98,168,.25);
  border-radius:7px;padding:9px 12px;color:#d0e4f8;font-size:13px;outline:none;
  margin-bottom:8px;font-family:inherit}
.arc-name-input:focus{border-color:rgba(59,130,246,.45)}
.arc-name-btn{width:100%;background:#1d4ed8;border:none;border-radius:7px;
  padding:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.arc-name-btn:hover{opacity:.88}
.arc-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.arc-stat{background:rgba(255,255,255,.025);border:1px solid rgba(56,98,168,.12);
  border-radius:8px;padding:10px;text-align:center}
.arc-stat-val{font-size:18px;font-weight:700;color:#dbeafe;font-family:monospace}
.arc-stat-lbl{font-size:9px;color:#4a6a8a;letter-spacing:.1em;font-family:monospace;margin-top:2px}

/* Pilot feedback button */
.arc-feedback-btn{position:fixed;bottom:20px;left:20px;z-index:400;
  background:#0d1f35;border:1px solid rgba(56,98,168,.35);border-radius:20px;
  padding:8px 14px;color:#8da8c0;font-size:12px;font-weight:600;cursor:pointer;
  display:flex;align-items:center;gap:6px;transition:all .16s;
  box-shadow:0 2px 16px rgba(0,0,0,.3)}
.arc-feedback-btn:hover{color:#93c5fd;border-color:rgba(56,98,168,.6);
  background:#0f2845;transform:translateY(-1px)}
.arc-fb-modal{position:fixed;inset:0;background:rgba(2,8,18,.88);
  z-index:600;display:flex;align-items:center;justify-content:center}
.arc-fb-box{background:#0d1f35;border:1px solid rgba(56,98,168,.35);
  border-radius:16px;padding:28px;width:420px;max-width:92vw;
  animation:arcFadeUp .22s ease}
.arc-fb-title{font-size:17px;font-weight:800;color:#e2eaf8;margin-bottom:4px}
.arc-fb-sub{font-size:12px;color:#8da8c0;margin-bottom:20px;line-height:1.6}
.arc-fb-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.arc-fb-cat{background:rgba(255,255,255,.03);border:1px solid rgba(56,98,168,.2);
  border-radius:20px;padding:5px 12px;font-size:11px;color:#8da8c0;cursor:pointer;
  transition:all .14s;font-weight:600}
.arc-fb-cat.selected{background:rgba(37,99,235,.15);border-color:rgba(37,99,235,.4);color:#93c5fd}
.arc-fb-textarea{width:100%;background:#071420;border:1px solid rgba(56,98,168,.25);
  border-radius:8px;padding:10px 13px;color:#d0e4f8;font-size:13px;
  outline:none;resize:vertical;min-height:90px;font-family:inherit;line-height:1.5;
  margin-bottom:14px}
.arc-fb-textarea:focus{border-color:rgba(59,130,246,.45)}
.arc-fb-textarea::placeholder{color:#1e3050}
.arc-fb-stars{display:flex;gap:6px;margin-bottom:16px}
.arc-fb-star{font-size:22px;cursor:pointer;transition:transform .1s;opacity:.3}
.arc-fb-star.lit{opacity:1}
.arc-fb-star:hover{transform:scale(1.2)}
.arc-fb-row{display:flex;gap:8px}
.arc-fb-cancel{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  border-radius:8px;padding:10px;color:#64748b;font-size:13px;font-weight:600;cursor:pointer}
.arc-fb-cancel:hover{color:#94a3b8}
.arc-fb-submit{flex:2;background:#1d4ed8;border:none;border-radius:8px;
  padding:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .14s}
.arc-fb-submit:hover{opacity:.88}
.arc-fb-submit:disabled{opacity:.4;cursor:not-allowed}
.arc-fb-done{text-align:center;padding:16px 0}
.arc-fb-done-icon{font-size:36px;margin-bottom:10px}
.arc-fb-done-title{font-size:15px;font-weight:700;color:#22c55e;margin-bottom:6px}
.arc-fb-done-sub{font-size:12px;color:#8da8c0;line-height:1.6}
`;
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

// ── Nav badge ─────────────────────────────────────────────────────────────────
function renderNav() {
  const existing = document.getElementById('arc-nav-badge');
  if (!existing) return;

  const name = _profile?.profile?.display_name || getDisplayName()
    || (_profile?.profile?.sleeper_username ? '@' + _profile.profile.sleeper_username : null);
  const pts  = _profile?.season_stats?.points ?? 0;
  const tier = _profile?.season_stats?.tier ?? getTier(pts);

  if (!name) {
    existing.innerHTML = `<span class="arc-badge plain" onclick="arcOpenDrawer()" 
      style="background:rgba(255,255,255,.04)">Set Name →</span>`;
    return;
  }

  const isAnimated = tier.animated;
  existing.innerHTML = `
    <span class="arc-badge ${isAnimated?'animated':'plain'}"
      style="${isAnimated?'':'background:'+tier.color+'18;border-color:'+tier.color+'44;color:'+tier.color}"
      onclick="arcOpenDrawer()">
      ${name} · ${pts}pts
    </span>`;
}

// ── Inject nav badge placeholder into header ──────────────────────────────────
function injectNavBadge() {
  // Find the nav-divider and insert before it
  const divider = document.querySelector('.nav-divider');
  if (!divider) return;
  if (document.getElementById('arc-nav-badge')) return;
  const wrap = document.createElement('div');
  wrap.id = 'arc-nav-badge';
  wrap.style.cssText = 'display:flex;align-items:center';
  divider.parentNode.insertBefore(wrap, divider);
}

// ── Toast notifications ───────────────────────────────────────────────────────
let _toastQueue = [];
let _toastShowing = false;

function showAchievementToast(a) {
  const isSecret = a.secret;
  _toastQueue.push({
    title: isSecret
      ? `🔓 Secret Achievement Unlocked: ${a.label}`
      : `🏅 Achievement Unlocked: ${a.label}`,
    sub:   a.desc || '',
    color: isSecret ? '#a855f7' : '#f59e0b',
  });
  processToastQueue();
}

function showTierToast(tier) {
  _toastQueue.push({
    title: `🎉 Tier Up — ${tier.label}!`,
    sub:   `You've reached ${tier.label} this season.`,
    color: tier.color,
  });
  processToastQueue();
}

function processToastQueue() {
  if (_toastShowing || !_toastQueue.length) return;
  _toastShowing = true;
  const t = _toastQueue.shift();
  const el = document.createElement('div');
  el.className = 'arc-toast';
  el.innerHTML = `
    <div class="arc-toast-title" style="color:${t.color}">${t.title}</div>
    <div class="arc-toast-sub">${t.sub}</div>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => {
      el.remove();
      _toastShowing = false;
      processToastQueue();
    }, 300);
  }, 3500);
}

// ── Profile drawer ────────────────────────────────────────────────────────────
window.arcOpenDrawer = function() {
  if (document.querySelector('.arc-drawer-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'arc-drawer-overlay';
  overlay.onclick = e => { if (e.target === overlay) arcCloseDrawer(); };

  const name = _profile?.profile?.display_name || getDisplayName();
  const pts  = _profile?.season_stats?.points ?? 0;
  const tier = _profile?.season_stats?.tier ?? getTier(pts);
  const seasonName = _profile?.season?.name ?? 'Current Season';
  const rank = _profile?.season_stats?.rank;
  const achievements = _profile?.achievements ?? [];
  const victories = _profile?.victories ?? [];
  const stats = _profile?.season_stats;

  // Next tier
  const nextTier = TIERS.slice().reverse().find(t => t.min > pts);
  const ptsToNext = nextTier ? nextTier.min - pts : 0;
  const tierProgress = nextTier
    ? Math.round(((pts - tier.min) / (nextTier.min - tier.min)) * 100)
    : 100;

  overlay.innerHTML = `
    <div class="arc-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div>
          <div style="font-size:17px;font-weight:800;color:#e2eaf8">Your Profile</div>
          <div style="font-size:12px;color:#8da8c0;margin-top:2px">${seasonName}</div>
        </div>
        <button class="arc-drawer-close" onclick="arcCloseDrawer()">✕</button>
      </div>

      ${!name ? `
      <!-- Set display name -->
      <div class="arc-section">
        <div class="arc-section-label">Display Name</div>
        <div style="font-size:12px;color:#8da8c0;margin-bottom:10px">
          Set a name to appear on leaderboards and next to your tier badge.
        </div>
        <input class="arc-name-input" id="arc-name-field" placeholder="e.g. DynastyKing" maxlength="24"/>
        <button class="arc-name-btn" onclick="arcSaveName()">Save Name</button>
      </div>` : `
      <!-- Name + tier -->
      <div class="arc-section">
        <div style="font-size:22px;font-weight:800;color:#e2eaf8;margin-bottom:6px">${name}</div>
        ${_profile?.profile?.sleeper_username
          ? `<div style="font-size:12px;color:#8da8c0;margin-bottom:10px">@${_profile.profile.sleeper_username} · ${_profile.profile.total_weight?.toFixed(1)}× vote weight</div>`
          : ''}
        <div style="display:inline-flex;align-items:center;gap:7px;border-radius:8px;padding:6px 14px;
          border:1px solid ${tier.color}44;background:${tier.color}12;margin-bottom:12px;
          ${tier.animated?'background:linear-gradient(270deg,#a855f7,#7c3aed,#3b82f6,#a855f7);background-size:300% 300%;animation:arcGradient 3s ease infinite;border-color:rgba(168,85,247,.5);color:#fff':'color:'+tier.color}">
          <span style="font-size:15px;font-weight:800">${tier.label}</span>
          <span style="font-size:12px;opacity:.7">${pts} pts${rank?' · #'+rank+' this season':''}</span>
        </div>
        ${nextTier ? `
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">${ptsToNext} pts to ${nextTier.label}</div>
        <div class="arc-tier-bar-track">
          <div class="arc-tier-bar-fill" style="width:${tierProgress}%;background:${tier.color}"></div>
        </div>` : `<div style="font-size:11px;color:#a855f7">👑 Maximum tier reached!</div>`}
      </div>`}

      <!-- Season stats -->
      ${stats ? `
      <div class="arc-section">
        <div class="arc-section-label">This Season</div>
        <div class="arc-stat-grid">
          <div class="arc-stat"><div class="arc-stat-val">${stats.votes_cast}</div><div class="arc-stat-lbl">VOTES CAST</div></div>
          <div class="arc-stat"><div class="arc-stat-val">${stats.outcomes_logged}</div><div class="arc-stat-lbl">OUTCOMES LOGGED</div></div>
          <div class="arc-stat"><div class="arc-stat-val">${stats.counters_logged}</div><div class="arc-stat-lbl">COUNTERS LOGGED</div></div>
          <div class="arc-stat"><div class="arc-stat-val">${stats.trades_submitted}</div><div class="arc-stat-lbl">TRADES SUBMITTED</div></div>
        </div>
        ${_profile?.streak?.current > 0 ? `
        <div style="margin-top:12px;display:flex;align-items:center;gap:10px;
          background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);
          border-radius:8px;padding:10px 14px">
          <span style="font-size:20px">🔥</span>
          <div>
            <div style="font-size:15px;font-weight:800;color:#f59e0b">${_profile.streak.current} day streak</div>
            <div style="font-size:10px;color:#64748b">Best: ${_profile.streak.max} days</div>
          </div>
        </div>` : ''}
      </div>` : ''}

      <!-- How to earn points -->
      <div class="arc-section">
        <div class="arc-section-label">How to Earn Points</div>
        ${[
          ['Vote on a trade','1 pt'],
          ['Vote matches consensus','+1 bonus'],
          ['Submit a trade for review','5 pts'],
          ['Log an outcome (accept/reject)','8 pts'],
          ['Log a counter offer with assets','15 pts'],
          ['Connect Sleeper (one-time)','20 pts'],
          ['Each standard league (up to 3)','8 pts'],
        ].map(([a,p])=>`
        <div style="display:flex;justify-content:space-between;font-size:12px;
          padding:5px 0;border-bottom:1px solid rgba(56,98,168,.07)">
          <span style="color:#7c9cbf">${a}</span>
          <span style="color:#93c5fd;font-family:monospace;font-weight:700">${p}</span>
        </div>`).join('')}
      </div>

      <!-- Season victories -->
      ${victories.length ? `
      <div class="arc-section">
        <div class="arc-section-label">Season History</div>
        ${victories.map(v=>{
          const t = TIERS.find(x=>x.key===v.tier)||TIERS[TIERS.length-1];
          return `<div class="arc-victory" style="border-color:${t.color}33;background:${t.color}08">
            <span style="font-size:14px">${v.tier==='commissioner'?'👑':v.tier==='dynasty_builder'?'🥇':'🥈'}</span>
            <div>
              <div style="font-size:12px;color:${t.color};font-weight:700">${t.label}</div>
              <div style="font-size:10px;color:#475569">${v.seasons?.name??''} · ${v.points} pts</div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Achievements -->
      <div class="arc-section">
        <div class="arc-section-label">Achievements (${achievements.filter(a=>!a.locked).length}${achievements.some(a=>a.locked)?' + ' + achievements.filter(a=>a.locked).length + ' locked':''})</div>
        ${achievements.length === 0
          ? '<div style="font-size:12px;color:#8da8c0">No achievements yet — start voting to earn your first one.</div>'
          : achievements.map(a => a.locked ? `
        <div class="arc-achievement" style="opacity:0.45">
          <div class="arc-ach-icon">🔒</div>
          <div>
            <div class="arc-ach-label" style="color:#64748b">??? Secret Achievement</div>
            <div class="arc-ach-desc" style="color:#4a6a8a">Keep playing to unlock</div>
          </div>
        </div>` : `
        <div class="arc-achievement" style="${a.secret ? 'border-left:2px solid #a855f7;padding-left:8px' : ''}">
          <div class="arc-ach-icon">${a.icon||'🏅'}</div>
          <div>
            <div class="arc-ach-label" style="${a.secret ? 'color:#d8b4fe' : ''}">${a.label||a.key}${a.secret ? ' <span style="font-size:9px;color:#a855f7;background:rgba(168,85,247,0.1);border-radius:3px;padding:1px 4px">SECRET</span>' : ''}</div>
            <div class="arc-ach-desc">${a.desc||''}</div>
            <div class="arc-ach-date">${a.earned_at ? new Date(a.earned_at).toLocaleDateString() : ''}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;

  document.body.appendChild(overlay);
};

window.arcCloseDrawer = function() {
  document.querySelector('.arc-drawer-overlay')?.remove();
};

window.arcSaveName = function() {
  const input = document.getElementById('arc-name-field');
  const name = input?.value?.trim();
  if (!name || name.length < 2) return;
  setDisplayName(name);
  arcCloseDrawer();
  setTimeout(arcOpenDrawer, 100);
};

// ── Hook into existing page vote/feedback functions ───────────────────────────
// Wrap castVote if it exists on this page
const _origCastVote = window.castVote;
if (typeof _origCastVote === 'function') {
  window.castVote = function(id, v) {
    // Pass is_featured so achievements route can award First Impression
    const isFeatured = window.FEATURED_TRADE_ID && id === window.FEATURED_TRADE_ID;
    awardPoints('vote', isFeatured ? { is_featured: true } : {});
    return _origCastVote.call(this, id, v);
  };
}

// Wrap logOutcome if it exists
const _origLogOutcome = window.logOutcome;
if (typeof _origLogOutcome === 'function') {
  window.logOutcome = async function(outcome) {
    awardPoints('outcome');
    return _origLogOutcome.apply(this, arguments);
  };
}

// Wrap saveCounter if it exists
const _origSaveCounter = window.saveCounter;
if (typeof _origSaveCounter === 'function') {
  window.saveCounter = async function() {
    awardPoints('counter');
    return _origSaveCounter.apply(this, arguments);
  };
}

// ── Pilot feedback button ─────────────────────────────────────────────────────
function injectFeedbackBtn() {
  if (document.getElementById('arc-feedback-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'arc-feedback-btn';
  btn.className = 'arc-feedback-btn';
  btn.innerHTML = '💬 Feedback';
  btn.onclick = openFeedbackModal;
  document.body.appendChild(btn);
}

let _fbCategory = 'other';
let _fbRating   = 0;

function openFeedbackModal() {
  if (document.querySelector('.arc-fb-modal')) return;
  const modal = document.createElement('div');
  modal.className = 'arc-fb-modal';
  modal.onclick = e => { if (e.target === modal) closeFeedbackModal(); };
  modal.innerHTML = `
    <div class="arc-fb-box">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <div class="arc-fb-title">Pilot Feedback</div>
        <button class="arc-drawer-close" onclick="closeFeedbackModal()">✕</button>
      </div>
      <div class="arc-fb-sub">
        Found a bug? Something confusing? Missing a feature?<br>
        All feedback goes directly to the developer.
      </div>

      <div style="font-size:10px;color:#64748b;font-family:monospace;letter-spacing:.08em;margin-bottom:8px">CATEGORY</div>
      <div class="arc-fb-cats">
        ${[['🐛','bug','Bug'],['💡','suggestion','Suggestion'],['😕','confusing','Confusing'],['🔍','missing','Missing Feature'],['💬','other','Other']].map(
          ([icon, key, label]) =>
          `<span class="arc-fb-cat${_fbCategory===key?' selected':''}"
            onclick="setFbCat('${key}',this)">${icon} ${label}</span>`
        ).join('')}
      </div>

      <div style="font-size:10px;color:#64748b;font-family:monospace;letter-spacing:.08em;margin-bottom:8px">OVERALL RATING (optional)</div>
      <div class="arc-fb-stars" id="arc-fb-stars">
        ${[1,2,3,4,5].map(n =>
          `<span class="arc-fb-star${n<=_fbRating?' lit':''}" onclick="setFbRating(${n})">★</span>`
        ).join('')}
      </div>

      <textarea class="arc-fb-textarea" id="arc-fb-text"
        placeholder="Tell us what's on your mind — as specific as you can be…"></textarea>

      <div class="arc-fb-row">
        <button class="arc-fb-cancel" onclick="closeFeedbackModal()">Cancel</button>
        <button class="arc-fb-submit" id="arc-fb-submit-btn" onclick="submitFeedback()">
          Send Feedback
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('arc-fb-text')?.focus(), 100);
}

window.setFbCat = function(key, el) {
  _fbCategory = key;
  document.querySelectorAll('.arc-fb-cat').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
};

window.setFbRating = function(n) {
  _fbRating = n;
  document.querySelectorAll('.arc-fb-star').forEach((s, i) => {
    s.classList.toggle('lit', i < n);
  });
};

window.closeFeedbackModal = function() {
  document.querySelector('.arc-fb-modal')?.remove();
};

window.submitFeedback = async function() {
  const msg = document.getElementById('arc-fb-text')?.value?.trim();
  if (!msg) {
    document.getElementById('arc-fb-text')?.focus();
    return;
  }
  const btn = document.getElementById('arc-fb-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    await fetch(`${BASE}/pilot-feedback`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        device_id:    getDeviceId(),
        display_name: getDisplayName(),
        page:         window.location.pathname.split('/').pop() || 'index',
        category:     _fbCategory,
        message:      msg,
        rating:       _fbRating || null,
      }),
    });
  } catch {}

  // Show done state
  document.querySelector('.arc-fb-box').innerHTML = `
    <div class="arc-fb-done">
      <div class="arc-fb-done-icon">✓</div>
      <div class="arc-fb-done-title">Thanks — got it.</div>
      <div class="arc-fb-done-sub">
        This goes straight to the developer.<br>
        If you hit a bug, feel free to submit another one.
      </div>
    </div>`;
  setTimeout(closeFeedbackModal, 2200);
  // Reset state for next time
  _fbCategory = 'other';
  _fbRating   = 0;
};

// ── Init ──────────────────────────────────────────────────────────────────────
// Wait for DOM then inject badge + load profile
function init() {
  injectNavBadge();
  injectFeedbackBtn();
  // First-visit nudge — show after 3s so user notices the badge
  if(!localStorage.getItem('diq_badge_nudge_shown')){
    setTimeout(()=>{
      const name = getDisplayName();
      if(!name){
        // No name set yet — show a gentle nudge
        _toastQueue.push({
          title: '👋 Set your display name',
          sub:   'Click your name badge (top right) to set a name and track your achievements.',
          color: '#3b82f6',
        });
        processToastQueue();
      }
      localStorage.setItem('diq_badge_nudge_shown','1');
    }, 3000);
  }
  // Restore display name from localStorage immediately (no API needed)
  const name = getDisplayName();
  const navBadge = document.getElementById('arc-nav-badge');
  if (navBadge && name) {
    navBadge.innerHTML = `<span class="arc-badge plain"
      style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1)"
      onclick="arcOpenDrawer()">${name} · …</span>`;
  } else if (navBadge) {
    navBadge.innerHTML = `<span class="arc-badge plain"
      style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1)"
      onclick="arcOpenDrawer()">Set Name →</span>`;
  }
  // Load profile and sync Sleeper username from localStorage if not yet in DB.
  // When Sleeper connects, the sleeper route writes to a row keyed on sleeper_id,
  // but the points row is keyed on device_id — they may be separate rows.
  // This syncs the localStorage Sleeper username to the device_id row so the
  // leaderboard can show real names.
  fetchProfile().then(profile => {
    const localSleeper = localStorage.getItem('diq_sleeper_user');

    // If localStorage has Sleeper username but DB profile row doesn't, push it up
    if (localSleeper && !profile?.profile?.sleeper_username) {
      fetch(`${BASE}/achievements`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          device_id: getDeviceId(),
          action: 'set_sleeper',
          sleeper_username: localSleeper,
        }),
      }).catch(() => {});
    }

    // Auto-set display name from Sleeper username (local or profile) if not set
    const sleeperName = localSleeper || profile?.profile?.sleeper_username;
    if (!getDisplayName() && sleeperName) {
      const displayName = '@' + sleeperName.replace(/^@/, '');
      saveDisplayName(displayName);
      setDisplayName(displayName);
      const nb = document.getElementById('arc-nav-badge');
      if (nb) nb.innerHTML = `<span class="arc-badge plain"
        style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1)"
        onclick="arcOpenDrawer()">${displayName} · …</span>`;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
