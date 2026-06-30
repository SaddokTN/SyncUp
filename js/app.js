/* ============================================
   SyncUp — Main Application JS
   Handles: auth, availability grid, groups, overlap
   ============================================ */

const API = {
  auth:         'api/auth.php',
  availability: 'api/availability.php',
  groups:       'api/groups.php',
};

const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START_HOUR = 6;
const END_HOUR   = 23; // display up to 11 PM, cells cover 6:00–22:59

// ── App State ─────────────────────────────────
let state = {
  user:         null,
  availability: new Set(), // "weekday-hour" keys
  groups:       [],
  activeGroup:  null,
  overlapData:  null,
};

// ── Helpers ───────────────────────────────────
async function api(endpoint, params = {}, body = null) {
  const url = new URL(endpoint, window.location.href);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const opts = { method: body ? 'POST' : 'GET', headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  return res.json();
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showModal(id) { document.getElementById(id).classList.add('open'); }
function hideModal(id) { document.getElementById(id).classList.remove('open'); }

function setPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const nav = document.querySelector(`[data-panel="${id}"]`);
  if (nav) nav.classList.add('active');
}

// ── Auth ──────────────────────────────────────
function initAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form').forEach(f => {
        f.style.display = f.id === `form-${target}` ? 'block' : 'none';
      });
    });
  });

  // Register
  document.getElementById('btn-register').addEventListener('click', async () => {
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    const payload = {
      username:     document.getElementById('reg-username').value.trim(),
      display_name: document.getElementById('reg-name').value.trim(),
      email:        document.getElementById('reg-email').value.trim(),
      password:     document.getElementById('reg-password').value,
    };
    const data = await api(API.auth, { action: 'register' }, payload);
    if (data.success) {
      state.user = data.user;
      enterApp();
    } else {
      errEl.textContent = data.error;
    }
  });

  // Login
  document.getElementById('btn-login').addEventListener('click', async () => {
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const payload = {
      username: document.getElementById('login-username').value.trim(),
      password: document.getElementById('login-password').value,
    };
    const data = await api(API.auth, { action: 'login' }, payload);
    if (data.success) {
      state.user = data.user;
      enterApp();
    } else {
      errEl.textContent = data.error;
    }
  });
}

async function checkSession() {
  const data = await api(API.auth, { action: 'me' });
  if (data.success && data.user) {
    state.user = data.user;
    enterApp();
  } else {
    document.getElementById('page-auth').classList.add('active');
    document.getElementById('app-header').style.display = 'none';
  }
}

async function logout() {
  await api(API.auth, { action: 'logout' }, {});
  state = { user: null, availability: new Set(), groups: [], activeGroup: null };
  document.getElementById('page-app').classList.remove('active');
  document.getElementById('page-auth').classList.add('active');
  document.getElementById('app-header').style.display = 'none';
}

// ── App Init ──────────────────────────────────
async function enterApp() {
  document.getElementById('page-auth').classList.remove('active');
  document.getElementById('page-app').classList.add('active');
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('header-username').textContent = state.user.display_name;

  // Load availability & groups in parallel
  const [avail, groups] = await Promise.all([
    api(API.availability, { action: 'get' }),
    api(API.groups, { action: 'list' }),
  ]);

  if (avail.success) {
    state.availability = new Set(avail.slots.map(s => `${s.weekday}-${s.start_hour}`));
    // Convert slot ranges to individual hour cells
    state.availability = new Set();
    avail.slots.forEach(s => {
      for (let h = s.start_hour; h < s.end_hour; h++) {
        state.availability.add(`${s.weekday}-${h}`);
      }
    });
  }
  if (groups.success) state.groups = groups.groups;

  renderAvailabilityGrid();
  renderGroupsSidebar();
  setPanel('panel-availability');
}

// ── Availability Grid ─────────────────────────
function renderAvailabilityGrid() {
  const container = document.getElementById('availability-grid');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'time-grid';

  // Header row
  const cornerEl = document.createElement('div');
  cornerEl.className = 'grid-header time-col';
  cornerEl.textContent = '';
  grid.appendChild(cornerEl);

  DAYS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'grid-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  // Hour rows
  for (let h = START_HOUR; h < END_HOUR; h++) {
    // Time label
    const label = document.createElement('div');
    label.className = 'grid-cell time-label';
    label.textContent = formatHour(h);
    grid.appendChild(label);

    // Day cells
    for (let d = 0; d < 7; d++) {
      const key = `${d}-${h}`;
      const cell = document.createElement('div');
      cell.className = 'grid-cell slot' + (state.availability.has(key) ? ' selected' : '');
      cell.dataset.key = key;
      cell.addEventListener('click', toggleSlot);
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
}

function toggleSlot(e) {
  const key = e.currentTarget.dataset.key;
  if (state.availability.has(key)) {
    state.availability.delete(key);
    e.currentTarget.classList.remove('selected');
  } else {
    state.availability.add(key);
    e.currentTarget.classList.add('selected');
  }
}

async function saveAvailability() {
  const btn = document.getElementById('btn-save-availability');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Convert individual hour cells back to ranges per weekday
  const byDay = {};
  state.availability.forEach(key => {
    const [d, h] = key.split('-').map(Number);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(h);
  });

  const slots = [];
  Object.entries(byDay).forEach(([d, hours]) => {
    hours.sort((a, b) => a - b);
    let start = hours[0];
    let prev  = hours[0];
    for (let i = 1; i <= hours.length; i++) {
      if (i < hours.length && hours[i] === prev + 1) {
        prev = hours[i];
      } else {
        slots.push({ weekday: parseInt(d), start_hour: start, end_hour: prev + 1 });
        if (i < hours.length) { start = hours[i]; prev = hours[i]; }
      }
    }
  });

  const data = await api(API.availability, { action: 'save' }, { slots });
  btn.disabled = false;
  btn.textContent = 'Save availability';
  if (data.success) {
    toast(`Saved ${data.saved} time block${data.saved !== 1 ? 's' : ''}`);
  } else {
    toast(data.error, 'error');
  }
}

// ── Groups ────────────────────────────────────
function renderGroupsSidebar() {
  const list = document.getElementById('group-list');
  list.innerHTML = '';
  state.groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'group-item' + (state.activeGroup?.id === g.id ? ' active' : '');
    btn.innerHTML = `
      <span class="group-dot"></span>
      <span class="group-name">${escHtml(g.name)}</span>
      <span class="member-badge">${g.member_count}</span>
    `;
    btn.addEventListener('click', () => openGroup(g));
    list.appendChild(btn);
  });
}

async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) return;
  const data = await api(API.groups, { action: 'create' }, { name });
  if (data.success) {
    state.groups.unshift({ ...data.group, member_count: 1, owner_id: state.user.id });
    renderGroupsSidebar();
    hideModal('modal-create-group');
    document.getElementById('new-group-name').value = '';
    toast(`Group "${data.group.name}" created! Code: ${data.group.invite_code}`);
    openGroup(state.groups[0]);
  } else {
    toast(data.error, 'error');
  }
}

async function joinGroup() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code) return;
  const data = await api(API.groups, { action: 'join' }, { invite_code: code });
  if (data.success) {
    // Reload group list
    const groups = await api(API.groups, { action: 'list' });
    if (groups.success) state.groups = groups.groups;
    renderGroupsSidebar();
    hideModal('modal-join-group');
    document.getElementById('join-code').value = '';
    toast(`Joined "${data.group.name}"!`);
    const joined = state.groups.find(g => g.id === data.group.id);
    if (joined) openGroup(joined);
  } else {
    toast(data.error, 'error');
  }
}

async function openGroup(group) {
  state.activeGroup = group;

  // Update sidebar active state
  document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');

  setPanel('panel-group');

  const titleEl = document.getElementById('group-title');
  titleEl.textContent = group.name;

  const codeEl = document.getElementById('group-invite-code');
  codeEl.textContent = group.invite_code;
  codeEl.title = 'Click to copy';

  // Show loading
  document.getElementById('group-content').innerHTML = '<div class="spinner"></div>';

  // Fetch members + overlap
  const [membersData, overlapData] = await Promise.all([
    api(API.groups, { action: 'members', group_id: group.id }),
    api(API.groups, { action: 'overlap', group_id: group.id }),
  ]);

  if (!membersData.success) { toast(membersData.error, 'error'); return; }

  state.overlapData = overlapData;

  renderGroupPanel(group, membersData.members, overlapData);
}

function renderGroupPanel(group, members, overlapData) {
  const container = document.getElementById('group-content');
  container.innerHTML = '';

  // Members chips
  const membersDiv = document.createElement('div');
  membersDiv.className = 'members-list';
  members.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'member-chip';
    chip.innerHTML = `
      <div class="member-avatar">${m.display_name[0].toUpperCase()}</div>
      <span>${escHtml(m.display_name)}</span>
    `;
    membersDiv.appendChild(chip);
  });
  container.appendChild(membersDiv);

  // Info banner
  if (overlapData.success) {
    const info = document.createElement('div');
    info.className = 'info-banner';
    const withData = overlapData.members_with_data ?? 0;
    const total    = overlapData.total_members ?? members.length;
    if (withData < total) {
      info.innerHTML = `<strong>${withData} of ${total} members</strong> have added their availability. Waiting on the rest to see full overlap.`;
    } else {
      const count = overlapData.overlap?.length ?? 0;
      info.innerHTML = `All <strong>${total} members</strong> have set their availability. Found <strong>${count} shared time block${count !== 1 ? 's' : ''}</strong>.`;
    }
    container.appendChild(info);
  }

  // Legend
  const legend = document.createElement('div');
  legend.className = 'overlap-legend';
  legend.innerHTML = `
    <div class="legend-item"><div class="legend-swatch swatch-free"></div> Not free</div>
    <div class="legend-item"><div class="legend-swatch swatch-mine"></div> You're free</div>
    <div class="legend-item"><div class="legend-swatch swatch-overlap"></div> Everyone's free</div>
  `;
  container.appendChild(legend);

  // Build overlap lookup
  const overlapSet = new Set();
  if (overlapData.success && overlapData.overlap) {
    overlapData.overlap.forEach(slot => {
      for (let h = slot.start_hour; h < slot.end_hour; h++) {
        overlapSet.add(`${slot.weekday}-${h}`);
      }
    });
  }

  // Grid
  const gridWrap = document.createElement('div');
  gridWrap.className = 'grid-container';

  const grid = document.createElement('div');
  grid.className = 'time-grid';

  // Header
  const corner = document.createElement('div');
  corner.className = 'grid-header time-col';
  grid.appendChild(corner);
  DAYS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'grid-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  // Rows
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const label = document.createElement('div');
    label.className = 'grid-cell time-label';
    label.textContent = formatHour(h);
    grid.appendChild(label);

    for (let d = 0; d < 7; d++) {
      const key = `${d}-${h}`;
      const cell = document.createElement('div');
      if (overlapSet.has(key)) {
        cell.className = 'grid-cell slot overlap';
        cell.title = `${DAYS_FULL[d]} ${formatHour(h)}–${formatHour(h+1)}: Everyone free!`;
      } else if (state.availability.has(key)) {
        cell.className = 'grid-cell slot selected';
        cell.title = `${DAYS_FULL[d]} ${formatHour(h)}–${formatHour(h+1)}: You're free`;
      } else {
        cell.className = 'grid-cell slot';
      }
      grid.appendChild(cell);
    }
  }

  gridWrap.appendChild(grid);
  container.appendChild(gridWrap);

  // Summary list of overlap blocks
  if (overlapData.success && overlapData.overlap && overlapData.overlap.length > 0) {
    const summary = document.createElement('div');
    summary.style.marginTop = '24px';
    summary.innerHTML = '<h4 style="margin-bottom:12px;font-size:0.95rem;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.06em;">Shared windows</h4>';
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '8px';

    overlapData.overlap.forEach(slot => {
      const tag = document.createElement('div');
      tag.style.cssText = 'background:rgba(0,201,167,0.12);border:1px solid rgba(0,201,167,0.3);border-radius:8px;padding:8px 14px;font-size:0.85rem;';
      tag.innerHTML = `<strong style="color:var(--teal)">${DAYS_FULL[slot.weekday]}</strong> <span style="color:var(--text-mute)">${formatHour(slot.start_hour)} – ${formatHour(slot.end_hour)}</span>`;
      list.appendChild(tag);
    });
    summary.appendChild(list);
    container.appendChild(summary);
  } else if (overlapData.success && overlapData.overlap?.length === 0 && overlapData.members_with_data >= overlapData.total_members) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:32px;color:var(--text-mute);font-size:0.9rem;';
    empty.innerHTML = '😅 No overlapping free slots found. Try expanding your availability!';
    container.appendChild(empty);
  }
}

// ── Utilities ─────────────────────────────────
function formatHour(h) {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Invite code copied!')).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Invite code copied!');
  });
}

// ── DOM Wiring ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Auth
  initAuth();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Nav items
  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.panel));
  });

  // Save availability
  document.getElementById('btn-save-availability').addEventListener('click', saveAvailability);

  // Create group
  document.getElementById('btn-open-create').addEventListener('click', () => {
    document.getElementById('new-group-name').value = '';
    showModal('modal-create-group');
  });
  document.getElementById('btn-create-group').addEventListener('click', createGroup);
  document.getElementById('new-group-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createGroup();
  });

  // Join group
  document.getElementById('btn-open-join').addEventListener('click', () => {
    document.getElementById('join-code').value = '';
    showModal('modal-join-group');
  });
  document.getElementById('btn-join-group').addEventListener('click', joinGroup);
  document.getElementById('join-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinGroup();
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Copy invite code
  document.getElementById('group-invite-code').addEventListener('click', function() {
    copyToClipboard(this.textContent);
  });

  // Check session on load
  checkSession();
});
