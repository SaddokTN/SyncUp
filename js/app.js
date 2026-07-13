/* ============================================
   SyncUp — Main Application JS
   Handles: auth, availability grid, groups, overlap, i18n
   ============================================ */

const API = {
  auth:         'api/auth.php',
  availability: 'api/availability.php',
  groups:       'api/groups.php',
};

const START_HOUR = 6;
const END_HOUR   = 23; // display up to 11 PM, cells cover 6:00–22:59

// ── Translations ──────────────────────────────
// Plain strings are looked up with t('key'). Values that are functions take
// arguments and are looked up with tf('key', ...args) — used for messages
// that need a name/number plugged in, since English and French don't always
// put the pieces in the same order or pluralize the same way.
const I18N = {
  en: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    tagline: 'Find the times that work for everyone',
    tabSignIn: 'Sign in',
    tabCreateAccount: 'Create account',
    labelUsername: 'Username',
    labelPassword: 'Password',
    labelDisplayName: 'Display name',
    labelEmail: 'Email',
    minChars: '(min. 6 chars)',
    btnSignIn: 'Sign in',
    btnCreateAccount: 'Create account',
    btnSignOut: 'Sign out',
    sectionMe: 'Me',
    navAvailability: 'My availability',
    navAccount: 'Account',
    sectionGroups: 'Groups',
    navNewGroup: 'New group',
    navJoinCode: 'Join with code',
    availTitle: 'My availability',
    availDesc: "Click cells to mark when you're free (6 AM – 11 PM). Your friends will see overlaps.",
    btnSaveAvailability: 'Save availability',
    savingText: 'Saving…',
    groupDefaultTitle: 'Group',
    inviteCodeLabel: 'Invite code:',
    clickToCopy: 'Click to copy',
    btnLeaveGroup: 'Leave group',
    btnDeleteGroup: 'Delete group',
    removeFromGroup: 'Remove from group',
    legendNotFree: 'Not free',
    legendYouFree: "You're free",
    legendEveryoneFree: "Everyone's free",
    sharedWindows: 'Shared windows',
    noOverlap: 'No overlapping free slots found. Try expanding your availability!',
    accountTitle: 'Account',
    accountDesc: 'Update your info, or permanently delete your account.',
    btnSaveChanges: 'Save changes',
    dangerZone: 'Danger zone',
    dangerZoneDesc: "Deleting your account removes your availability and group memberships for good. Any group you created is handed to another member, or deleted if you're the only one in it.",
    btnDeleteAccount: 'Delete my account',
    modalCreateGroupTitle: 'Create a group',
    labelGroupName: 'Group name',
    btnCancel: 'Cancel',
    btnCreateGroup: 'Create group',
    modalJoinGroupTitle: 'Join a group',
    labelInviteCode: 'Invite code',
    btnJoinGroup: 'Join group',
    modalDeleteAccountTitle: 'Delete your account?',
    deleteAccountWarning: "This permanently deletes your account and can't be undone. Enter your password to confirm.",
    btnDeleteAccountConfirm: 'Delete account',
    enterPasswordConfirm: 'Enter your password to confirm',
    accountUpdated: 'Account updated',
    accountDeleted: 'Account deleted',
    inviteCopied: 'Invite code copied!',
    savedBlocks:        n => `Saved ${n} time block${n !== 1 ? 's' : ''}`,
    groupCreated:        (name, code) => `Group "${name}" created! Code: ${code}`,
    joinedGroup:          name => `Joined "${name}"!`,
    leftGroup:            name => `Left "${name}"`,
    groupDeletedMsg:      name => `"${name}" deleted`,
    removedMember:        name => `Removed ${name}`,
    confirmLeave:         name => `Leave "${name}"? You can rejoin later with the invite code.`,
    confirmDeleteGroup:   name => `Delete "${name}"? This removes it for every member and can't be undone.`,
    confirmKick:          (member, group) => `Remove ${member} from "${group}"?`,
    membersProgress:      (withN, total) => `<strong>${withN} of ${total} members</strong> have added their availability. Waiting on the rest to see full overlap.`,
    membersComplete:      (total, count) => `All <strong>${total} members</strong> have set their availability. Found <strong>${count} shared time block${count !== 1 ? 's' : ''}</strong>.`,
  },
  fr: {
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    daysFull: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    tagline: 'Trouvez les moments qui conviennent à tout le monde',
    tabSignIn: 'Connexion',
    tabCreateAccount: 'Créer un compte',
    labelUsername: "Nom d'utilisateur",
    labelPassword: 'Mot de passe',
    labelDisplayName: 'Nom affiché',
    labelEmail: 'E-mail',
    minChars: '(6 caractères min.)',
    btnSignIn: 'Se connecter',
    btnCreateAccount: 'Créer un compte',
    btnSignOut: 'Déconnexion',
    sectionMe: 'Moi',
    navAvailability: 'Mes disponibilités',
    navAccount: 'Compte',
    sectionGroups: 'Groupes',
    navNewGroup: 'Nouveau groupe',
    navJoinCode: 'Rejoindre avec un code',
    availTitle: 'Mes disponibilités',
    availDesc: 'Cliquez sur les cases pour indiquer vos disponibilités (6 h – 23 h). Vos amis verront les chevauchements.',
    btnSaveAvailability: 'Enregistrer',
    savingText: 'Enregistrement…',
    groupDefaultTitle: 'Groupe',
    inviteCodeLabel: "Code d'invitation :",
    clickToCopy: 'Cliquez pour copier',
    btnLeaveGroup: 'Quitter le groupe',
    btnDeleteGroup: 'Supprimer le groupe',
    removeFromGroup: 'Retirer du groupe',
    legendNotFree: 'Indisponible',
    legendYouFree: 'Vous êtes disponible',
    legendEveryoneFree: 'Tout le monde est disponible',
    sharedWindows: 'Créneaux communs',
    noOverlap: "Aucun créneau commun trouvé. Essayez d'élargir vos disponibilités !",
    accountTitle: 'Compte',
    accountDesc: 'Modifiez vos informations ou supprimez définitivement votre compte.',
    btnSaveChanges: 'Enregistrer les modifications',
    dangerZone: 'Zone de danger',
    dangerZoneDesc: "La suppression de votre compte efface définitivement vos disponibilités et vos adhésions aux groupes. Tout groupe que vous avez créé est transmis à un autre membre, ou supprimé si vous en êtes le seul membre.",
    btnDeleteAccount: 'Supprimer mon compte',
    modalCreateGroupTitle: 'Créer un groupe',
    labelGroupName: 'Nom du groupe',
    btnCancel: 'Annuler',
    btnCreateGroup: 'Créer le groupe',
    modalJoinGroupTitle: 'Rejoindre un groupe',
    labelInviteCode: "Code d'invitation",
    btnJoinGroup: 'Rejoindre',
    modalDeleteAccountTitle: 'Supprimer votre compte ?',
    deleteAccountWarning: 'Cette action supprime définitivement votre compte et ne peut pas être annulée. Entrez votre mot de passe pour confirmer.',
    btnDeleteAccountConfirm: 'Supprimer le compte',
    enterPasswordConfirm: 'Entrez votre mot de passe pour confirmer',
    accountUpdated: 'Compte mis à jour',
    accountDeleted: 'Compte supprimé',
    inviteCopied: "Code d'invitation copié !",
    savedBlocks:        n => `${n} créneau${n !== 1 ? 'x' : ''} enregistré${n !== 1 ? 's' : ''}`,
    groupCreated:        (name, code) => `Groupe « ${name} » créé ! Code : ${code}`,
    joinedGroup:          name => `Vous avez rejoint « ${name} » !`,
    leftGroup:            name => `Vous avez quitté « ${name} »`,
    groupDeletedMsg:      name => `« ${name} » supprimé`,
    removedMember:        name => `${name} a été retiré du groupe`,
    confirmLeave:         name => `Quitter « ${name} » ? Vous pourrez rejoindre plus tard avec le code d'invitation.`,
    confirmDeleteGroup:   name => `Supprimer « ${name} » ? Cela le supprime pour tous les membres et c'est irréversible.`,
    confirmKick:          (member, group) => `Retirer ${member} de « ${group} » ?`,
    membersProgress:      (withN, total) => `<strong>${withN} membre${withN !== 1 ? 's' : ''} sur ${total}</strong> ont ajouté leurs disponibilités. En attente des autres pour voir tous les chevauchements.`,
    membersComplete:      (total, count) => `Les <strong>${total} membres</strong> ont indiqué leurs disponibilités. <strong>${count} créneau${count !== 1 ? 'x' : ''} commun${count !== 1 ? 's' : ''}</strong> trouvé${count !== 1 ? 's' : ''}.`,
  },
};

// Known server-side error strings, translated by exact match. Anything not
// in this list (rare validation edge cases) just falls back to English
// rather than showing a broken/missing translation.
const ERROR_FR = {
  'All fields are required': 'Tous les champs sont obligatoires',
  'Invalid email address': 'Adresse e-mail invalide',
  'Password must be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères',
  'Username must be 3–30 alphanumeric characters or underscores': "Le nom d'utilisateur doit contenir 3 à 30 caractères alphanumériques ou underscores",
  'Username or email already taken': "Ce nom d'utilisateur ou cet e-mail est déjà utilisé",
  'Invalid username or password': "Nom d'utilisateur ou mot de passe invalide",
  'Username and password required': "Nom d'utilisateur et mot de passe requis",
  'Not authenticated': 'Non authentifié',
  'Enter your password to confirm account deletion': 'Entrez votre mot de passe pour confirmer la suppression du compte',
  'Incorrect password': 'Mot de passe incorrect',
  'Group name is required': 'Le nom du groupe est requis',
  'Invalid invite code': "Code d'invitation invalide",
  'You are already in this group': 'Vous êtes déjà membre de ce groupe',
  'Not a member of this group': "Vous n'êtes pas membre de ce groupe",
  'group_id required': 'Groupe manquant',
  'Group not found': 'Groupe introuvable',
  'As the creator, delete the group instead of leaving, or wait until everyone else has left.':
    'En tant que créateur, supprimez le groupe plutôt que de le quitter, ou attendez que tous les autres membres soient partis.',
  'Only the group creator can delete this group': 'Seul le créateur du groupe peut le supprimer',
  'group_id and user_id required': 'Informations manquantes',
  'Only the group creator can remove members': 'Seul le créateur du groupe peut retirer des membres',
  'Use "Delete group" instead of removing yourself': 'Utilisez « Supprimer le groupe » plutôt que de vous retirer vous-même',
  'That person is not a member of this group': "Cette personne n'est pas membre de ce groupe",
};

let lang = localStorage.getItem('syncup_lang')
  || (navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en');

function applyViewportSafeArea() {
  const root = document.documentElement;
  const safeAreaBottom = window.CSS?.supports('padding-bottom: env(safe-area-inset-bottom)')
    ? 'env(safe-area-inset-bottom)'
    : '0px';
  root.style.setProperty('--safe-area-bottom', safeAreaBottom);
}

window.addEventListener('resize', applyViewportSafeArea);
window.addEventListener('orientationchange', applyViewportSafeArea);
applyViewportSafeArea();

function getTranslation(key) {
  return I18N[lang]?.[key] ?? I18N.en[key];
}

function t(key) {
  const val = getTranslation(key);
  return typeof val === 'string' ? val : (val ?? key);
}

function tf(key, ...args) {
  const fn = getTranslation(key);
  return typeof fn === 'function' ? fn(...args) : String(fn ?? key);
}

function currentDays() { return getTranslation('days') ?? I18N.en.days; }
function currentDaysFull() { return getTranslation('daysFull') ?? I18N.en.daysFull; }

function translateError(msg) {
  return (lang === 'fr' && ERROR_FR[msg]) ? ERROR_FR[msg] : msg;
}

function applyStaticTranslations() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

function setLanguage(newLang) {
  if (newLang === lang) return;
  lang = newLang;
  localStorage.setItem('syncup_lang', lang);
  applyStaticTranslations();
  // Re-render whatever's currently on screen so it picks up the new language
  if (state.user) {
    renderAvailabilityGrid();
    if (state.activeGroup) openGroup(state.activeGroup);
  }
}

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
  document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const nav = document.querySelector(`[data-panel="${id}"]`);
  if (nav) nav.classList.add('active');
}

// ── Auth ──────────────────────────────────────
function initAuth() {
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.panel));
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.panel));
  });

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
      errEl.textContent = translateError(data.error);
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
      errEl.textContent = translateError(data.error);
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
  populateAccountForm();

  // Load availability & groups in parallel
  const [avail, groups] = await Promise.all([
    api(API.availability, { action: 'get' }),
    api(API.groups, { action: 'list' }),
  ]);

  if (avail.success) {
    // Convert slot ranges (start_hour..end_hour) into individual hour cells
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

  // Header row: blank corner + one range label per hour column
  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let h = START_HOUR; h < END_HOUR; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'grid-hour-label';
    hEl.textContent = formatHourRange(h);
    grid.appendChild(hEl);
  }

  // One row per day
  for (let d = 0; d < 7; d++) {
    const dayLabel = document.createElement('div');
    dayLabel.className = 'grid-day-label';
    dayLabel.textContent = currentDays()[d];
    grid.appendChild(dayLabel);

    for (let h = START_HOUR; h < END_HOUR; h++) {
      const key = `${d}-${h}`;
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (state.availability.has(key) ? ' selected' : '');
      cell.dataset.key = key;
      cell.title = `${currentDaysFull()[d]}, ${formatHour(h)} – ${formatHour(h + 1)}`;
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
  wireDragSelect(grid);
}

// Lets you toggle cells three ways: a single click, or a click-and-drag to
// paint a whole range at once (mouse only — on touch, dragging is reserved
// for horizontally scrolling through the hours, so a touch only toggles a
// cell if it didn't move, i.e. a genuine tap rather than a swipe).
// State lives outside the function so re-renders (e.g. logging out and back
// in) don't stack up duplicate window-level listeners.
const dragState = { mouseDragging: false, mouseMode: true, touchStart: null };
let dragListenersWired = false;

function wireDragSelect(grid) {
  function setCell(el, on) {
    if (!el || !el.classList.contains('grid-cell')) return;
    const key = el.dataset.key;
    if (on) {
      state.availability.add(key);
      el.classList.add('selected');
    } else {
      state.availability.delete(key);
      el.classList.remove('selected');
    }
  }

  grid.addEventListener('pointerdown', e => {
    const el = e.target.closest('.grid-cell');
    if (!el) return;

    if (e.pointerType === 'mouse') {
      dragState.mouseDragging = true;
      dragState.mouseMode = !state.availability.has(el.dataset.key);
      setCell(el, dragState.mouseMode);
      e.preventDefault();
    } else {
      dragState.touchStart = { x: e.clientX, y: e.clientY, el };
    }
  });

  if (dragListenersWired) return;
  dragListenersWired = true;

  window.addEventListener('pointermove', e => {
    if (!dragState.mouseDragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) setCell(el.closest('.grid-cell'), dragState.mouseMode);
  });

  window.addEventListener('pointerup', e => {
    dragState.mouseDragging = false;
    if (dragState.touchStart) {
      const moved = Math.hypot(e.clientX - dragState.touchStart.x, e.clientY - dragState.touchStart.y);
      if (moved < 10) {
        setCell(dragState.touchStart.el, !state.availability.has(dragState.touchStart.el.dataset.key));
      }
      dragState.touchStart = null;
    }
  });

  window.addEventListener('pointercancel', () => {
    dragState.mouseDragging = false;
    dragState.touchStart = null;
  });
}

async function saveAvailability() {
  const btn = document.getElementById('btn-save-availability');
  btn.disabled = true;
  btn.textContent = t('savingText');

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
  btn.textContent = t('btnSaveAvailability');
  if (data.success) {
    toast(tf('savedBlocks', data.saved));
  } else {
    toast(translateError(data.error), 'error');
  }
}

// ── Account ───────────────────────────────────
function populateAccountForm() {
  document.getElementById('account-name').value     = state.user.display_name || '';
  document.getElementById('account-username').value = state.user.username || '';
  document.getElementById('account-email').value     = state.user.email || '';
}

async function saveAccount() {
  const errEl = document.getElementById('account-error');
  errEl.textContent = '';

  const payload = {
    display_name: document.getElementById('account-name').value.trim(),
    username:     document.getElementById('account-username').value.trim(),
    email:        document.getElementById('account-email').value.trim(),
  };

  const data = await api(API.auth, { action: 'update' }, payload);
  if (data.success) {
    state.user = data.user;
    document.getElementById('header-username').textContent = state.user.display_name;
    toast(t('accountUpdated'));
  } else {
    errEl.textContent = translateError(data.error);
  }
}

async function deleteAccount() {
  const errEl    = document.getElementById('delete-account-error');
  const password = document.getElementById('delete-account-password').value;
  errEl.textContent = '';

  if (!password) { errEl.textContent = t('enterPasswordConfirm'); return; }

  const data = await api(API.auth, { action: 'delete' }, { password });
  if (data.success) {
    hideModal('modal-delete-account');
    toast(t('accountDeleted'));
    state = { user: null, availability: new Set(), groups: [], activeGroup: null };
    document.getElementById('page-app').classList.remove('active');
    document.getElementById('page-auth').classList.add('active');
    document.getElementById('app-header').style.display = 'none';
  } else {
    errEl.textContent = translateError(data.error);
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
    toast(tf('groupCreated', data.group.name, data.group.invite_code));
    openGroup(state.groups[0]);
  } else {
    toast(translateError(data.error), 'error');
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
    toast(tf('joinedGroup', data.group.name));
    const joined = state.groups.find(g => g.id === data.group.id);
    if (joined) openGroup(joined);
  } else {
    toast(translateError(data.error), 'error');
  }
}

async function leaveGroup() {
  const group = state.activeGroup;
  if (!group) return;
  if (!confirm(tf('confirmLeave', group.name))) return;

  const data = await api(API.groups, { action: 'leave' }, { group_id: group.id });
  if (data.success) {
    state.groups = state.groups.filter(g => g.id !== group.id);
    state.activeGroup = null;
    renderGroupsSidebar();
    setPanel('panel-availability');
    toast(tf('leftGroup', group.name));
  } else {
    toast(translateError(data.error), 'error');
  }
}

async function deleteGroup() {
  const group = state.activeGroup;
  if (!group) return;
  if (!confirm(tf('confirmDeleteGroup', group.name))) return;

  const data = await api(API.groups, { action: 'delete' }, { group_id: group.id });
  if (data.success) {
    state.groups = state.groups.filter(g => g.id !== group.id);
    state.activeGroup = null;
    renderGroupsSidebar();
    setPanel('panel-availability');
    toast(tf('groupDeletedMsg', group.name));
  } else {
    toast(translateError(data.error), 'error');
  }
}

async function kickMember(group, member) {
  if (!confirm(tf('confirmKick', member.display_name, group.name))) return;

  const data = await api(API.groups, { action: 'kick' }, { group_id: group.id, user_id: member.id });
  if (data.success) {
    toast(tf('removedMember', member.display_name));
    openGroup(group); // refresh members + overlap
  } else {
    toast(translateError(data.error), 'error');
  }
}

async function openGroup(group) {
  state.activeGroup = group;

  // Update sidebar active state (re-render instead of touching the global
  // `event` object, which isn't reliably available in every browser)
  renderGroupsSidebar();

  setPanel('panel-group');

  const titleEl = document.getElementById('group-title');
  titleEl.textContent = group.name;

  const codeEl = document.getElementById('group-invite-code');
  codeEl.textContent = group.invite_code;
  codeEl.title = t('clickToCopy');

  // Creators delete the group instead of leaving it — show only the
  // button that applies to this user.
  const isOwner = Number(group.owner_id) === Number(state.user.id);
  document.getElementById('btn-leave-group').style.display  = isOwner ? 'none' : 'inline-flex';
  document.getElementById('btn-delete-group').style.display = isOwner ? 'inline-flex' : 'none';

  // Show loading
  document.getElementById('group-content').innerHTML = '<div class="spinner"></div>';

  // Fetch members + overlap
  const [membersData, overlapData] = await Promise.all([
    api(API.groups, { action: 'members', group_id: group.id }),
    api(API.groups, { action: 'overlap', group_id: group.id }),
  ]);

  if (!membersData.success) { toast(translateError(membersData.error), 'error'); return; }

  state.overlapData = overlapData;

  renderGroupPanel(group, membersData.members, overlapData);
}

function renderGroupPanel(group, members, overlapData) {
  const container = document.getElementById('group-content');
  container.innerHTML = '';

  // Members chips
  const isOwner = Number(group.owner_id) === Number(state.user.id);
  const membersDiv = document.createElement('div');
  membersDiv.className = 'members-list';
  members.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'member-chip';
    // Spread the string instead of using display_name[0] so multi-byte
    // characters (e.g. emoji) aren't cut in half, then escape before insertion.
    const initial = [...m.display_name][0]?.toUpperCase() ?? '?';
    const canKick = isOwner && Number(m.id) !== Number(state.user.id);
    chip.innerHTML = `
      <div class="member-avatar">${escHtml(initial)}</div>
      <span>${escHtml(m.display_name)}</span>
      ${canKick ? `<button class="chip-remove" title="${escHtml(t('removeFromGroup'))}">✕</button>` : ''}
    `;
    if (canKick) {
      chip.querySelector('.chip-remove').addEventListener('click', () => kickMember(group, m));
    }
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
      info.innerHTML = tf('membersProgress', withData, total);
    } else {
      const count = overlapData.overlap?.length ?? 0;
      info.innerHTML = tf('membersComplete', total, count);
    }
    container.appendChild(info);
  }

  // Legend
  const legend = document.createElement('div');
  legend.className = 'overlap-legend';
  legend.innerHTML = `
    <div class="legend-item"><div class="legend-swatch swatch-free"></div> ${escHtml(t('legendNotFree'))}</div>
    <div class="legend-item"><div class="legend-swatch swatch-mine"></div> ${escHtml(t('legendYouFree'))}</div>
    <div class="legend-item"><div class="legend-swatch swatch-overlap"></div> ${escHtml(t('legendEveryoneFree'))}</div>
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

  // Header row: blank corner + one range label per hour column
  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let h = START_HOUR; h < END_HOUR; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'grid-hour-label';
    hEl.textContent = formatHourRange(h);
    grid.appendChild(hEl);
  }

  // One row per day
  for (let d = 0; d < 7; d++) {
    const dayLabel = document.createElement('div');
    dayLabel.className = 'grid-day-label';
    dayLabel.textContent = currentDays()[d];
    grid.appendChild(dayLabel);

    for (let h = START_HOUR; h < END_HOUR; h++) {
      const key = `${d}-${h}`;
      const cell = document.createElement('div');
      if (overlapSet.has(key)) {
        cell.className = 'grid-cell overlap';
        cell.title = `${currentDaysFull()[d]}, ${formatHour(h)} – ${formatHour(h + 1)}: ${t('legendEveryoneFree').toLowerCase()}`;
      } else if (state.availability.has(key)) {
        cell.className = 'grid-cell selected';
        cell.title = `${currentDaysFull()[d]}, ${formatHour(h)} – ${formatHour(h + 1)}: ${t('legendYouFree').toLowerCase()}`;
      } else {
        cell.className = 'grid-cell';
        cell.title = `${currentDaysFull()[d]}, ${formatHour(h)} – ${formatHour(h + 1)}`;
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
    summary.innerHTML = `<h4 style="margin-bottom:12px;font-size:0.95rem;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.06em;">${escHtml(t('sharedWindows'))}</h4>`;
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '8px';

    overlapData.overlap.forEach(slot => {
      const tag = document.createElement('div');
      tag.style.cssText = 'background:rgba(0,201,167,0.12);border:1px solid rgba(0,201,167,0.3);border-radius:8px;padding:8px 14px;font-size:0.85rem;';
      tag.innerHTML = `<strong style="color:var(--teal)">${escHtml(currentDaysFull()[slot.weekday])}</strong> <span style="color:var(--text-mute)">${formatHour(slot.start_hour)} – ${formatHour(slot.end_hour)}</span>`;
      list.appendChild(tag);
    });
    summary.appendChild(list);
    container.appendChild(summary);
  } else if (overlapData.success && overlapData.overlap?.length === 0 && overlapData.members_with_data >= overlapData.total_members) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:32px;color:var(--text-mute);font-size:0.9rem;';
    empty.innerHTML = `😅 ${escHtml(t('noOverlap'))}`;
    container.appendChild(empty);
  }
}

// ── Utilities ─────────────────────────────────
function formatHour(h) {
  const hh = h === 24 ? 0 : h;
  if (lang === 'fr') return `${hh} h`;
  if (hh === 0) return '12 AM';
  if (hh === 12) return '12 PM';
  return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
}

function formatHourRange(h) {
  return `${h} - ${h + 1}`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('inviteCopied'))).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast(t('inviteCopied'));
  });
}

// ── DOM Wiring ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply the saved/detected language right away, before anything else, so
  // the login screen itself shows up in the right language.
  applyStaticTranslations();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

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

  // Leave / delete group
  document.getElementById('btn-leave-group').addEventListener('click', leaveGroup);
  document.getElementById('btn-delete-group').addEventListener('click', deleteGroup);

  // Account: save changes
  document.getElementById('btn-save-account').addEventListener('click', saveAccount);

  // Account: delete (opens password-confirmation modal)
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    document.getElementById('delete-account-password').value = '';
    document.getElementById('delete-account-error').textContent = '';
    showModal('modal-delete-account');
  });
  document.getElementById('btn-confirm-delete-account').addEventListener('click', deleteAccount);
  document.getElementById('delete-account-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') deleteAccount();
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
