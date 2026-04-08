const STORAGE_KEY = "houston_staff_panel_state_v1";

const defaultState = {
  currentUser: null,
  users: [
    {
      username: "admin",
      password: "password123",
      displayName: "Admin Houston",
      role: "Manager",
      avatar: "https://tr.rbxcdn.com/180DAY-6f5f2d2f73728d0f0d3a56d98d0d2178/150/150/AvatarHeadshot/Png",
      online: true
    },
    {
      username: "moderatore",
      password: "mod123",
      displayName: "Moderatore RP",
      role: "Moderatore",
      avatar: "https://tr.rbxcdn.com/180DAY-42f5e43d7c01d229f4bb35f3d8f385e6/150/150/AvatarHeadshot/Png",
      online: true
    },
    {
      username: "alex.manager",
      password: "manager123",
      displayName: "Alex Ranger",
      role: "Amministratore",
      avatar: "https://tr.rbxcdn.com/180DAY-0bf8676c88dbff208221f0f91af6967d/150/150/AvatarHeadshot/Png",
      online: false
    }
  ],
  players: [
    { id: 1, robloxName: "Luca_RP", warns: 2, activeBanUntil: null, lastReason: "Fail RP leggero" },
    { id: 2, robloxName: "TexasDriver", warns: 3, activeBanUntil: hoursFromNow(18), lastReason: "Powergaming" },
    { id: 3, robloxName: "SheriffMax", warns: 1, activeBanUntil: null, lastReason: "Comportamento tossico" },
    { id: 4, robloxName: "RancherJoe", warns: 4, activeBanUntil: hoursFromNow(32), lastReason: "VDM ripetuto" }
  ],
  logs: [
    createLog("warn", "Luca_RP", "Fail RP leggero", "Admin Houston", null, false),
    createLog("ban", "TexasDriver", "Powergaming", "Admin Houston", hoursFromNow(18), true),
    createLog("kick", "SheriffMax", "Richiamo verbale ignorato", "Moderatore RP", null, false)
  ]
};

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function createLog(type, playerName, reason, staffName, expiresAt, automatic) {
  return {
    id: crypto.randomUUID(),
    type,
    playerName,
    reason,
    staffName,
    createdAt: new Date().toISOString(),
    expiresAt,
    automatic
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return structuredClone(defaultState);
  }

  try {
    const parsed = JSON.parse(saved);
    return { ...structuredClone(defaultState), ...parsed };
  } catch {
    return structuredClone(defaultState);
  }
}

const state = loadState();

const elements = {
  loginScreen: document.querySelector("#login-screen"),
  dashboardShell: document.querySelector("#dashboard-shell"),
  loginForm: document.querySelector("#login-form"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  togglePassword: document.querySelector("#toggle-password"),
  meterBars: Array.from(document.querySelectorAll(".password-meter span")),
  navLinks: Array.from(document.querySelectorAll(".nav-link")),
  sections: Array.from(document.querySelectorAll(".content-section")),
  sectionTitle: document.querySelector("#section-title"),
  playerSelect: document.querySelector("#player-select"),
  actionSelect: document.querySelector("#action-select"),
  reasonInput: document.querySelector("#reason-input"),
  moderationForm: document.querySelector("#moderation-form"),
  durationField: document.querySelector("#duration-field"),
  banDuration: document.querySelector("#ban-duration"),
  playerCards: document.querySelector("#player-cards"),
  logsList: document.querySelector("#logs-list"),
  discordPreview: document.querySelector("#discord-preview"),
  recentActions: document.querySelector("#recent-actions"),
  statsGrid: document.querySelector("#stats-grid"),
  activeBansValue: document.querySelector("#active-bans-value"),
  warnTotalValue: document.querySelector("#warn-total-value"),
  kicksTodayValue: document.querySelector("#kicks-today-value"),
  staffOnlineValue: document.querySelector("#staff-online-value"),
  onlineCounterLabel: document.querySelector("#online-counter-label"),
  sidebarAvatar: document.querySelector("#sidebar-avatar"),
  sidebarName: document.querySelector("#sidebar-name"),
  sidebarRole: document.querySelector("#sidebar-role"),
  logoutBtn: document.querySelector("#logout-btn"),
  teamForm: document.querySelector("#team-form"),
  teamGrid: document.querySelector("#team-grid"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileName: document.querySelector("#profile-name"),
  profileRole: document.querySelector("#profile-role"),
  profileForm: document.querySelector("#profile-form"),
  profileDisplayName: document.querySelector("#profile-display-name"),
  profileAvatarUrl: document.querySelector("#profile-avatar-url"),
  passwordForm: document.querySelector("#password-form"),
  newPassword: document.querySelector("#new-password"),
  ruleLength: document.querySelector("#rule-length"),
  ruleUpper: document.querySelector("#rule-upper"),
  ruleNumber: document.querySelector("#rule-number"),
  ruleSpecial: document.querySelector("#rule-special"),
  toastContainer: document.querySelector("#toast-container"),
  staffUsername: document.querySelector("#staff-username"),
  staffDisplayName: document.querySelector("#staff-display-name"),
  staffRole: document.querySelector("#staff-role"),
  staffAvatar: document.querySelector("#staff-avatar"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  sidebarNav: document.querySelector("#sidebar-nav")
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentUser() {
  return state.users.find((user) => user.username === state.currentUser) || null;
}

function normalizeExpirations() {
  let changed = false;

  state.players.forEach((player) => {
    if (player.activeBanUntil && new Date(player.activeBanUntil) <= new Date()) {
      player.activeBanUntil = null;
      changed = true;
      state.logs.unshift(createLog("ban", player.robloxName, "Sbannamento automatico a scadenza", "Sistema", null, true));
    }
  });

  if (changed) {
    saveState();
  }
}

function formatDate(value) {
  if (!value) {
    return "Nessuna scadenza";
  }

  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function getStats() {
  const today = new Date().toDateString();
  const logsToday = state.logs.filter((log) => new Date(log.createdAt).toDateString() === today);
  const activeBans = state.players.filter((player) => player.activeBanUntil).length;
  const kicksToday = logsToday.filter((log) => log.type === "kick").length;
  const warnsToday = logsToday.filter((log) => log.type === "warn").length;
  const onlineStaff = state.users.filter((user) => user.online).length;
  const recentCount = state.logs.slice(0, 5).length;
  const totalWarns = state.players.reduce((sum, player) => sum + player.warns, 0);

  return { activeBans, kicksToday, warnsToday, onlineStaff, recentCount, totalWarns };
}

function renderStats() {
  const stats = getStats();
  const cards = [
    { label: "Avvisi oggi", value: stats.warnsToday },
    { label: "Ban attivi", value: stats.activeBans },
    { label: "Kick oggi", value: stats.kicksToday },
    { label: "Staff online", value: stats.onlineStaff },
    { label: "Azioni recenti", value: stats.recentCount }
  ];

  elements.statsGrid.innerHTML = cards.map((card) => `
    <article class="stat-card">
      <p class="muted">${card.label}</p>
      <strong class="stat-value">${card.value}</strong>
    </article>
  `).join("");

  elements.activeBansValue.textContent = String(stats.activeBans);
  elements.warnTotalValue.textContent = String(stats.totalWarns);
  elements.kicksTodayValue.textContent = String(stats.kicksToday);
  elements.staffOnlineValue.textContent = String(stats.onlineStaff);
  elements.onlineCounterLabel.textContent = `${stats.onlineStaff} staff online`;
}

function actionLabel(type) {
  if (type === "warn") return "⚠️ Warn";
  if (type === "kick") return "🚪 Kick";
  if (type === "ban") return "🚫 Ban";
  return type;
}

function renderLogs() {
  elements.logsList.innerHTML = state.logs.map((log) => `
    <article class="feed-item">
      <div class="feed-head">
        <div class="feed-title">
          <div class="badge-icon ${log.type}">${log.type === "warn" ? "!" : log.type === "kick" ? "↗" : "⛔"}</div>
          <div>
            <strong>${actionLabel(log.type)} • ${log.playerName}</strong>
            <p class="feed-meta">${log.staffName} • ${formatDate(log.createdAt)}</p>
          </div>
        </div>
        <span class="chip">${log.automatic ? "Auto" : "Manuale"}</span>
      </div>
      <p class="feed-description">Motivo: ${log.reason}</p>
      <p class="feed-description">Scadenza: ${formatDate(log.expiresAt)}</p>
    </article>
  `).join("");

  const latest = state.logs[0];
  if (!latest) {
    elements.discordPreview.innerHTML = "<p class='muted'>Nessun log disponibile.</p>";
    return;
  }

  elements.discordPreview.innerHTML = `
    <div class="discord-head">
      <div class="discord-stripe"></div>
      <div>
        <strong>Embed Discord simulato</strong>
        <p class="muted">Webhook moderazione Houston RP</p>
      </div>
    </div>
    <div class="discord-body">
      <p><strong>Giocatore:</strong> ${latest.playerName}</p>
      <p><strong>Azione:</strong> ${actionLabel(latest.type)}</p>
      <p><strong>Motivo:</strong> ${latest.reason}</p>
      <p><strong>Staff:</strong> ${latest.staffName}</p>
      <p><strong>Timestamp:</strong> ${formatDate(latest.createdAt)}</p>
      <p><strong>Scadenza:</strong> ${formatDate(latest.expiresAt)}</p>
    </div>
  `;
}

function renderRecentActions() {
  elements.recentActions.innerHTML = state.logs.slice(0, 6).map((log) => `
    <article class="feed-item">
      <div class="feed-head">
        <div class="feed-title">
          <div class="badge-icon ${log.type}">${log.type === "warn" ? "!" : log.type === "kick" ? "↗" : "⛔"}</div>
          <strong>${log.playerName}</strong>
        </div>
        <span class="muted">${formatDate(log.createdAt)}</span>
      </div>
      <p class="feed-description">${actionLabel(log.type)} da ${log.staffName}</p>
    </article>
  `).join("");
}

function renderPlayers() {
  elements.playerSelect.innerHTML = state.players.map((player) => `
    <option value="${player.id}">${player.robloxName}</option>
  `).join("");

  elements.playerCards.innerHTML = state.players.map((player) => `
    <article class="player-card">
      <p class="eyebrow">Roblox Player</p>
      <h3>${player.robloxName}</h3>
      <p class="muted">Ultimo motivo: ${player.lastReason || "Nessuno"}</p>
      <div class="player-stats">
        <span><strong>${player.warns}</strong><br>Warn</span>
        <span><strong>${player.activeBanUntil ? "Attivo" : "No"}</strong><br>Ban</span>
      </div>
      <p class="feed-description">Scadenza ban: ${formatDate(player.activeBanUntil)}</p>
    </article>
  `).join("");
}

function renderTeam() {
  elements.teamGrid.innerHTML = state.users.map((user) => `
    <article class="team-member">
      <div class="team-head">
        <img class="avatar" src="${user.avatar}" alt="${user.displayName}">
        <div>
          <strong>${user.displayName}</strong>
          <p class="muted">@${user.username}</p>
        </div>
      </div>
      <span class="role-pill">${user.role}</span>
      <span class="muted">${user.online ? "Online" : "Offline"}</span>
      <button class="team-action" type="button" data-username="${user.username}">Toggle online</button>
    </article>
  `).join("");

  document.querySelectorAll(".team-action").forEach((button) => {
    button.addEventListener("click", () => {
      const user = state.users.find((entry) => entry.username === button.dataset.username);
      if (!user) return;
      user.online = !user.online;
      saveState();
      renderAll();
    });
  });
}

function renderProfile() {
  const user = getCurrentUser();
  if (!user) return;

  elements.sidebarAvatar.src = user.avatar;
  elements.sidebarName.textContent = user.displayName;
  elements.sidebarRole.textContent = user.role;
  elements.profileAvatar.src = user.avatar;
  elements.profileName.textContent = user.displayName;
  elements.profileRole.textContent = `${user.role} • @${user.username}`;
  elements.profileDisplayName.value = user.displayName;
  elements.profileAvatarUrl.value = user.avatar;
}

function renderAll() {
  normalizeExpirations();
  renderStats();
  renderPlayers();
  renderLogs();
  renderRecentActions();
  renderTeam();
  renderProfile();
}

function showToast(title, message) {
  const toast = document.createElement("article");
  toast.className = "toast";
  toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

function setSection(sectionName) {
  elements.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionName);
  });

  elements.sections.forEach((section) => {
    const active = section.id === `section-${sectionName}`;
    section.classList.toggle("active", active);
  });

  const current = elements.navLinks.find((link) => link.dataset.section === sectionName);
  elements.sectionTitle.textContent = current ? current.textContent : "Dashboard";
}

function updatePasswordMeter(password) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];

  elements.meterBars.forEach((bar, index) => {
    bar.classList.toggle("active", score[index]);
  });

  elements.ruleLength.classList.toggle("valid", score[0]);
  elements.ruleUpper.classList.toggle("valid", score[1]);
  elements.ruleNumber.classList.toggle("valid", score[2]);
  elements.ruleSpecial.classList.toggle("valid", score[3]);
}

function handleLogin(event) {
  event.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  const user = state.users.find((entry) => entry.username === username && entry.password === password);

  if (!user) {
    elements.loginError.hidden = false;
    return;
  }

  state.currentUser = user.username;
  elements.loginError.hidden = true;
  saveState();
  syncAuthUI();
  renderAll();
  showToast("Accesso eseguito", `Benvenuto ${user.displayName}`);
}

function syncAuthUI() {
  const loggedIn = Boolean(state.currentUser);
  elements.loginScreen.classList.toggle("hidden", loggedIn);
  elements.dashboardShell.classList.toggle("hidden", !loggedIn);
}

function handleModeration(event) {
  event.preventDefault();
  const user = getCurrentUser();
  const player = state.players.find((entry) => String(entry.id) === elements.playerSelect.value);
  const action = elements.actionSelect.value;
  const reason = elements.reasonInput.value.trim() || "Motivo non specificato";

  if (!user || !player) return;

  let expiresAt = null;
  let automatic = false;

  if (action === "warn") {
    player.warns += 1;
    player.lastReason = reason;

    if (player.warns >= 5) {
      expiresAt = hoursFromNow(48);
      player.activeBanUntil = expiresAt;
      automatic = true;
      state.logs.unshift(createLog("ban", player.robloxName, "Auto-ban intelligente: 5 warn", "Sistema", expiresAt, true));
      showToast("Auto-ban", `${player.robloxName} bannato per 48 ore`);
    } else if (player.warns >= 3) {
      expiresAt = hoursFromNow(24);
      player.activeBanUntil = expiresAt;
      automatic = true;
      state.logs.unshift(createLog("ban", player.robloxName, "Auto-ban intelligente: 3 warn", "Sistema", expiresAt, true));
      showToast("Auto-ban", `${player.robloxName} bannato per 24 ore`);
    }
  }

  if (action === "kick") {
    player.lastReason = reason;
  }

  if (action === "ban") {
    expiresAt = hoursFromNow(Number(elements.banDuration.value));
    player.activeBanUntil = expiresAt;
    player.lastReason = reason;
  }

  state.logs.unshift(createLog(action, player.robloxName, reason, user.displayName, expiresAt, automatic));
  saveState();
  renderAll();
  event.target.reset();
  showToast("Azione salvata", `${actionLabel(action)} registrato per ${player.robloxName}`);
}

function handleTeamSubmit(event) {
  event.preventDefault();
  const username = elements.staffUsername.value.trim();
  const displayName = elements.staffDisplayName.value.trim();
  const role = elements.staffRole.value;
  const avatar = elements.staffAvatar.value.trim();

  if (!username || !displayName || !avatar) {
    showToast("Dati mancanti", "Compila tutti i campi staff.");
    return;
  }

  state.users.push({
    username,
    displayName,
    role,
    avatar,
    online: false,
    password: "changeme123"
  });

  saveState();
  renderAll();
  event.target.reset();
  showToast("Staff aggiunto", `${displayName} inserito come ${role}`);
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const user = getCurrentUser();
  if (!user) return;

  user.displayName = elements.profileDisplayName.value.trim() || user.displayName;
  user.avatar = elements.profileAvatarUrl.value.trim() || user.avatar;
  saveState();
  renderAll();
  showToast("Profilo aggiornato", "Le modifiche sono state salvate.");
}

function handlePasswordSubmit(event) {
  event.preventDefault();
  const user = getCurrentUser();
  const password = elements.newPassword.value;
  const valid = password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

  if (!user || !valid) {
    showToast("Password non valida", "Rispetta tutti i requisiti indicati.");
    return;
  }

  user.password = password;
  saveState();
  event.target.reset();
  updatePasswordMeter("");
  showToast("Password aggiornata", "Nuova password salvata correttamente.");
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.togglePassword.addEventListener("click", () => {
    const isPassword = elements.loginPassword.type === "password";
    elements.loginPassword.type = isPassword ? "text" : "password";
    elements.togglePassword.textContent = isPassword ? "Nascondi" : "Mostra";
  });

  elements.loginPassword.addEventListener("input", () => updatePasswordMeter(elements.loginPassword.value));
  elements.newPassword.addEventListener("input", () => updatePasswordMeter(elements.newPassword.value));

  elements.navLinks.forEach((link) => {
    link.addEventListener("click", () => setSection(link.dataset.section));
  });

  elements.actionSelect.addEventListener("change", () => {
    elements.durationField.classList.toggle("hidden", elements.actionSelect.value !== "ban");
  });

  elements.moderationForm.addEventListener("submit", handleModeration);
  elements.teamForm.addEventListener("submit", handleTeamSubmit);
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.passwordForm.addEventListener("submit", handlePasswordSubmit);

  elements.logoutBtn.addEventListener("click", () => {
    state.currentUser = null;
    saveState();
    syncAuthUI();
    showToast("Logout", "Sessione terminata.");
  });

  elements.sidebarToggle.addEventListener("click", () => {
    elements.sidebarNav.classList.toggle("open");
  });
}

function init() {
  bindEvents();
  syncAuthUI();
  setSection("dashboard");
  elements.durationField.classList.add("hidden");
  updatePasswordMeter("");
  renderAll();

  setInterval(() => {
    normalizeExpirations();
    renderAll();
  }, 60000);
}

init();
