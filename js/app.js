/* ============================================
   SyncUp — Main Application JS (v2)
   Adds: CSRF tokens, timezone-aware grid, password reset,
   ownership transfer, debounced autosave.
   ============================================ */

const API = {
  auth:         'api/auth.php',
  availability: 'api/availability.php',
  groups:       'api/groups.php',
};

const START_HOUR = 6;   // grid is rendered in the user's LOCAL time.
const END_HOUR   = 23;  // 6 AM-11 PM window — see README for the tradeoff:
                         // overlap outside this window is still computed
                         // correctly server-side, just not shown in the UI.

// ── Translations ── (unchanged keys, plus a few new ones for reset/transfer)
const I18N = {
  en: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    tagline: 'Find the times that work for everyone',
    tabSignIn: 'Sign in', tabCreateAccount: 'Create account',
    labelUsername: 'Username', labelPassword: 'Password',
    labelDisplayName: 'Display name', labelEmail: 'Email',
    labelTimezone: 'Timezone',
    minChars: '(min. 8 chars)',
    btnSignIn: 'Sign in', btnCreateAccount: 'Create account', btnSignOut: 'Sign out',
    forgotPassword: 'Forgot password?',
    resetTitle: 'Reset your password', resetDesc: "Enter your email and we'll send a reset link.",
    btnSendReset: 'Send reset link', resetSent: "If that email is registered, we've sent a reset link.",
    sectionMe: 'Me', navAvailability: 'My availability', navAvailabilityShort: 'Availability',
    navAccount: 'Account', navGroupsShort: 'Groups', sectionGroups: 'Groups',
    navNewGroup: 'New group', navJoinCode: 'Join with code',
    availTitle: 'My availability',
    availDesc: "Click cells to mark when you're free. Times shown in your local timezone.",
    btnSaveAvailability: 'Save availability', savingText: 'Saving…', autosavedText: 'All changes saved',
    groupDefaultTitle: 'Group', inviteCodeLabel: 'Invite code:', clickToCopy: 'Click to copy',
    btnLeaveGroup: 'Leave group', btnDeleteGroup: 'Delete group', btnTransferGroup: 'Transfer ownership',
    removeFromGroup: 'Remove from group', makeOwner: 'Make owner',
    legendNotFree: 'Not free', legendYouFree: "You're free", legendEveryoneFree: "Everyone's free",
    sharedWindows: 'Shared windows',
    noOverlap: 'No overlapping free slots found. Try expanding your availability!',
    noGroupsYet: 'Create a group or join with an invite code to get started.',
    accountTitle: 'Account', accountDesc: 'Update your info, or permanently delete your account.',
    btnSaveChanges: 'Save changes', dangerZone: 'Danger zone',
    dangerZoneDesc: "Deleting your account removes your availability and group memberships for good. Any group you created is handed to another member, or deleted if you're the only one in it.",
    btnDeleteAccount: 'Delete my account',
    modalCreateGroupTitle: 'Create a group', labelGroupName: 'Group name', btnCancel: 'Cancel',
    btnCreateGroup: 'Create group', modalJoinGroupTitle: 'Join a group', labelInviteCode: 'Invite code',
    btnJoinGroup: 'Join group', modalDeleteAccountTitle: 'Delete your account?',
    deleteAccountWarning: "This permanently deletes your account and can't be undone. Enter your password to confirm.",
    btnDeleteAccountConfirm: 'Delete account', enterPasswordConfirm: 'Enter your password to confirm',
    accountUpdated: 'Account updated', accountDeleted: 'Account deleted', inviteCopied: 'Invite code copied!',
    transferPrompt: 'Choose a new owner:', btnConfirmTransfer: 'Transfer',
    savedBlocks:        n => `Saved ${n} time block${n !== 1 ? 's' : ''}`,
    groupCreated:        (name, code) => `Group "${name}" created! Code: ${code}`,
    joinedGroup:          name => `Joined "${name}"!`,
    leftGroup:            name => `Left "${name}"`,
    groupDeletedMsg:      name => `"${name}" deleted`,
    removedMember:        name => `Removed ${name}`,
    ownershipTransferred:  name => `${name} is now the group owner`,
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
    tabSignIn: 'Connexion', tabCreateAccount: 'Créer un compte',
    labelUsername: "Nom d'utilisateur", labelPassword: 'Mot de passe',
    labelDisplayName: 'Nom affiché', labelEmail: 'E-mail', labelTimezone: 'Fuseau horaire',
    minChars: '(8 caractères min.)',
    btnSignIn: 'Se connecter', btnCreateAccount: 'Créer un compte', btnSignOut: 'Déconnexion',
    forgotPassword: 'Mot de passe oublié ?',
    resetTitle: 'Réinitialiser le mot de passe', resetDesc: 'Entrez votre e-mail, nous vous enverrons un lien.',
    btnSendReset: 'Envoyer le lien', resetSent: 'Si cet e-mail est enregistré, un lien a été envoyé.',
    sectionMe: 'Moi', navAvailability: 'Mes disponibilités', navAvailabilityShort: 'Disponibilités',
    navAccount: 'Compte', navGroupsShort: 'Groupes', sectionGroups: 'Groupes',
    navNewGroup: 'Nouveau groupe', navJoinCode: 'Rejoindre avec un code',
    availTitle: 'Mes disponibilités',
    availDesc: 'Cliquez sur les cases pour indiquer vos disponibilités. Heures affichées dans votre fuseau local.',
    btnSaveAvailability: 'Enregistrer', savingText: 'Enregistrement…', autosavedText: 'Toutes les modifications sont enregistrées',
    groupDefaultTitle: 'Groupe', inviteCodeLabel: "Code d'invitation :", clickToCopy: 'Cliquez pour copier',
    btnLeaveGroup: 'Quitter le groupe', btnDeleteGroup: 'Supprimer le groupe', btnTransferGroup: 'Transférer la propriété',
    removeFromGroup: 'Retirer du groupe', makeOwner: 'Nommer propriétaire',
    legendNotFree: 'Indisponible', legendYouFree: 'Vous êtes disponible', legendEveryoneFree: 'Tout le monde est disponible',
    sharedWindows: 'Créneaux communs',
    noOverlap: "Aucun créneau commun trouvé. Essayez d'élargir vos disponibilités !",
    noGroupsYet: 'Créez un groupe ou rejoignez-en un avec un code pour commencer.',
    accountTitle: 'Compte', accountDesc: 'Modifiez vos informations ou supprimez définitivement votre compte.',
    btnSaveChanges: 'Enregistrer les modifications', dangerZone: 'Zone de danger',
    dangerZoneDesc: "La suppression de votre compte efface définitivement vos disponibilités et vos adhésions aux groupes. Tout groupe que vous avez créé est transmis à un autre membre, ou supprimé si vous en êtes le seul membre.",
    btnDeleteAccount: 'Supprimer mon compte',
    modalCreateGroupTitle: 'Créer un groupe', labelGroupName: 'Nom du groupe', btnCancel: 'Annuler',
    btnCreateGroup: 'Créer le groupe', modalJoinGroupTitle: 'Rejoindre un groupe', labelInviteCode: "Code d'invitation",
    btnJoinGroup: 'Rejoindre', modalDeleteAccountTitle: 'Supprimer votre compte ?',
    deleteAccountWarning: 'Cette action supprime définitivement votre compte et ne peut pas être annulée. Entrez votre mot de passe pour confirmer.',
    btnDeleteAccountConfirm: 'Supprimer le compte', enterPasswordConfirm: 'Entrez votre mot de passe pour confirmer',
    accountUpdated: 'Compte mis à jour', accountDeleted: 'Compte supprimé', inviteCopied: "Code d'invitation copié !",
    transferPrompt: 'Choisissez un nouveau propriétaire :', btnConfirmTransfer: 'Transférer',
    savedBlocks:        n => `${n} créneau${n !== 1 ? 'x' : ''} enregistré${n !== 1 ? 's' : ''}`,
    groupCreated:        (name, code) => `Groupe « ${name} » créé ! Code : ${code}`,
    joinedGroup:          name => `Vous avez rejoint « ${name} » !`,
    leftGroup:            name => `Vous avez quitté « ${name} »`,
    groupDeletedMsg:      name => `« ${name} » supprimé`,
    removedMember:        name => `${name} a été retiré du groupe`,
    ownershipTransferred:  name => `${name} est maintenant propriétaire du groupe`,
    confirmLeave:         name => `Quitter « ${name} » ? Vous pourrez rejoindre plus tard avec le code d'invitation.`,
    confirmDeleteGroup:   name => `Supprimer « ${name} » ? Cela le supprime pour tous les membres et c'est irréversible.`,
    confirmKick:          (member, group) => `Retirer ${member} de « ${group} » ?`,
    membersProgress:      (withN, total) => `<strong>${withN} membre${withN !== 1 ? 's' : ''} sur ${total}</strong> ont ajouté leurs disponibilités. En attente des autres pour voir tous les chevauchements.`,
    membersComplete:      (total, count) => `Les <strong>${total} membres</strong> ont indiqué leurs disponibilités. <strong>${count} créneau${count !== 1 ? 'x' : ''} commun${count !== 1 ? 's' : ''}</strong> trouvé${count !== 1 ? 's' : ''}.`,
  },
};

const ERROR_FR = {
  'All fields are required': 'Tous les champs sont obligatoires',
  'Invalid email address': 'Adresse e-mail invalide',
  'Password must be at least 8 characters': 'Le mot de passe doit contenir au moins 8 caractères',
  'Password must be at most 72 characters': 'Le mot de passe doit contenir au plus 72 caractères',
  'Email address is too long': "L'adresse e-mail est trop longue",
  'Display name is too long': 'Le nom affiché est trop long',
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
  'Transfer ownership to another member, or delete the group, before leaving.':
    "Transférez la propriété à un autre membre, ou supprimez le groupe, avant de partir.",
  'Only the group creator can delete this group': 'Seul le créateur du groupe peut le supprimer',
  'group_id and user_id required': 'Informations manquantes',
  'Only the group creator can remove members': 'Seul le créateur du groupe peut retirer des membres',
  'Use "Delete group" instead of removing yourself': 'Utilisez « Supprimer le groupe » plutôt que de vous retirer vous-même',
  'That person is not a member of this group': "Cette personne n'est pas membre de ce groupe",
  'Only the current owner can transfer this group': 'Seul le propriétaire actuel peut transférer ce groupe',
  'Too many attempts. Please try again later.': 'Trop de tentatives. Réessayez plus tard.',
  'Account temporarily locked due to failed attempts. Try again later.': 'Compte temporairement verrouillé. Réessayez plus tard.',
  'Invalid or missing CSRF token': 'Session expirée, veuillez rafraîchir la page.',
};

let lang = localStorage.getItem('syncup_lang')
  || (navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en');

function applyViewportSafeArea() {
  const root = document.documentElement;
  const supportsSafeArea = window.CSS?.supports('padding-bottom: env(safe-area-inset-bottom)');
  root.style.setProperty('--safe-area-bottom', supportsSafeArea ? 'env(safe-area-inset-bottom)' : '0px');
  root.style.setProperty('--safe-area-top', supportsSafeArea ? 'env(safe-area-inset-top)' : '0px');
}
window.addEventListener('resize', applyViewportSafeArea);
window.addEventListener('orientationchange', applyViewportSafeArea);
applyViewportSafeArea();

function getTranslation(key) { return I18N[lang]?.[key] ?? I18N.en[key]; }
function t(key) { const val = getTranslation(key); return typeof val === 'string' ? val : (val ?? key); }
function tf(key, ...args) { const fn = getTranslation(key); return typeof fn === 'function' ? fn(...args) : String(fn ?? key); }
function currentDays() { return getTranslation('days') ?? I18N.en.days; }
function currentDaysFull() { return getTranslation('daysFull') ?? I18N.en.daysFull; }
function translateError(msg) { return (lang === 'fr' && ERROR_FR[msg]) ? ERROR_FR[msg] : msg; }

function applyStaticTranslations() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function setAppShellVisible(visible) {
  document.body.classList.toggle('app-active', visible);
  const header = document.getElementById('app-header');
  const mobileNav = document.getElementById('mobile-nav');
  header.style.display = visible ? 'flex' : 'none';
  mobileNav.classList.toggle('visible', visible);
}

let modalReturnFocus = null;
function getFocusableElements(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null || el === document.activeElement);
}
function showModal(id) {
  const overlay = document.getElementById(id);
  modalReturnFocus = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const focusables = getFocusableElements(overlay.querySelector('.modal'));
  (focusables[0] || overlay.querySelector('.modal-close'))?.focus();
}
function hideModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  if (modalReturnFocus?.focus) { modalReturnFocus.focus(); modalReturnFocus = null; }
}

function setLanguage(newLang) {
  if (newLang === lang) return;
  lang = newLang;
  localStorage.setItem('syncup_lang', lang);
  applyStaticTranslations();
  if (state.user) {
    renderAvailabilityGrid();
    if (state.activeGroup) openGroup(state.activeGroup);
  }
}

// ── App State ─────────────────────────────────
let state = {
  user:         null,
  availability: new Set(), // "weekday-hour" keys, in LOCAL time
  groups:       [],
  activeGroup:  null,
  overlapData:  null,
  csrfToken:    null,
};

// ── API helper — now attaches the CSRF token to every mutating request ──
async function api(endpoint, params = {}, body = null) {
  const url = new URL(endpoint, window.location.href);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const opts = { method: body ? 'POST' : 'GET', headers: {}, credentials: 'same-origin' };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    if (state.csrfToken) opts.headers['X-CSRF-Token'] = state.csrfToken;
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (data.csrf_token) state.csrfToken = data.csrf_token;
  return data;
}

async function ensureCsrfToken() {
  if (state.csrfToken) return;
  const data = await api(API.auth, { action: 'csrf' });
  if (data.token) state.csrfToken = data.token;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  document.getElementById(id)?.classList.add('active');
  document.querySelectorAll(`[data-panel="${id}"]`).forEach(nav => {
    nav.classList.add('active');
    if (nav.classList.contains('mobile-nav-item')) nav.setAttribute('aria-current', 'page');
  });
  if (id === 'panel-group') {
    if (!state.activeGroup && state.groups.length > 0) { openGroup(state.groups[0]); return; }
    if (!state.activeGroup) showGroupEmptyState();
  }
}

function showGroupEmptyState() {
  document.getElementById('group-title').textContent = t('groupDefaultTitle');
  document.getElementById('group-invite-code').textContent = '——';
  document.getElementById('group-content').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">👥</div>
      <h3>${escHtml(t('groupDefaultTitle'))}</h3>
      <p>${escHtml(t('noGroupsYet'))}</p>
    </div>`;
}

// ── Auth ──────────────────────────────────────
function switchAuthTab(target) {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    const isActive = tab.dataset.tab === target;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  document.querySelectorAll('.auth-form').forEach(form => { form.hidden = form.id !== `form-${target}`; });
}

function initAuth() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  document.getElementById('btn-register').addEventListener('click', async () => {
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    await ensureCsrfToken();
    const payload = {
      username:     document.getElementById('reg-username').value.trim(),
      display_name: document.getElementById('reg-name').value.trim(),
      email:        document.getElementById('reg-email').value.trim(),
      password:     document.getElementById('reg-password').value,
      timezone:     detectBrowserTimezone(),
    };
    const data = await api(API.auth, { action: 'register' }, payload);
    if (data.success) { state.user = data.user; enterApp(); }
    else errEl.textContent = translateError(data.error);
  });

  document.getElementById('btn-login').addEventListener('click', async () => {
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    await ensureCsrfToken();
    const payload = {
      username: document.getElementById('login-username').value.trim(),
      password: document.getElementById('login-password').value,
    };
    const data = await api(API.auth, { action: 'login' }, payload);
    if (data.success) { state.user = data.user; enterApp(); }
    else errEl.textContent = translateError(data.error);
  });

  // Forgot password
  document.getElementById('btn-forgot-password').addEventListener('click', () => {
    document.getElementById('reset-email').value = '';
    document.getElementById('reset-request-msg').textContent = '';
    showModal('modal-reset-password');
  });
  document.getElementById('btn-send-reset').addEventListener('click', async () => {
    const email = document.getElementById('reset-email').value.trim();
    const msgEl = document.getElementById('reset-request-msg');
    if (!email) return;
    await ensureCsrfToken();
    await api(API.auth, { action: 'request-reset' }, { email });
    // Always show the same message — the endpoint never reveals whether
    // the email exists, so the UI shouldn't either.
    msgEl.textContent = t('resetSent');
  });
}

async function checkSession() {
  await ensureCsrfToken();
  const data = await api(API.auth, { action: 'me' });
  if (data.success && data.user) { state.user = data.user; enterApp(); }
  else {
    document.getElementById('page-auth').classList.add('active');
    setAppShellVisible(false);
  }
}

async function logout() {
  await api(API.auth, { action: 'logout' }, {});
  state = { user: null, availability: new Set(), groups: [], activeGroup: null, csrfToken: null };
  document.getElementById('page-app').classList.remove('active');
  document.getElementById('page-auth').classList.add('active');
  setAppShellVisible(false);
  await ensureCsrfToken();
}

// ── App Init ──────────────────────────────────
async function enterApp() {
  document.getElementById('page-auth').classList.remove('active');
  document.getElementById('page-app').classList.add('active');
  setAppShellVisible(true);
  document.getElementById('header-username').textContent = state.user.display_name;
  populateAccountForm();

  const [avail, groups] = await Promise.all([
    api(API.availability, { action: 'get' }),
    api(API.groups, { action: 'list' }),
  ]);

  if (avail.success) {
    // Convert UTC slot ranges from the server into LOCAL hour cells for display.
    state.availability = new Set();
    const tz = state.user.timezone || 'UTC';
    avail.slots.forEach(s => {
      for (let h = s.start_hour; h < s.end_hour; h++) {
        const local = utcToLocal(s.weekday, h, tz);
        state.availability.add(`${local.weekday}-${local.hour}`);
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

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let h = START_HOUR; h < END_HOUR; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'grid-hour-label';
    hEl.textContent = formatHourRange(h);
    grid.appendChild(hEl);
  }

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
      cell.setAttribute('role', 'button');
      cell.tabIndex = 0;
      const label = `${currentDaysFull()[d]}, ${formatHour(h)} – ${formatHour(h + 1)}`;
      cell.setAttribute('aria-label', label);
      cell.setAttribute('aria-pressed', String(state.availability.has(key)));
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
  wireDragSelect(grid);
}

const dragState = { mouseDragging: false, mouseMode: true, touchStart: null };
let dragListenersWired = false;
let autosaveTimer = null;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  const statusEl = document.getElementById('autosave-status');
  if (statusEl) statusEl.textContent = '';
  autosaveTimer = setTimeout(() => saveAvailability(true), 2000);
}

function wireDragSelect(grid) {
  function setCell(el, on) {
    if (!el || !el.classList.contains('grid-cell')) return;
    const key = el.dataset.key;
    if (on) { state.availability.add(key); el.classList.add('selected'); }
    else { state.availability.delete(key); el.classList.remove('selected'); }
    el.setAttribute('aria-pressed', String(on));
    scheduleAutosave();
  }
  function toggleCell(el) { if (!el) return; setCell(el, !state.availability.has(el.dataset.key)); }

  grid.addEventListener('keydown', e => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCell(cell); }
  });

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
      if (moved < 10) setCell(dragState.touchStart.el, !state.availability.has(dragState.touchStart.el.dataset.key));
      dragState.touchStart = null;
    }
  });

  window.addEventListener('pointercancel', () => { dragState.mouseDragging = false; dragState.touchStart = null; });
}

async function saveAvailability(isAutosave = false) {
  const btn = document.getElementById('btn-save-availability');
  const statusEl = document.getElementById('autosave-status');
  if (!isAutosave) { btn.disabled = true; btn.textContent = t('savingText'); }

  const tz = state.user.timezone || 'UTC';
  // Convert LOCAL cells to UTC before sending, then compress into ranges.
  const byDay = {};
  state.availability.forEach(key => {
    const [d, h] = key.split('-').map(Number);
    const utc = localToUtc(d, h, tz);
    if (!byDay[utc.weekday]) byDay[utc.weekday] = [];
    byDay[utc.weekday].push(utc.hour);
  });

  const slots = [];
  Object.entries(byDay).forEach(([d, hours]) => {
    hours = [...new Set(hours)].sort((a, b) => a - b);
    let start = hours[0], prev = hours[0];
    for (let i = 1; i <= hours.length; i++) {
      if (i < hours.length && hours[i] === prev + 1) { prev = hours[i]; }
      else {
        slots.push({ weekday: parseInt(d), start_hour: start, end_hour: prev + 1 });
        if (i < hours.length) { start = hours[i]; prev = hours[i]; }
      }
    }
  });

  const data = await api(API.availability, { action: 'save' }, { slots });
  if (!isAutosave) { btn.disabled = false; btn.textContent = t('btnSaveAvailability'); }
  if (data.success) {
    if (isAutosave) { if (statusEl) statusEl.textContent = t('autosavedText'); }
    else toast(tf('savedBlocks', data.saved));
  } else {
    toast(translateError(data.error), 'error');
  }
}

// ── Account ───────────────────────────────────
function populateAccountForm() {
  document.getElementById('account-name').value     = state.user.display_name || '';
  document.getElementById('account-username').value = state.user.username || '';
  document.getElementById('account-email').value     = state.user.email || '';
  const tzSelect = document.getElementById('account-timezone');
  if (tzSelect) populateTimezoneOptions(tzSelect, state.user.timezone);
}

function populateTimezoneOptions(selectEl, selected) {
  if (selectEl.dataset.populated) { selectEl.value = selected; return; }
  const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [detectBrowserTimezone()]);
  selectEl.innerHTML = zones.map(z => `<option value="${escAttr(z)}">${escHtml(z)}</option>`).join('');
  selectEl.value = selected || detectBrowserTimezone();
  selectEl.dataset.populated = '1';
}

async function saveAccount() {
  const errEl = document.getElementById('account-error');
  errEl.textContent = '';
  const payload = {
    display_name: document.getElementById('account-name').value.trim(),
    username:     document.getElementById('account-username').value.trim(),
    email:        document.getElementById('account-email').value.trim(),
    timezone:     document.getElementById('account-timezone')?.value || state.user.timezone,
  };
  const timezoneChanged = payload.timezone !== state.user.timezone;
  const data = await api(API.auth, { action: 'update' }, payload);
  if (data.success) {
    state.user = data.user;
    document.getElementById('header-username').textContent = state.user.display_name;
    toast(t('accountUpdated'));
    // Re-render the grid in the new timezone so cells line up correctly.
    if (timezoneChanged) {
      const reload = await api(API.availability, { action: 'get' });
      if (reload.success) {
        state.availability = new Set();
        reload.slots.forEach(s => {
          for (let h = s.start_hour; h < s.end_hour; h++) {
            const local = utcToLocal(s.weekday, h, state.user.timezone);
            state.availability.add(`${local.weekday}-${local.hour}`);
          }
        });
        renderAvailabilityGrid();
      }
    }
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
    state = { user: null, availability: new Set(), groups: [], activeGroup: null, csrfToken: null };
    document.getElementById('page-app').classList.remove('active');
    document.getElementById('page-auth').classList.add('active');
    setAppShellVisible(false);
    await ensureCsrfToken();
  } else {
    errEl.textContent = translateError(data.error);
  }
}

// ── Groups ────────────────────────────────────
function buildGroupButton(g) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'group-item' + (state.activeGroup?.id === g.id ? ' active' : '');
  btn.innerHTML = `
    <span class="group-dot" aria-hidden="true"></span>
    <span class="group-name">${escHtml(g.name)}</span>
    <span class="member-badge">${g.member_count}</span>
  `;
  btn.addEventListener('click', () => openGroup(g));
  return btn;
}

function renderGroupsSidebar() {
  const list = document.getElementById('group-list');
  const mobileList = document.getElementById('mobile-group-list');
  list.innerHTML = ''; mobileList.innerHTML = '';
  state.groups.forEach(g => { list.appendChild(buildGroupButton(g)); mobileList.appendChild(buildGroupButton(g)); });
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
  if (data.success) { toast(tf('removedMember', member.display_name)); openGroup(group); }
  else toast(translateError(data.error), 'error');
}

async function transferOwnership(group, member) {
  const data = await api(API.groups, { action: 'transfer' }, { group_id: group.id, user_id: member.id });
  if (data.success) {
    toast(tf('ownershipTransferred', member.display_name));
    const idx = state.groups.findIndex(g => g.id === group.id);
    if (idx > -1) state.groups[idx].owner_id = member.id;
    openGroup({ ...group, owner_id: member.id });
  } else {
    toast(translateError(data.error), 'error');
  }
}

async function openGroup(group) {
  state.activeGroup = group;
  renderGroupsSidebar();
  setPanel('panel-group');

  document.getElementById('group-title').textContent = group.name;
  const codeEl = document.getElementById('group-invite-code');
  codeEl.textContent = group.invite_code;
  codeEl.setAttribute('aria-label', `${t('clickToCopy')}: ${group.invite_code}`);

  const isOwner = Number(group.owner_id) === Number(state.user.id);
  document.getElementById('btn-leave-group').hidden  = isOwner;
  document.getElementById('btn-delete-group').hidden = !isOwner;

  document.getElementById('group-content').innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';

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

  const isOwner = Number(group.owner_id) === Number(state.user.id);
  const membersDiv = document.createElement('div');
  membersDiv.className = 'members-list';
  members.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'member-chip';
    const initial = [...m.display_name][0]?.toUpperCase() ?? '?';
    const canKick = isOwner && Number(m.id) !== Number(state.user.id);
    chip.innerHTML = `
      <div class="member-avatar" aria-hidden="true">${escHtml(initial)}</div>
      <span>${escHtml(m.display_name)}</span>
      ${canKick ? `<button type="button" class="chip-action chip-transfer" title="${escAttr(t('makeOwner'))}" aria-label="${escAttr(t('makeOwner'))}: ${escAttr(m.display_name)}">⇄</button>` : ''}
      ${canKick ? `<button type="button" class="chip-remove" aria-label="${escAttr(t('removeFromGroup'))}: ${escAttr(m.display_name)}">✕</button>` : ''}
    `;
    if (canKick) {
      chip.querySelector('.chip-remove').addEventListener('click', () => kickMember(group, m));
      chip.querySelector('.chip-transfer').addEventListener('click', () => {
        if (confirm(`${t('transferPrompt')} ${m.display_name}?`)) transferOwnership(group, m);
      });
    }
    membersDiv.appendChild(chip);
  });
  container.appendChild(membersDiv);

  if (overlapData.success) {
    const info = document.createElement('div');
    info.className = 'info-banner';
    const withData = overlapData.members_with_data ?? 0;
    const total    = overlapData.total_members ?? members.length;
    if (withData < total) info.innerHTML = tf('membersProgress', withData, total);
    else info.innerHTML = tf('membersComplete', total, overlapData.overlap?.length ?? 0);
    container.appendChild(info);
  }

  const legend = document.createElement('div');
  legend.className = 'overlap-legend';
  legend.innerHTML = `
    <div class="legend-item"><div class="legend-swatch swatch-free"></div> ${escHtml(t('legendNotFree'))}</div>
    <div class="legend-item"><div class="legend-swatch swatch-mine"></div> ${escHtml(t('legendYouFree'))}</div>
    <div class="legend-item"><div class="legend-swatch swatch-overlap"><span aria-hidden="true">✓</span></div> ${escHtml(t('legendEveryoneFree'))}</div>
  `;
  container.appendChild(legend);

  // Overlap data comes back from the server in UTC — convert to the
  // CURRENT user's local time before building the lookup set, so everyone
  // sees the shared windows in their own timezone.
  const tz = state.user.timezone || 'UTC';
  const overlapSet = new Set();
  if (overlapData.success && overlapData.overlap) {
    overlapData.overlap.forEach(slot => {
      for (let h = slot.start_hour; h < slot.end_hour; h++) {
        const local = utcToLocal(slot.weekday, h, tz);
        overlapSet.add(`${local.weekday}-${local.hour}`);
      }
    });
  }

  const gridWrap = document.createElement('div');
  gridWrap.className = 'grid-container';
  const grid = document.createElement('div');
  grid.className = 'time-grid';

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'grid-hour-label';
    hEl.textContent = formatHourRange(h);
    grid.appendChild(hEl);
  }

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
        cell.innerHTML = '<span class="cell-check" aria-hidden="true">✓</span>'; // not color-only signal
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

  if (overlapData.success && overlapData.overlap && overlapData.overlap.length > 0) {
    const summary = document.createElement('div');
    summary.className = 'overlap-summary';
    summary.innerHTML = `<h4 class="overlap-summary-title">${escHtml(t('sharedWindows'))}</h4>`;
    const list = document.createElement('div');
    list.className = 'overlap-tags';
    overlapData.overlap.forEach(slot => {
      const startLocal = utcToLocal(slot.weekday, slot.start_hour, tz);
      const tag = document.createElement('div');
      tag.className = 'overlap-tag';
      tag.innerHTML = `<strong class="overlap-tag-day">${escHtml(currentDaysFull()[startLocal.weekday])}</strong> <span class="overlap-tag-time">${formatHour(startLocal.hour)} – ${formatHour(startLocal.hour + (slot.end_hour - slot.start_hour))}</span>`;
      list.appendChild(tag);
    });
    summary.appendChild(list);
    container.appendChild(summary);
  } else if (overlapData.success && overlapData.overlap?.length === 0 && overlapData.members_with_data >= overlapData.total_members) {
    const empty = document.createElement('div');
    empty.className = 'overlap-empty';
    empty.textContent = `😅 ${t('noOverlap')}`;
    container.appendChild(empty);
  }
}

// ── Utilities ─────────────────────────────────
function formatHour(h) {
  const hh = ((h % 24) + 24) % 24;
  if (lang === 'fr') return `${hh} h`;
  if (hh === 0) return '12 AM';
  if (hh === 12) return '12 PM';
  return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
}
function formatHourRange(h) { return `${h} - ${h + 1}`; }
function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escAttr(str) { return escHtml(str).replace(/'/g, '&#39;'); }

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('inviteCopied'))).catch(() => {
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
  applyStaticTranslations();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  initAuth();
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.panel));
  });

  document.getElementById('btn-save-availability').addEventListener('click', () => saveAvailability(false));

  const openCreateModal = () => { document.getElementById('new-group-name').value = ''; showModal('modal-create-group'); };
  const openJoinModal   = () => { document.getElementById('join-code').value = ''; showModal('modal-join-group'); };

  document.getElementById('btn-open-create').addEventListener('click', openCreateModal);
  document.getElementById('btn-open-create-mobile').addEventListener('click', openCreateModal);
  document.getElementById('btn-create-group').addEventListener('click', createGroup);
  document.getElementById('new-group-name').addEventListener('keydown', e => { if (e.key === 'Enter') createGroup(); });

  document.getElementById('btn-open-join').addEventListener('click', openJoinModal);
  document.getElementById('btn-open-join-mobile').addEventListener('click', openJoinModal);
  document.getElementById('btn-join-group').addEventListener('click', joinGroup);
  document.getElementById('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinGroup(); });

  document.getElementById('btn-leave-group').addEventListener('click', leaveGroup);
  document.getElementById('btn-delete-group').addEventListener('click', deleteGroup);

  document.getElementById('btn-save-account').addEventListener('click', saveAccount);

  document.getElementById('btn-delete-account').addEventListener('click', () => {
    document.getElementById('delete-account-password').value = '';
    document.getElementById('delete-account-error').textContent = '';
    showModal('modal-delete-account');
  });
  document.getElementById('btn-confirm-delete-account').addEventListener('click', deleteAccount);
  document.getElementById('delete-account-password').addEventListener('keydown', e => { if (e.key === 'Enter') deleteAccount(); });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(overlay.id); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) { hideModal(overlay.id); return; }
      if (e.key !== 'Tab' || !overlay.classList.contains('open')) return;
      const focusables = getFocusableElements(overlay.querySelector('.modal'));
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  document.getElementById('group-invite-code').addEventListener('click', function () { copyToClipboard(this.textContent.trim()); });

  checkSession();
});
