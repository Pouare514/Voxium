// ═══════════════════════════════════════════════════════
//  Voxium — Frontend Application Logic (v3 — Full Clone)
// ═══════════════════════════════════════════════════════

const RUNTIME_CONFIG = window.VOXIUM_RUNTIME_CONFIG || {};
const API = RUNTIME_CONFIG.apiBaseUrl || "http://127.0.0.1:8080";
const WS_URL = RUNTIME_CONFIG.wsUrl || "ws://127.0.0.1:8080/ws";
const WEBRTC_CONFIG = {
    iceServers: Array.isArray(RUNTIME_CONFIG.iceServers) && RUNTIME_CONFIG.iceServers.length > 0
        ? RUNTIME_CONFIG.iceServers
        : [{ urls: "stun:stun.l.google.com:19302" }]
};
const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const MESSAGE_REACTION_PICKER_ID = "message-reaction-picker";

const COLOR_THEME_PRESETS = {
    blurple: { accent: "#5865f2", accentHover: "#4752c4", textLink: "#00a8fc" },
    teal: { accent: "#1abc9c", accentHover: "#0f9d82", textLink: "#36cfc9" },
    emerald: { accent: "#57f287", accentHover: "#2fbf71", textLink: "#64d8cb" },
    sunset: { accent: "#fba95f", accentHover: "#f06595", textLink: "#ff922b" },
    rose: { accent: "#ff5ea8", accentHover: "#d63384", textLink: "#f783ac" },
    crimson: { accent: "#ed4245", accentHover: "#c0392b", textLink: "#ff6b6b" },
    amber: { accent: "#f1c40f", accentHover: "#e67e22", textLink: "#ffd43b" },
    violet: { accent: "#9b59b6", accentHover: "#6c5ce7", textLink: "#b197fc" },
    midnight: { accent: "#6c5ce7", accentHover: "#5f3dc4", textLink: "#748ffc" },
    sky: { accent: "#4dabf7", accentHover: "#1c7ed6", textLink: "#74c0fc" },
};

function hexToRgb(hex) {
    const normalized = (hex || "").replace("#", "").trim();
    if (normalized.length !== 6) return { r: 88, g: 101, b: 242 };
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function createVoiceState() {
    return window.VoxiumVoice.createVoiceState();
}

// ── State ──────────────────────────────────────────────
let state = {
    token: localStorage.getItem("token") || null,
    userId: localStorage.getItem("userId") || null,
    username: localStorage.getItem("username") || null,
    role: null,
    avatarColor: 0,
    avatarUrl: null,
    bannerUrl: null,
    presence: localStorage.getItem("presence") || "online",
    about: "",
    currentRoomId: null,
    currentRoomName: null,
    currentRoomKind: null,
    ws: null,
    rooms: [],
    serverRoles: [],
    serverUsers: [],
    users: {},
    unreadByRoom: {},
    mentionByRoom: {},
    messageMetaById: {},
    replyingTo: null,
    pinnedMessageIds: new Set(),
    threadRootId: null,
    voice: createVoiceState(),
};

// ── Preferences ────────────────────────────────────────
let prefs = {
    theme: localStorage.getItem("theme") || "dark",
    themeColor: localStorage.getItem("themeColor") || "blurple",
    colorThemeBg: localStorage.getItem("colorThemeBg") !== "false",
    fontSize: parseInt(localStorage.getItem("fontSize") || "15"),
    reduceMotion: localStorage.getItem("reduceMotion") === "true",
    compactMode: localStorage.getItem("compactMode") === "true",
};

// Apply preferences immediately
applyPrefs();

function applyPrefs() {
    document.documentElement.setAttribute("data-theme", prefs.theme);
    const preset = COLOR_THEME_PRESETS[prefs.themeColor] || COLOR_THEME_PRESETS.blurple;
    const { r, g, b } = hexToRgb(preset.accent);
    document.documentElement.style.setProperty("--accent", preset.accent);
    document.documentElement.style.setProperty("--accent-hover", preset.accentHover);
    document.documentElement.style.setProperty("--text-link", preset.textLink);
    document.documentElement.style.setProperty("--theme-tint-strong", `rgba(${r}, ${g}, ${b}, 0.26)`);
    document.documentElement.style.setProperty("--theme-tint-soft", `rgba(${r}, ${g}, ${b}, 0.12)`);
    document.documentElement.style.setProperty("--theme-tint-edge", `rgba(${r}, ${g}, ${b}, 0.08)`);
    document.documentElement.style.setProperty("--theme-tint-opacity", prefs.colorThemeBg ? "0.38" : "0");
    document.documentElement.style.setProperty("--font-size-base", prefs.fontSize + "px");
    document.documentElement.classList.toggle("reduce-motion", prefs.reduceMotion);
    document.documentElement.classList.toggle("compact-mode", prefs.compactMode);
}

function savePref(key, value) {
    prefs[key] = value;
    localStorage.setItem(key, value);
    applyPrefs();
}

// ── DOM Elements ───────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const authModal = $("#auth-modal");
const app = $("#app");
const authForm = $("#auth-form");
const authUsername = $("#auth-username");
const authPassword = $("#auth-password");
const authSubmit = $("#auth-submit");
const authDiscordBtn = $("#auth-discord-btn");
const authError = $("#auth-error");
const tabLogin = $("#tab-login");
const tabRegister = $("#tab-register");
const roomsList = $("#rooms-list");
const voiceRoomsList = $("#voice-rooms-list");
const messagesContainer = $("#messages-container");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const messageInputArea = $("#message-input-area");
const chatArea = document.querySelector(".chat-area");
const replyPreview = $("#reply-preview");
const replyTargetName = $("#reply-target-name");
const replyTargetSnippet = $("#reply-target-snippet");
const replyCancelBtn = $("#reply-cancel-btn");
const currentRoomName = $("#current-room-name");
const roomKindIcon = $("#room-kind-icon");
const addRoomBtn = $("#add-room-btn");
const createRoomModal = $("#create-room-modal");
const createRoomForm = $("#create-room-form");
const roomNameInput = $("#room-name-input");
const roomKindInput = $("#room-kind-input");
const roomRequiredRoleInput = $("#room-required-role-input");
const cancelRoomBtn = $("#cancel-room-btn");
const roomSettingsModal = $("#room-settings-modal");
const roomSettingsForm = $("#room-settings-form");
const roomSettingsName = $("#room-settings-name");
const roomSettingsKind = $("#room-settings-kind");
const roomSettingsRequiredRole = $("#room-settings-required-role");
const roomPrivacyPublicBtn = $("#room-privacy-public-btn");
const roomPrivacyPrivateBtn = $("#room-privacy-private-btn");
const roomSettingsCancelBtn = $("#room-settings-cancel-btn");
const roomSettingsFeedback = $("#room-settings-feedback");
const serverSettingsBtn = $("#server-settings-btn");
const serverSettingsModal = $("#server-settings-modal");
const serverSettingsCloseBtn = $("#server-settings-close-btn");
const serverRoleForm = $("#server-role-form");
const serverRoleName = $("#server-role-name");
const serverRoleColor = $("#server-role-color");
const serverRolesList = $("#server-roles-list");
const serverUserSelect = $("#server-user-select");
const serverRoleSelect = $("#server-role-select");
const serverAssignBtn = $("#server-assign-btn");
const serverSettingsFeedback = $("#server-settings-feedback");
const userAvatar = $("#user-avatar");
const selfStatusDot = $("#self-status-dot");
const userName = $("#user-name");
const userDiscriminator = $("#user-discriminator");
const muteBtn = $("#mute-btn");
const deafenBtn = $("#deafen-btn");
const deleteRoomBtn = $("#delete-room-btn");
const pinnedBtn = $("#pinned-btn");
const membersList = $("#members-list");
const memberCount = $("#member-count");
const membersSidebar = $("#members-sidebar");
const voiceRoomPanel = $("#voice-room-panel");
const voiceRoomTitle = $("#voice-room-title");
const voiceRoomSubtitle = $("#voice-room-subtitle");
const voiceRoomChip = $("#voice-room-chip");
const joinVoiceBtn = $("#join-voice-btn");
const leaveVoiceBtn = $("#leave-voice-btn");
const voiceMuteBtn = $("#voice-mute-btn");
const voiceDeafenBtn = $("#voice-deafen-btn");
const voiceScreenBtn = $("#voice-screen-btn");
const voiceScreenQualitySelect = $("#voice-screen-quality");
const voiceScreenFpsSelect = $("#voice-screen-fps");
const voiceMembersList = $("#voice-members-list");
const voiceScreensWrap = $("#voice-screens-wrap");
const voiceScreensGrid = $("#voice-screens-grid");
const voiceQuickStatus = $("#voice-quick-status");
const voiceStatusText = $("#voice-status-text");
const voiceMeterBars = $("#voice-meter-bars");
const voiceMeterLabel = $("#voice-meter-label");

let voiceController = null;

function getScreenQualityPreset(value) {
    return voiceController.getScreenQualityPreset(value);
}

function getScreenCaptureConstraints() {
    return voiceController.getScreenCaptureConstraints();
}

function getScreenTrackConstraints() {
    return voiceController.getScreenTrackConstraints();
}

async function applyScreenTrackConstraints(track) {
    return voiceController.applyScreenTrackConstraints(track);
}

function syncScreenShareSettingsUI() {
    return voiceController.syncScreenShareSettingsUI();
}

function updateScreenShareSettingsFromUI() {
    return voiceController.updateScreenShareSettingsFromUI();
}

function handleScreenSettingsChange() {
    return voiceController.handleScreenSettingsChange();
}

function getScreenProfileLabel(quality, fps) {
    return voiceController.getScreenProfileLabel(quality, fps);
}

// Settings
const settingsBtn = $("#settings-btn");
const settingsModal = $("#settings-modal");
const closeSettingsBtn = $("#close-settings-btn");
const logoutSettingsBtn = $("#logout-settings-btn");
const settingsContentInner = document.querySelector(".settings-content-inner");
const settingsMiniAvatar = $("#settings-mini-avatar");
const settingsMiniName = $("#settings-mini-name");
const settingsSearchInput = $("#settings-search-input");
const settingsMiniEditBtn = document.querySelector(".settings-mini-edit");
const colorThemeButtons = document.querySelectorAll(".color-theme-tile[data-theme-color]");
const updateProfileForm = $("#update-profile-form");
const settingsUsername = $("#settings-username");
const settingsAbout = $("#settings-about");
const settingsPassword = $("#settings-password");
const settingsAvatar = $("#settings-avatar");
const settingsUsernameDisplay = $("#settings-username-display");
const settingsDiscDisplay = $("#settings-disc-display");
const settingsRoleBadge = $("#settings-role-badge");
const settingsStatusDot = $("#settings-status-dot");
const previewStatusDot = $("#preview-status-dot");
const presenceSelect = $("#presence-select");
const avatarColorPicker = $("#avatar-color-picker");
const settingsAvatarColorInput = $("#settings-avatar-color");
const settingsFeedback = $("#settings-feedback");
const acctUsernameDisplay = $("#acct-username-display");
const editPanel = $("#edit-panel");
const editPanelTitle = $("#edit-panel-title");
const cancelEditBtn = $("#cancel-edit-btn");
const btnEditProfile = $("#btn-edit-profile");

// Profile tab
const profileColorPicker = $("#profile-color-picker");
const profileAboutInput = $("#profile-about-input");
const saveProfileBtn = $("#save-profile-btn");
const profileFeedback = $("#profile-feedback");
const previewAvatar = $("#preview-avatar");
const previewBanner = $("#preview-banner");
const previewUsername = $("#preview-username");
const previewDisc = $("#preview-disc");
const previewAbout = $("#preview-about");
const previewBadges = $("#preview-badges");

// Context Menu
const contextMenu = $("#context-menu");
const ctxHeaderTitle = $("#ctx-header-title");
const ctxCopyId = $("#ctx-copy-id");
const ctxDeleteRoom = $("#ctx-delete-room");
const ctxRoomSettings = $("#ctx-room-settings");
const ctxDeleteMessage = $("#ctx-delete-message");
const ctxPromoteAdmin = $("#ctx-promote-admin");
const ctxPurgeUserMessages = $("#ctx-purge-user-messages");

let contextController = null;

// Typing
const typingIndicator = $("#typing-indicator");
const typingText = $("#typing-text");

// User popout
const userPopout = $("#user-popout");
const popoutAvatar = $("#popout-avatar");
const popoutBanner = $("#popout-banner");
const popoutStatusDot = $("#popout-status-dot");
const popoutUsername = $("#popout-username");
const popoutDisc = $("#popout-disc");
const popoutBadges = $("#popout-badges");

const pinnedModal = $("#pinned-modal");
const pinnedList = $("#pinned-list");
const pinnedCloseBtn = $("#pinned-close-btn");
const threadPanel = $("#thread-panel");
const threadCloseBtn = $("#thread-close-btn");
const threadRoot = $("#thread-root");
const threadReplies = $("#thread-replies");
const threadForm = $("#thread-form");
const threadInput = $("#thread-input");

// Chat search
const chatSearch = $("#chat-search");
const searchModal = $("#search-modal");
const searchQueryInput = $("#search-query");
const searchAuthorInput = $("#search-author");
const searchFromInput = $("#search-from");
const searchToInput = $("#search-to");
const searchRoomScope = $("#search-room-scope");
const searchResults = $("#search-results");
const searchCloseBtn = $("#search-close-btn");
const searchRunBtn = $("#search-run-btn");
const globalMentionBadge = $("#global-mention-badge");

// Members toggle
const membersToggleBtn = $("#members-toggle-btn");
let membersVisible = true;
const BASE_APP_TITLE = "Voxium";

function getGlobalMentionCount() {
    return Object.entries(state.mentionByRoom || {}).reduce((sum, [roomId, count]) => {
        if (roomId === state.currentRoomId) return sum;
        const value = Number(count) || 0;
        return sum + Math.max(0, value);
    }, 0);
}

function updateGlobalMentionBadge() {
    const count = getGlobalMentionCount();
    if (globalMentionBadge) {
        if (count > 0) {
            globalMentionBadge.classList.remove("hidden");
            globalMentionBadge.textContent = count > 99 ? "99+" : String(count);
        } else {
            globalMentionBadge.classList.add("hidden");
        }
    }
    document.title = count > 0 ? `(${count}) ${BASE_APP_TITLE}` : BASE_APP_TITLE;
}

// ── Auth Mode ──────────────────────────────────────────
let authMode = "login";

function getDiscordOAuthConfig() {
    return {
        authorizeBaseUrl: (RUNTIME_CONFIG.discordAuthorizeBaseUrl || "https://discord.com/oauth2/authorize").trim(),
        clientId: (RUNTIME_CONFIG.discordClientId || "").trim(),
        redirectUri: (RUNTIME_CONFIG.discordRedirectUri || "").trim(),
        scope: (RUNTIME_CONFIG.discordScope || "identify email guilds").trim(),
        responseType: (RUNTIME_CONFIG.discordResponseType || "code").trim(),
        prompt: (RUNTIME_CONFIG.discordPrompt || "consent").trim(),
    };
}

function buildDiscordAuthorizeUrl() {
    const cfg = getDiscordOAuthConfig();
    if (!cfg.clientId || !cfg.redirectUri) {
        return null;
    }

    const oauthState = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    sessionStorage.setItem("discord_oauth_state", oauthState);

    const params = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: cfg.responseType,
        redirect_uri: cfg.redirectUri,
        scope: cfg.scope,
        state: oauthState,
    });

    if (cfg.prompt) {
        params.set("prompt", cfg.prompt);
    }

    return `${cfg.authorizeBaseUrl}?${params.toString()}`;
}

function cleanDiscordOAuthParams() {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("code");
    currentUrl.searchParams.delete("state");
    currentUrl.searchParams.delete("error");
    currentUrl.searchParams.delete("error_description");
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
}

async function handleDiscordOAuthCallback() {
    const currentUrl = new URL(window.location.href);
    const error = currentUrl.searchParams.get("error");
    const errorDescription = currentUrl.searchParams.get("error_description");
    const code = currentUrl.searchParams.get("code");
    const stateParam = currentUrl.searchParams.get("state");

    if (error) {
        authError.textContent = decodeURIComponent(errorDescription || error || "Connexion Discord refusée.");
        cleanDiscordOAuthParams();
        return false;
    }

    if (!code) return false;

    const expectedState = sessionStorage.getItem("discord_oauth_state");
    if (expectedState && expectedState !== stateParam) {
        authError.textContent = "État OAuth Discord invalide, recommencez.";
        sessionStorage.removeItem("discord_oauth_state");
        cleanDiscordOAuthParams();
        return false;
    }

    const cfg = getDiscordOAuthConfig();
    if (!cfg.redirectUri) {
        authError.textContent = "Configuration Discord manquante (discordRedirectUri).";
        cleanDiscordOAuthParams();
        return false;
    }

    authError.textContent = "Connexion Discord en cours...";
    try {
        const response = await fetch(`${API}/api/auth/discord/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code,
                redirect_uri: cfg.redirectUri,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            authError.textContent = data.error || "Impossible de connecter votre compte Discord.";
            cleanDiscordOAuthParams();
            return false;
        }

        saveSession(data);
        sessionStorage.removeItem("discord_oauth_state");
        cleanDiscordOAuthParams();
        authError.textContent = "";
        return true;
    } catch (err) {
        authError.textContent = "Impossible de contacter le serveur";
        cleanDiscordOAuthParams();
        return false;
    }
}

tabLogin.addEventListener("click", () => {
    authMode = "login";
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    authSubmit.textContent = "Se connecter";
});

tabRegister.addEventListener("click", () => {
    authMode = "register";
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    authSubmit.textContent = "S'inscrire";
});

if (authDiscordBtn) {
    authDiscordBtn.addEventListener("click", () => {
        authError.textContent = "";
        const authorizeUrl = buildDiscordAuthorizeUrl();
        if (!authorizeUrl) {
            authError.textContent = "Configuration Discord manquante (discordClientId / discordRedirectUri).";
            return;
        }
        window.location.assign(authorizeUrl);
    });
}

// ── Auth Form Submit ───────────────────────────────────
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) return;

    try {
        const res = await fetch(`${API}/api/${authMode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
            authError.textContent = data.error || "Erreur d'authentification";
            return;
        }
        saveSession(data);
        enterApp();
    } catch (err) {
        authError.textContent = "Impossible de contacter le serveur";
    }
});

function saveSession(data) {
    state.token = data.token;
    state.userId = data.user_id;
    state.username = data.username;
    if (data.role) state.role = data.role;
    if (data.avatar_color !== undefined) state.avatarColor = data.avatar_color;
    if (data.avatar_url !== undefined) state.avatarUrl = data.avatar_url;
    if (data.banner_url !== undefined) state.bannerUrl = data.banner_url;
    if (data.about !== undefined) state.about = data.about;
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.user_id);
    localStorage.setItem("username", data.username);
}

function normalizePresence(value) {
    const v = (value || "").toLowerCase();
    if (v === "online" || v === "idle" || v === "dnd" || v === "invisible") return v;
    return "online";
}

function presenceDotClass(value) {
    const normalized = normalizePresence(value);
    if (normalized === "invisible") return "offline";
    return normalized;
}

function presenceLabel(value) {
    const normalized = normalizePresence(value);
    if (normalized === "idle") return "Absent";
    if (normalized === "dnd") return "Ne pas déranger";
    if (normalized === "invisible") return "Hors ligne";
    return "En ligne";
}

function applyStatusDot(el, value) {
    if (!el) return;
    el.classList.remove("online", "idle", "dnd", "offline");
    el.classList.add(presenceDotClass(value));
}

function applyOwnPresenceUI() {
    applyStatusDot(selfStatusDot, state.presence);
    applyStatusDot(settingsStatusDot, state.presence);
    applyStatusDot(previewStatusDot, state.presence);
    if (presenceSelect) {
        presenceSelect.value = normalizePresence(state.presence);
    }
}

function syncOwnPresenceInUsersMap() {
    if (!state.userId) return;
    if (!state.users[state.userId]) {
        state.users[state.userId] = {
            username: state.username,
            avatar_color: state.avatarColor || 0,
            avatar_url: state.avatarUrl || null,
            banner_url: state.bannerUrl || null,
            role: state.role || "user",
            about: state.about || null,
            status: normalizePresence(state.presence),
        };
    } else {
        state.users[state.userId].status = normalizePresence(state.presence);
    }
}

function applyOwnPresenceState(nextPresence, shouldBroadcast = true) {
    state.presence = normalizePresence(nextPresence);
    localStorage.setItem("presence", state.presence);
    syncOwnPresenceInUsersMap();
    applyOwnPresenceUI();
    renderMembers();
    if (currentPopoutUserId === state.userId && state.users[state.userId]) {
        renderUserPopoutContent(state.userId, state.users[state.userId]);
    }
    if (shouldBroadcast) {
        broadcastPresence();
    }
}

const PRESENCE_CYCLE = ["online", "idle", "dnd", "invisible"];

function cycleOwnPresence() {
    const current = normalizePresence(state.presence);
    const idx = PRESENCE_CYCLE.indexOf(current);
    const next = PRESENCE_CYCLE[(idx + 1) % PRESENCE_CYCLE.length];
    applyOwnPresenceState(next, true);
}

function broadcastPresence() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    wsSend({
        type: "presence",
        user_id: state.userId,
        status: normalizePresence(state.presence)
    });
}

// ── Logout ─────────────────────────────────────────────
function logout() {
    if (state.voice?.joinedRoomId) {
        leaveVoiceRoom();
    }
    stopMicMeter();
    if (state.ws) state.ws.close();
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    state = {
        token: null, userId: null, username: null, role: null,
        avatarColor: 0, avatarUrl: null, bannerUrl: null, presence: localStorage.getItem("presence") || "online", about: "",
        currentRoomId: null, currentRoomName: null, currentRoomKind: null,
        ws: null, rooms: [], serverRoles: [], serverUsers: [], users: {}, unreadByRoom: {}, mentionByRoom: {}, messageMetaById: {}, replyingTo: null, pinnedMessageIds: new Set(), threadRootId: null, voice: createVoiceState()
    };
    updateGlobalMentionBadge();
    app.classList.add("hidden");
    settingsModal.classList.add("hidden");
    authModal.classList.remove("hidden");
    authUsername.value = "";
    authPassword.value = "";
    authError.textContent = "";
    updateVoiceQuickStatus();
}

logoutSettingsBtn.addEventListener("click", logout);

// ── Enter App ──────────────────────────────────────────
async function enterApp() {
    authModal.classList.add("hidden");
    app.classList.remove("hidden");
    await fetchMyProfile();
    updateUserPanel();
    loadRooms();
    connectWebSocket();
}

async function fetchMyProfile() {
    try {
        const res = await fetch(`${API}/api/users/me`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            state.role = data.role;
            state.avatarColor = data.avatar_color;
            state.about = data.about;
            state.avatarUrl = data.avatar_url || null;
            state.bannerUrl = data.banner_url || null;
            updateUserPanel();
        }
    } catch (err) {
        console.error("Failed to fetch profile", err);
    }
}

function updateUserPanel() {
    userAvatar.className = `user-avatar avatar-bg-${state.avatarColor % 8}`;
    if (state.avatarUrl) {
        userAvatar.innerHTML = `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
        userAvatar.textContent = state.username[0].toUpperCase();
    }
    userName.textContent = state.username;
    const disc = (hashString(state.username) % 9000) + 1000;
    userDiscriminator.textContent = `#${disc}`;
    applyOwnPresenceUI();
    if (serverSettingsBtn) {
        serverSettingsBtn.classList.toggle("hidden", state.role !== "admin");
    }
    if (state.role === "admin") {
        deleteRoomBtn.classList.remove("hidden");
    }
}

// ── Load Rooms ─────────────────────────────────────────
async function loadRooms() {
    try {
        const res = await fetch(`${API}/api/rooms`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });
        state.rooms = await res.json();
        state.rooms = state.rooms.map((room) => ({
            ...room,
            kind: room.kind === "voice" ? "voice" : "text",
            required_role: (room.required_role || "user").toLowerCase()
        }));

        if (state.currentRoomId && !state.rooms.find((r) => r.id === state.currentRoomId)) {
            if (state.voice.joinedRoomId) {
                leaveVoiceRoom();
            }
            state.currentRoomId = null;
            state.currentRoomName = null;
            state.currentRoomKind = null;
            currentRoomName.textContent = "Sélectionnez un salon";
            roomKindIcon.textContent = "#";
            messagesContainer.classList.remove("hidden");
            voiceRoomPanel.classList.add("hidden");
            messageInputArea.classList.add("hidden");
        }

        renderRooms();
    } catch (err) {
        console.error("Failed to load rooms:", err);
    }
}

function renderRooms() {
    roomsList.innerHTML = "";
    voiceRoomsList.innerHTML = "";

    state.rooms.forEach((room) => {
        const li = document.createElement("li");
        const icon = room.kind === "voice" ? "🔊" : "#";
        const lockBadge = room.required_role !== "user" ? `<span class="room-lock-badge" title="Rôle requis: ${escapeHtml(room.required_role)}">🔒</span>` : "";
        const unreadCount = room.id === state.currentRoomId ? 0 : (state.unreadByRoom[room.id] || 0);
        const mentionCount = room.id === state.currentRoomId ? 0 : (state.mentionByRoom[room.id] || 0);
        const unreadBadge = mentionCount > 0
            ? `<span class="room-unread-badge mention">@${mentionCount > 99 ? "99+" : mentionCount}</span>`
            : (unreadCount > 0
                ? `<span class="room-unread-badge">${unreadCount > 99 ? "99+" : unreadCount}</span>`
                : "");

        li.innerHTML = `
            <span class="room-icon">${icon}</span>
            <span class="room-name">${escapeHtml(room.name)}</span>
            ${lockBadge}
            ${unreadBadge}
        `;

        li.classList.toggle("has-unread", unreadCount > 0 || mentionCount > 0);
        li.classList.toggle("has-mention", mentionCount > 0);
        if (room.id === state.currentRoomId) li.classList.add("active");
        li.addEventListener("click", () => selectRoom(room));
        li.addEventListener("contextmenu", (e) => showContextMenu(e, "room", room.id, room.name));

        if (room.kind === "voice") {
            voiceRoomsList.appendChild(li);
        } else {
            roomsList.appendChild(li);
        }
    });
}

let roomsRenderQueued = false;
function scheduleRoomsRender() {
    if (roomsRenderQueued) return;
    roomsRenderQueued = true;
    requestAnimationFrame(() => {
        roomsRenderQueued = false;
        renderRooms();
    });
}

let membersRenderQueued = false;
function scheduleMembersRender() {
    if (membersRenderQueued) return;
    membersRenderQueued = true;
    requestAnimationFrame(() => {
        membersRenderQueued = false;
        renderMembers();
    });
}

let voiceMembersRenderQueued = false;
function scheduleVoiceMembersRender() {
    if (voiceMembersRenderQueued) return;
    voiceMembersRenderQueued = true;
    requestAnimationFrame(() => {
        voiceMembersRenderQueued = false;
        renderVoiceMembers();
    });
}

function updateRoomModeUI(roomKind, roomName) {
    if (roomKind === "voice") {
        roomKindIcon.textContent = "🔊";
        voiceRoomTitle.textContent = roomName || "Salon vocal";
        messagesContainer.classList.add("hidden");
        typingIndicator.classList.add("hidden");
        messageInputArea.classList.add("hidden");
        voiceRoomPanel.classList.remove("hidden");
        renderVoiceMembers();
    } else {
        roomKindIcon.textContent = "#";
        voiceRoomPanel.classList.add("hidden");
        messagesContainer.classList.remove("hidden");
        messageInputArea.classList.remove("hidden");
    }
    updateVoiceButtons();
    updateVoiceQuickStatus();
}

// ── Select Room ────────────────────────────────────────
async function selectRoom(room) {
    if (state.voice.joinedRoomId && state.voice.joinedRoomId !== room.id) {
        leaveVoiceRoom();
    }

    state.currentRoomId = room.id;
    state.messageMetaById = {};
    state.pinnedMessageIds = new Set();
    state.threadRootId = null;
    hideThreadPanel();
    clearReplyTarget();
    state.unreadByRoom[room.id] = 0;
    state.mentionByRoom[room.id] = 0;
    updateGlobalMentionBadge();
    state.currentRoomName = room.name;
    state.currentRoomKind = room.kind;
    currentRoomName.textContent = room.name;
    messageInput.placeholder = `Envoyer un message dans #${room.name}`;
    updateRoomModeUI(room.kind, room.name);

    if (state.role === "admin") {
        deleteRoomBtn.classList.remove("hidden");
    } else {
        deleteRoomBtn.classList.add("hidden");
    }

    renderRooms();

    if (room.kind === "text") {
        await loadMessages(room.id);
    }
}

let loadMessagesVersion = 0;
const MESSAGE_RENDER_CHUNK_SIZE = 40;

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadMessages(roomId) {
    const version = ++loadMessagesVersion;

    try {
        const res = await fetch(`${API}/api/rooms/${roomId}/messages`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });

        if (version !== loadMessagesVersion || state.currentRoomId !== roomId) {
            return;
        }

        if (!res.ok) {
            if (res.status === 403) {
                messagesContainer.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">🔒</div>
                        <h2>Accès refusé</h2>
                        <p>Vous n'avez pas les permissions pour lire ce salon.</p>
                    </div>
                `;
                messageInputArea.classList.add("hidden");
                return;
            }
            throw new Error("Failed to load messages");
        }

        const messages = await res.json();

        if (version !== loadMessagesVersion || state.currentRoomId !== roomId) {
            return;
        }

        messagesContainer.innerHTML = "";
        state.messageMetaById = {};
        state.pinnedMessageIds = new Set();

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">#</div>
                    <h2>Bienvenue dans #${escapeHtml(state.currentRoomName)} !</h2>
                    <p>C'est le début du salon. Envoyez le premier message !</p>
                </div>
            `;
        } else {
            let lastUsername = null;
            let lastDate = null;
            let index = 0;

            while (index < messages.length) {
                if (version !== loadMessagesVersion || state.currentRoomId !== roomId) {
                    return;
                }

                const fragment = document.createDocumentFragment();
                const end = Math.min(index + MESSAGE_RENDER_CHUNK_SIZE, messages.length);

                for (; index < end; index += 1) {
                    const msg = messages[index];
                    const msgDate = msg.created_at ? msg.created_at.split('T')[0] : null;
                    const dateChanged = lastDate && msgDate && msgDate !== lastDate;

                    if (dateChanged) {
                        const sep = document.createElement("div");
                        sep.className = "date-separator";
                        sep.innerHTML = `<span>${formatDateLabel(msgDate)}</span>`;
                        fragment.appendChild(sep);
                    }

                    const isFirstInGroup = lastUsername !== msg.username || dateChanged;
                    appendMessage(msg, isFirstInGroup, fragment);
                    if (msg.pinned_at) {
                        state.pinnedMessageIds.add(msg.id);
                    }
                    lastUsername = msg.username;
                    lastDate = msgDate;
                }

                messagesContainer.appendChild(fragment);
                await nextFrame();
            }
        }

        if (version !== loadMessagesVersion || state.currentRoomId !== roomId) {
            return;
        }

        scrollToBottom();
    } catch (err) {
        console.error("Failed to load messages:", err);
    }
}

// ── WebSocket & Member List ────────────────────────────
function connectWebSocket() {
    if (state.ws) {
        state.ws.onmessage = null;
        state.ws.onclose = null;
        state.ws.close();
    }

    state.ws = new WebSocket(WS_URL);

    state.ws.onopen = () => {
        console.log("✅ WebSocket connected");
        state.ws.send(JSON.stringify({
            type: "join",
            user_id: state.userId,
            username: state.username,
            avatar_color: state.avatarColor,
            avatar_url: state.avatarUrl || null,
            banner_url: state.bannerUrl || null,
            status: normalizePresence(state.presence),
            about: state.about || null,
            role: state.role || "user"
        }));

        if (state.voice.joinedRoomId) {
            state.ws.send(JSON.stringify({
                type: "voice_join",
                room_id: state.voice.joinedRoomId,
                user_id: state.userId,
                username: state.username,
                muted: state.voice.muted,
                deafened: state.voice.deafened,
                screen_sharing: state.voice.screenSharing,
            }));
        }
    };

    state.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            if (msg.type === "message" && msg.room_id === state.currentRoomId) {
                const lastMsg = messagesContainer.querySelector(".message:last-child");
                let isFirstInGroup = true;
                if (lastMsg) {
                    const lastUser = lastMsg.getAttribute("data-username");
                    if (lastUser === msg.username) isFirstInGroup = false;
                }
                appendMessage(msg, isFirstInGroup);
                scrollToBottom();
                if (state.threadRootId && (msg.id === state.threadRootId || msg.reply_to_id === state.threadRootId)) {
                    renderThreadPanel();
                }
            }
            else if (msg.type === "message" && msg.room_id && msg.username !== state.username) {
                state.unreadByRoom[msg.room_id] = (state.unreadByRoom[msg.room_id] || 0) + 1;
                if (messageMentionsCurrentUser(msg.content || "")) {
                    state.mentionByRoom[msg.room_id] = (state.mentionByRoom[msg.room_id] || 0) + 1;
                }
                updateGlobalMentionBadge();
                scheduleRoomsRender();
            }
            if (msg.type === "join") {
                if (msg.user_id && msg.username) {
                    const existing = state.users[msg.user_id];
                    const nextStatus = normalizePresence(msg.status || "online");
                    const changed = !existing
                        || existing.username !== msg.username
                        || (existing.avatar_color || 0) !== (msg.avatar_color || 0)
                        || (existing.avatar_url || null) !== (msg.avatar_url || null)
                        || (existing.banner_url || null) !== (msg.banner_url || null)
                        || (existing.role || "user") !== (msg.role || "user")
                        || (existing.about || null) !== (msg.about || null)
                        || normalizePresence(existing.status || "online") !== nextStatus;

                    state.users[msg.user_id] = {
                        username: msg.username,
                        avatar_color: msg.avatar_color || 0,
                        avatar_url: msg.avatar_url || null,
                        banner_url: msg.banner_url || null,
                        status: nextStatus,
                        role: msg.role || "user",
                        about: msg.about || null,
                    };
                    if (changed) {
                        scheduleMembersRender();
                    }

                    // Update popout if open for this user
                    if (currentPopoutUserId === msg.user_id) {
                        renderUserPopoutContent(msg.user_id, state.users[msg.user_id]);
                    }
                }
            }
            else if (msg.type === "presence") {
                if (msg.user_id && state.users[msg.user_id]) {
                    const nextStatus = normalizePresence(msg.status || "online");
                    if (state.users[msg.user_id].status !== nextStatus) {
                        state.users[msg.user_id].status = nextStatus;
                        scheduleMembersRender();
                    }
                    if (currentPopoutUserId === msg.user_id) {
                        renderUserPopoutContent(msg.user_id, state.users[msg.user_id]);
                    }
                }
            }
            else if (msg.type === "leave") {
                if (msg.user_id) {
                    delete state.users[msg.user_id];
                    cleanupRemotePeer(msg.user_id);
                    delete state.voice.members[msg.user_id];
                    scheduleVoiceMembersRender();
                    scheduleMembersRender();
                }
            }
            else if (msg.type === "room_deleted") {
                if (msg.room_id) {
                    delete state.unreadByRoom[msg.room_id];
                    delete state.mentionByRoom[msg.room_id];
                    updateGlobalMentionBadge();
                }
                if (state.currentRoomId === msg.room_id) {
                    if (state.voice.joinedRoomId === msg.room_id) {
                        leaveVoiceRoom();
                    }
                    state.currentRoomId = null;
                    state.currentRoomName = null;
                    state.currentRoomKind = null;
                    messagesContainer.innerHTML = "";
                    messageInputArea.classList.add("hidden");
                    voiceRoomPanel.classList.add("hidden");
                    currentRoomName.textContent = "Sélectionnez un salon";
                    roomKindIcon.textContent = "#";
                    deleteRoomBtn.classList.add("hidden");
                    updateVoiceQuickStatus();
                }
                loadRooms();
            }
            else if (msg.type === "room_updated") {
                if (msg.room_id) {
                    const room = state.rooms.find((r) => r.id === msg.room_id);
                    if (room) {
                        if (msg.name) room.name = String(msg.name);
                        if (msg.kind) room.kind = String(msg.kind) === "voice" ? "voice" : "text";
                        if (msg.required_role) room.required_role = String(msg.required_role).toLowerCase();

                        if (state.currentRoomId === room.id) {
                            state.currentRoomName = room.name;
                            state.currentRoomKind = room.kind;
                            currentRoomName.textContent = room.name;
                            messageInput.placeholder = `Envoyer un message dans #${room.name}`;
                            updateRoomModeUI(room.kind, room.name);
                            if (room.kind === "text") {
                                loadMessages(room.id);
                            }
                        }

                        scheduleRoomsRender();
                    } else {
                        loadRooms();
                    }
                }
            }
            else if (msg.type === "message_deleted") {
                if (msg.room_id === state.currentRoomId) {
                    const el = messagesContainer.querySelector(`.message[data-id="${msg.id}"]`);
                    if (el) el.remove();
                }
                if (msg.id && document.getElementById(MESSAGE_REACTION_PICKER_ID)?.getAttribute("data-message-id") === msg.id) {
                    closeMessageReactionPicker();
                }
                if (msg.id && state.messageMetaById[msg.id]) {
                    delete state.messageMetaById[msg.id];
                }
                if (msg.id) {
                    state.pinnedMessageIds.delete(msg.id);
                }
                if (state.threadRootId === msg.id) {
                    hideThreadPanel();
                } else if (state.threadRootId) {
                    renderThreadPanel();
                }
                if (state.replyingTo?.id === msg.id) {
                    clearReplyTarget();
                }
            }
            else if (msg.type === "message_pinned") {
                if (msg.room_id === state.currentRoomId && msg.id) {
                    state.pinnedMessageIds.add(msg.id);
                    const hasFlag = messagesContainer.querySelector(`.message[data-id="${msg.id}"] .message-pinned-flag`);
                    if (!hasFlag) {
                        const body = messagesContainer.querySelector(`.message[data-id="${msg.id}"] .message-body`);
                        if (body) {
                            const flag = document.createElement("div");
                            flag.className = "message-pinned-flag";
                            flag.textContent = "📌 Message épinglé";
                            body.prepend(flag);
                        }
                    }
                    if (pinnedModal && !pinnedModal.classList.contains("hidden")) {
                        loadPinnedMessages();
                    }
                }
            }
            else if (msg.type === "message_unpinned") {
                if (msg.room_id === state.currentRoomId && msg.id) {
                    state.pinnedMessageIds.delete(msg.id);
                    const flag = messagesContainer.querySelector(`.message[data-id="${msg.id}"] .message-pinned-flag`);
                    if (flag) flag.remove();
                    if (pinnedModal && !pinnedModal.classList.contains("hidden")) {
                        loadPinnedMessages();
                    }
                }
            }
            else if (msg.type === "message_reaction_updated") {
                if (msg.message_id && msg.emoji) {
                    mergeMessageReaction(msg.message_id, msg.emoji, msg.count, msg.user_ids);
                    if (msg.room_id === state.currentRoomId) {
                        refreshMessageReactionUI(msg.message_id);
                    }
                }
            }
            else if (msg.type === "messages_purged") {
                if (state.currentRoomKind === "text") {
                    const selector = `.message[data-user-id="${msg.user_id}"]`;
                    messagesContainer.querySelectorAll(selector).forEach((el) => el.remove());
                }
                Object.keys(state.messageMetaById).forEach((id) => {
                    if (state.messageMetaById[id]?.user_id === msg.user_id) {
                        delete state.messageMetaById[id];
                        state.pinnedMessageIds.delete(id);
                    }
                });
                if (state.threadRootId) {
                    renderThreadPanel();
                }
            }
            else if (msg.type === "typing") {
                if (msg.username !== state.username && msg.room_id === state.currentRoomId) {
                    showTypingIndicator(msg.username);
                }
            }
            else if (msg.type === "voice_join" || msg.type === "voice_leave" || msg.type === "voice_state" || msg.type === "voice_signal") {
                handleVoiceWsEvent(msg);
            }
        } catch (err) {
            console.error("WS error:", err);
        }
    };

    state.ws.onclose = () => {
        resetVoiceConnections();
        setTimeout(connectWebSocket, 3000);
    };
}

function wsSend(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify(payload));
}

voiceController = window.VoxiumVoice.createVoiceController({
    getState: () => state,
    API,
    WEBRTC_CONFIG,
    wsSend,
    escapeHtml,
    hashString,
    dom: {
        joinVoiceBtn,
        leaveVoiceBtn,
        voiceMuteBtn,
        voiceDeafenBtn,
        voiceScreenBtn,
        muteBtn,
        deafenBtn,
        voiceMeterBars,
        voiceMeterLabel,
        voiceQuickStatus,
        voiceStatusText,
        voiceRoomChip,
        voiceRoomSubtitle,
        voiceMembersList,
        voiceScreensWrap,
        voiceScreensGrid,
        voiceScreenQualitySelect,
        voiceScreenFpsSelect,
    },
});

contextController = window.VoxiumContext.createContextController({
    getState: () => state,
    API,
    updateRoomModeUI,
    loadMessages,
    renderRooms,
    dom: {
        contextMenu,
        ctxHeaderTitle,
        ctxCopyId,
        ctxDeleteRoom,
        ctxRoomSettings,
        ctxDeleteMessage,
        ctxPromoteAdmin,
        ctxPurgeUserMessages,
        roomSettingsModal,
        roomSettingsForm,
        roomSettingsName,
        roomSettingsKind,
        roomSettingsRequiredRole,
        roomPrivacyPublicBtn,
        roomPrivacyPrivateBtn,
        roomSettingsCancelBtn,
        roomSettingsFeedback,
        currentRoomName,
        messageInput,
    },
});
contextController.bindEvents();

function updateVoiceButtons() {
    return voiceController.updateVoiceButtons();
}

function renderMicMeter(level) {
    return voiceController.renderMicMeter(level);
}

function updateVoiceQuickStatus() {
    return voiceController.updateVoiceQuickStatus();
}

function stopMicMeter() {
    return voiceController.stopMicMeter();
}

function startMicMeter(stream) {
    return voiceController.startMicMeter(stream);
}

function renderVoiceMembers() {
    return voiceController.renderVoiceMembers();
}

function updateVoiceScreensVisibility() {
    return voiceController.updateVoiceScreensVisibility();
}

function removeRemoteScreenTile(userId) {
    return voiceController.removeRemoteScreenTile(userId);
}

function syncRemoteScreenTile(userId, stream) {
    return voiceController.syncRemoteScreenTile(userId, stream);
}

function applyLocalTrackState() {
    return voiceController.applyLocalTrackState();
}

function ensureVoiceMember(userId, username) {
    return voiceController.ensureVoiceMember(userId, username);
}

function cleanupRemotePeer(userId) {
    return voiceController.cleanupRemotePeer(userId);
}

function resetVoiceConnections() {
    return voiceController.resetVoiceConnections();
}

function createPeerConnection(remoteUserId, shouldCreateOffer) {
    return voiceController.createPeerConnection(remoteUserId, shouldCreateOffer);
}

async function handleVoiceSignal(msg) {
    return voiceController.handleVoiceSignal(msg);
}

async function renegotiatePeer(remoteUserId) {
    return voiceController.renegotiatePeer(remoteUserId);
}

function broadcastVoiceState() {
    return voiceController.broadcastVoiceState();
}

async function startScreenShare() {
    return voiceController.startScreenShare();
}

async function stopScreenShare(shouldBroadcast = true, shouldRenegotiate = true) {
    return voiceController.stopScreenShare(shouldBroadcast, shouldRenegotiate);
}

function handleVoiceWsEvent(msg) {
    return voiceController.handleVoiceWsEvent(msg);
}

async function joinVoiceRoom() {
    return voiceController.joinVoiceRoom();
}

function leaveVoiceRoom() {
    return voiceController.leaveVoiceRoom();
}

function toggleVoiceMute() {
    return voiceController.toggleVoiceMute();
}

function toggleVoiceDeafen() {
    return voiceController.toggleVoiceDeafen();
}

function toggleVoiceScreenShare() {
    return voiceController.toggleVoiceScreenShare();
}

function renderMembers() {
    membersList.innerHTML = "";
    const entries = Object.entries(state.users);
    memberCount.textContent = entries.length;

    entries.forEach(([uid, u]) => {
        const li = document.createElement("li");
        const status = normalizePresence(u.status || "online");
        const avatarContent = u.avatar_url
            ? `<img src="${API}${u.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
            : u.username[0].toUpperCase();
        li.innerHTML = `
            <div class="member-avatar-wrapper">
                <div class="avatar avatar-bg-${u.avatar_color % 8}">
                    ${avatarContent}
                </div>
                <div class="status-dot ${presenceDotClass(status)}"></div>
            </div>
            <div class="member-meta">
                <div class="name">${escapeHtml(u.username)}</div>
                <div class="member-status-label">${presenceLabel(status)}</div>
            </div>
        `;
        li.addEventListener("contextmenu", (e) => showContextMenu(e, "user", uid, u.username));
        li.addEventListener("click", (e) => showUserPopout(e, uid, u));
        membersList.appendChild(li);
    });
}

function escapeRegExp(value) {
    return (value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageMentionsCurrentUser(content) {
    if (!content || !state.username) return false;
    const usernamePattern = escapeRegExp(state.username);
    const mentionRegex = new RegExp(`(^|\\s)@${usernamePattern}(?=\\b|\\s|$)`, "i");
    return mentionRegex.test(content);
}

function renderMessageContentHtml(content) {
    const escaped = escapeHtml(content || "");
    return escaped.replace(/(^|\s)(@[\w-]{2,32})/g, (match, prefix, tag) => {
        const selfTag = `@${state.username || ""}`;
        const isSelf = selfTag.length > 1 && tag.toLowerCase() === selfTag.toLowerCase();
        const cls = isSelf ? "mention-token is-self" : "mention-token";
        return `${prefix}<span class="${cls}">${tag}</span>`;
    });
}

function normalizeReactions(reactions) {
    if (!Array.isArray(reactions)) return [];
    return reactions
        .map((item) => ({
            emoji: (item?.emoji || "").trim(),
            count: Math.max(0, Number(item?.count) || 0),
            user_ids: Array.isArray(item?.user_ids) ? item.user_ids.map((id) => String(id)) : [],
        }))
        .filter((item) => item.emoji && item.count > 0)
        .sort((a, b) => (b.count - a.count) || a.emoji.localeCompare(b.emoji));
}

function renderReactionBadgesHtml(reactions) {
    const normalized = normalizeReactions(reactions);
    if (!normalized.length) return "";

    const chips = normalized.map((reaction) => {
        const reactedByMe = reaction.user_ids.includes(state.userId);
        return `
            <button class="message-reaction-chip${reactedByMe ? " is-active" : ""}" data-emoji="${escapeHtml(reaction.emoji)}" title="Réagir avec ${escapeHtml(reaction.emoji)}">
                <span class="message-reaction-emoji">${escapeHtml(reaction.emoji)}</span>
                <span class="message-reaction-count">${reaction.count}</span>
            </button>
        `;
    }).join("");

    return `<div class="message-reactions">${chips}</div>`;
}

function ensureMessageReactionPicker() {
    let picker = document.getElementById(MESSAGE_REACTION_PICKER_ID);
    if (picker) return picker;

    picker = document.createElement("div");
    picker.id = MESSAGE_REACTION_PICKER_ID;
    picker.className = "message-reaction-picker hidden";
    document.body.appendChild(picker);
    return picker;
}

function closeMessageReactionPicker() {
    const picker = document.getElementById(MESSAGE_REACTION_PICKER_ID);
    if (!picker) return;
    picker.classList.add("hidden");
    picker.innerHTML = "";
    picker.removeAttribute("data-message-id");
}

function openMessageReactionPicker(anchorBtn, messageId) {
    if (!anchorBtn || !messageId) return;

    const picker = ensureMessageReactionPicker();
    const isSameMessageOpen = !picker.classList.contains("hidden") && picker.getAttribute("data-message-id") === messageId;
    if (isSameMessageOpen) {
        closeMessageReactionPicker();
        return;
    }

    picker.setAttribute("data-message-id", messageId);
    picker.innerHTML = QUICK_REACTION_EMOJIS.map((emoji) => (
        `<button class="message-reaction-picker-btn" type="button" data-emoji="${escapeHtml(emoji)}" title="Réagir avec ${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`
    )).join("");

    picker.onclick = (event) => {
        const btn = event.target.closest(".message-reaction-picker-btn");
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        const emoji = btn.getAttribute("data-emoji");
        if (!emoji) return;
        toggleMessageReaction(messageId, emoji);
        closeMessageReactionPicker();
    };

    picker.classList.remove("hidden");

    const rect = anchorBtn.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const margin = 8;
    let top = rect.top + window.scrollY - pickerRect.height - margin;
    if (top < margin) {
        top = rect.bottom + window.scrollY + margin;
    }

    const maxLeft = window.scrollX + window.innerWidth - pickerRect.width - margin;
    const centeredLeft = rect.left + window.scrollX + (rect.width / 2) - (pickerRect.width / 2);
    const left = Math.max(window.scrollX + margin, Math.min(centeredLeft, maxLeft));

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
}

document.addEventListener("click", (event) => {
    const picker = document.getElementById(MESSAGE_REACTION_PICKER_ID);
    if (!picker || picker.classList.contains("hidden")) return;
    const clickedReactBtn = !!event.target.closest(".msg-action-btn.react");
    if (!picker.contains(event.target) && !clickedReactBtn) {
        closeMessageReactionPicker();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeMessageReactionPicker();
    }
});

function mergeMessageReaction(messageId, emoji, count, userIds) {
    const meta = state.messageMetaById[messageId];
    if (!meta || !emoji) return;

    const normalizedUsers = Array.isArray(userIds) ? userIds.map((id) => String(id)) : [];
    const reactions = Array.isArray(meta.reactions) ? [...meta.reactions] : [];
    const nextCount = Math.max(0, Number(count) || 0);
    const index = reactions.findIndex((item) => item.emoji === emoji);

    if (nextCount <= 0) {
        if (index >= 0) reactions.splice(index, 1);
    } else if (index >= 0) {
        reactions[index] = { emoji, count: nextCount, user_ids: normalizedUsers };
    } else {
        reactions.push({ emoji, count: nextCount, user_ids: normalizedUsers });
    }

    meta.reactions = normalizeReactions(reactions);
}

function refreshMessageReactionUI(messageId) {
    if (!messageId) return;
    const meta = state.messageMetaById[messageId];
    if (!meta) return;

    const messageEl = messagesContainer.querySelector(`.message[data-id="${messageId}"]`);
    if (!messageEl) return;

    const body = messageEl.querySelector(".message-body");
    if (!body) return;

    const existing = body.querySelector(".message-reactions");
    if (existing) existing.remove();

    const html = renderReactionBadgesHtml(meta.reactions || []);
    if (!html) return;

    body.insertAdjacentHTML("beforeend", html);
    const wrapper = body.querySelector(".message-reactions");
    if (wrapper) {
        wrapper.addEventListener("click", (event) => {
            const chip = event.target.closest(".message-reaction-chip");
            if (!chip) return;
            event.preventDefault();
            event.stopPropagation();
            const emoji = chip.getAttribute("data-emoji");
            if (!emoji) return;
            toggleMessageReaction(messageId, emoji);
        });
    }
}

async function toggleMessageReaction(messageId, emoji) {
    if (!messageId || !emoji || !state.token) return;
    const meta = state.messageMetaById[messageId];
    if (!meta) return;

    const current = (meta.reactions || []).find((item) => item.emoji === emoji);
    const reactedByMe = !!current?.user_ids?.includes(state.userId);

    try {
        const res = await fetch(`${API}/api/messages/${messageId}/reactions`, {
            method: reactedByMe ? "DELETE" : "POST",
            headers: {
                Authorization: `Bearer ${state.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ emoji }),
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (!res.ok) {
            alert(data?.error || "Erreur");
            return;
        }

        if (data?.message_id && data?.emoji) {
            mergeMessageReaction(data.message_id, data.emoji, data.count, data.user_ids);
            if (data.room_id === state.currentRoomId) {
                refreshMessageReactionUI(data.message_id);
            }
        }
    } catch (err) {
        alert("Erreur réseau");
    }
}

function setReplyTarget(target) {
    if (!target || !target.id) return;
    state.replyingTo = {
        id: target.id,
        username: target.username || "Utilisateur",
        snippet: target.snippet || "Message",
    };
    if (replyTargetName) replyTargetName.textContent = state.replyingTo.username;
    if (replyTargetSnippet) replyTargetSnippet.textContent = state.replyingTo.snippet;
    replyPreview?.classList.remove("hidden");
    messageInput?.focus();
}

function clearReplyTarget() {
    state.replyingTo = null;
    if (replyTargetName) replyTargetName.textContent = "Utilisateur";
    if (replyTargetSnippet) replyTargetSnippet.textContent = "";
    replyPreview?.classList.add("hidden");
}

function hideThreadPanel() {
    state.threadRootId = null;
    threadPanel?.classList.add("hidden");
    chatArea?.classList.remove("thread-open");
    if (threadRoot) threadRoot.innerHTML = "";
    if (threadReplies) threadReplies.innerHTML = "";
    if (threadInput) threadInput.value = "";
}

function renderThreadPanel() {
    if (!state.threadRootId || !threadPanel) return;
    const rootMsg = state.messageMetaById[state.threadRootId];
    if (!rootMsg) {
        hideThreadPanel();
        return;
    }

    threadPanel.classList.remove("hidden");
    chatArea?.classList.add("thread-open");

    const rootText = (rootMsg.content && rootMsg.content.trim()) || (rootMsg.image_url ? "[Image]" : "Message");
    threadRoot.innerHTML = `
        <div class="thread-item">
            <div class="thread-item-user">${escapeHtml(rootMsg.username || "Utilisateur")}</div>
            <div class="thread-item-content">${escapeHtml(rootText)}</div>
        </div>
    `;

    const replies = Object.values(state.messageMetaById)
        .filter((m) => m.reply_to_id === state.threadRootId)
        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

    if (!replies.length) {
        threadReplies.innerHTML = `<div class="thread-item"><div class="thread-item-content">Aucune réponse pour l’instant.</div></div>`;
        return;
    }

    threadReplies.innerHTML = "";
    replies.forEach((reply) => {
        const content = (reply.content && reply.content.trim()) || (reply.image_url ? "[Image]" : "Message");
        const row = document.createElement("div");
        row.className = "thread-item";
        row.innerHTML = `
            <div class="thread-item-user">${escapeHtml(reply.username || "Utilisateur")}</div>
            <div class="thread-item-content">${escapeHtml(content)}</div>
        `;
        row.addEventListener("click", () => {
            const el = messagesContainer.querySelector(`.message[data-id="${reply.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("message-mentioned");
                setTimeout(() => el.classList.remove("message-mentioned"), 1200);
            }
        });
        threadReplies.appendChild(row);
    });
}

function openThreadForMessage(messageId) {
    if (!messageId) return;
    state.threadRootId = messageId;
    renderThreadPanel();
}

function appendMessage(msg, isFirstInGroup = true, parent = messagesContainer) {
    const div = document.createElement("div");
    div.classList.add("message");
    div.setAttribute("data-username", msg.username);
    div.setAttribute("data-id", msg.id);
    if (msg.user_id) {
        div.setAttribute("data-user-id", msg.user_id);
    }
    if (isFirstInGroup) div.classList.add("first-in-group");

    div.addEventListener("contextmenu", (e) => showContextMenu(e, "message", msg.id, msg.username));

    const colorIndex = hashString(msg.username) % 8;
    const time = formatTime(msg.created_at);
    const normalizedReactions = normalizeReactions(msg.reactions || []);

    state.messageMetaById[msg.id] = {
        id: msg.id,
        username: msg.username,
        user_id: msg.user_id,
        content: msg.content || "",
        image_url: msg.image_url || null,
        created_at: msg.created_at || null,
        reply_to_id: msg.reply_to_id || null,
        avatar_url: msg.avatar_url || null,
        reactions: normalizedReactions,
    };

    // Build message actions bar
    const actionsHtml = `
        <div class="message-actions">
            <button class="msg-action-btn react" title="Réagir">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
            </button>
            <button class="msg-action-btn reply" title="Répondre">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 17 4 12 9 7"></polyline>
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                </svg>
            </button>
            <button class="msg-action-btn thread" title="Ouvrir le thread">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
            ${(state.role === "admin") ? `
            <button class="msg-action-btn pin" title="${state.pinnedMessageIds.has(msg.id) || msg.pinned_at ? "Désépingler" : "Épingler"}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 17v5"></path>
                    <path d="M5 7h14"></path>
                    <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3"></path>
                    <path d="M6 7l2 8h8l2-8"></path>
                </svg>
            </button>` : ''}
            ${(state.role === "admin" || msg.username === state.username) ? `
            <button class="msg-action-btn danger" title="Supprimer" onclick="deleteMessageFromBtn('${msg.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>` : ''}
        </div>
    `;

    // Build image HTML if present
    const imageHtml = msg.image_url ? `
        <div class="message-image-wrapper">
            <img class="message-image" src="${API}${msg.image_url}" alt="image" onclick="openLightbox('${API}${msg.image_url}')" />
        </div>
    ` : '';

    // Detect emoji-only messages for jumbo display
    const emojiClass = msg.content ? getEmojiClass(msg.content) : '';
    const mentionsMe = msg.username !== state.username && messageMentionsCurrentUser(msg.content || "");
    if (mentionsMe) {
        div.classList.add("message-mentioned");
    }
    const contentHtml = msg.content
        ? `<div class="message-content${emojiClass ? ' ' + emojiClass : ''}">${renderMessageContentHtml(msg.content)}</div>`
        : '';
    const reactionsHtml = renderReactionBadgesHtml(normalizedReactions);

    const pinnedFlagHtml = msg.pinned_at ? `<div class="message-pinned-flag">📌 Message épinglé</div>` : "";

    let replyRefHtml = "";
    if (msg.reply_to_id) {
        const parent = state.messageMetaById[msg.reply_to_id];
        const parentName = parent?.username || "Message";
        const parentSnippet = parent
            ? ((parent.content && parent.content.trim()) || (parent.image_url ? "[Image]" : "Message"))
            : "Message introuvable";

        replyRefHtml = `
            <div class="message-reply-ref" data-reply-target="${escapeHtml(msg.reply_to_id)}" title="Aller au message d'origine">
                <span>↪</span>
                <span class="message-reply-user">${escapeHtml(parentName)}</span>
                <span class="message-reply-snippet">${escapeHtml(parentSnippet)}</span>
            </div>
        `;
    }

    // Avatar content — show profile image if available
    const avatarContent = msg.avatar_url
        ? `<img src="${API}${msg.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : msg.username[0].toUpperCase();

    if (isFirstInGroup) {
        div.innerHTML = `
            ${actionsHtml}
            <div class="message-avatar avatar-bg-${colorIndex}">${avatarContent}</div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-username name-color-${colorIndex}">${escapeHtml(msg.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${pinnedFlagHtml}
                ${replyRefHtml}
                ${contentHtml}
                ${imageHtml}
                ${reactionsHtml}
            </div>
        `;
    } else {
        div.innerHTML = `
            ${actionsHtml}
            <div class="message-avatar placeholder"></div>
            <div class="message-body">
                ${pinnedFlagHtml}
                ${replyRefHtml}
                ${contentHtml}
                ${imageHtml}
                ${reactionsHtml}
            </div>
        `;
    }

    const reactBtn = div.querySelector(".msg-action-btn.react");
    if (reactBtn) {
        reactBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openMessageReactionPicker(reactBtn, msg.id);
        });
    }

    const reactionsWrap = div.querySelector(".message-reactions");
    if (reactionsWrap) {
        reactionsWrap.addEventListener("click", (event) => {
            const chip = event.target.closest(".message-reaction-chip");
            if (!chip) return;
            event.preventDefault();
            event.stopPropagation();
            const emoji = chip.getAttribute("data-emoji");
            if (!emoji) return;
            toggleMessageReaction(msg.id, emoji);
        });
    }

    const replyBtn = div.querySelector(".msg-action-btn.reply");
    if (replyBtn) {
        replyBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const previewSnippet = (msg.content && msg.content.trim()) || (msg.image_url ? "[Image]" : "Message");
            setReplyTarget({
                id: msg.id,
                username: msg.username,
                snippet: previewSnippet,
            });
        });
    }

    const threadBtn = div.querySelector(".msg-action-btn.thread");
    if (threadBtn) {
        threadBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openThreadForMessage(msg.id);
        });
    }

    const pinBtn = div.querySelector(".msg-action-btn.pin");
    if (pinBtn) {
        pinBtn.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!state.currentRoomId || state.currentRoomKind !== "text") return;

            const alreadyPinned = state.pinnedMessageIds.has(msg.id) || !!msg.pinned_at;
            try {
                const res = await fetch(`${API}/api/messages/${msg.id}/pin`, {
                    method: alreadyPinned ? "DELETE" : "POST",
                    headers: { Authorization: `Bearer ${state.token}` }
                });
                if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || "Erreur");
                }
            } catch (e) {
                alert("Erreur réseau");
            }
        });
    }

    const replyRef = div.querySelector(".message-reply-ref");
    if (replyRef) {
        replyRef.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const targetId = replyRef.getAttribute("data-reply-target");
            if (!targetId) return;
            const targetEl = messagesContainer.querySelector(`.message[data-id="${targetId}"]`);
            if (!targetEl) return;
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            targetEl.classList.add("message-mentioned");
            setTimeout(() => targetEl.classList.remove("message-mentioned"), 1200);
        });
    }

    parent.appendChild(div);
}

// Expose for inline onclick
window.deleteMessageFromBtn = async function (msgId) {
    if (!confirm("Supprimer ce message ?")) return;
    try {
        const res = await fetch(`${API}/api/messages/${msgId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${state.token}` }
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Erreur");
        }
    } catch (e) { alert("Erreur réseau"); }
};

// ── Send Message ───────────────────────────────────────
let pendingImageUrl = null;
const fileInput = $("#file-input");
const attachBtn = $("#attach-btn");
const uploadPreview = $("#upload-preview");
const uploadPreviewImg = $("#upload-preview-img");
const uploadFilename = $("#upload-filename");
const uploadCancelBtn = $("#upload-cancel-btn");

// File attach button
attachBtn.addEventListener("click", () => fileInput.click());

// File selected
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadPreviewImg.src = e.target.result;
        uploadFilename.textContent = file.name;
        uploadPreview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
});

// Cancel upload
uploadCancelBtn.addEventListener("click", () => {
    fileInput.value = "";
    pendingImageUrl = null;
    uploadPreview.classList.add("hidden");
});

messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();
    const file = fileInput.files[0];
    if (!content && !file) return;
    if (state.currentRoomKind !== "text") return;
    if (!state.currentRoomId || !state.ws) return;

    let imageUrl = null;

    // Upload image first if there is one
    if (file) {
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${API}/api/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${state.token}` },
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                imageUrl = data.url;
            } else {
                const data = await res.json();
                alert(data.error || "Erreur d'upload");
                return;
            }
        } catch (err) {
            alert("Erreur réseau lors de l'upload");
            return;
        }
    }

    const msg = {
        type: "message",
        room_id: state.currentRoomId,
        user_id: state.userId,
        username: state.username,
        content: content || "",
        avatar_color: state.avatarColor
    };
    if (state.replyingTo?.id) {
        msg.reply_to_id = state.replyingTo.id;
    }
    if (imageUrl) msg.image_url = imageUrl;

    state.ws.send(JSON.stringify(msg));
    messageInput.value = "";
    fileInput.value = "";
    uploadPreview.classList.add("hidden");
    clearReplyTarget();
});

if (replyCancelBtn) {
    replyCancelBtn.addEventListener("click", () => {
        clearReplyTarget();
    });
}

async function loadPinnedMessages() {
    if (!state.currentRoomId || state.currentRoomKind !== "text") return;
    try {
        const res = await fetch(`${API}/api/rooms/${state.currentRoomId}/pins`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });
        if (!res.ok) {
            pinnedList.innerHTML = `<div class="pinned-item">Impossible de charger les messages épinglés.</div>`;
            return;
        }

        const items = await res.json();
        if (!items.length) {
            pinnedList.innerHTML = `<div class="pinned-item">Aucun message épinglé dans ce salon.</div>`;
            return;
        }

        pinnedList.innerHTML = "";
        items.forEach((item) => {
            const row = document.createElement("div");
            row.className = "pinned-item";
            row.innerHTML = `
                <div class="pinned-item-header">
                    <span class="pinned-item-user">${escapeHtml(item.username || "Utilisateur")}</span>
                    <span class="pinned-item-time">${escapeHtml(formatTime(item.created_at))}</span>
                </div>
                <div class="pinned-item-content">${escapeHtml((item.content && item.content.trim()) || (item.image_url ? "[Image]" : "Message"))}</div>
            `;
            row.addEventListener("click", () => {
                pinnedModal.classList.add("hidden");
                const target = messagesContainer.querySelector(`.message[data-id="${item.id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "center" });
                    target.classList.add("message-mentioned");
                    setTimeout(() => target.classList.remove("message-mentioned"), 1200);
                }
            });
            pinnedList.appendChild(row);
        });
    } catch (err) {
        pinnedList.innerHTML = `<div class="pinned-item">Erreur réseau.</div>`;
    }
}

if (pinnedBtn) {
    pinnedBtn.addEventListener("click", async () => {
        if (state.currentRoomKind !== "text") {
            alert("Les épinglés sont disponibles dans les salons textuels.");
            return;
        }
        pinnedModal.classList.remove("hidden");
        await loadPinnedMessages();
    });
}

if (pinnedCloseBtn) {
    pinnedCloseBtn.addEventListener("click", () => {
        pinnedModal.classList.add("hidden");
    });
}

if (pinnedModal) {
    pinnedModal.addEventListener("click", (event) => {
        if (event.target === pinnedModal) {
            pinnedModal.classList.add("hidden");
        }
    });
}

if (threadCloseBtn) {
    threadCloseBtn.addEventListener("click", () => {
        hideThreadPanel();
    });
}

if (threadForm) {
    threadForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const content = threadInput?.value?.trim() || "";
        if (!content || !state.threadRootId || state.currentRoomKind !== "text") return;
        if (!state.currentRoomId || !state.ws) return;

        const msg = {
            type: "message",
            room_id: state.currentRoomId,
            user_id: state.userId,
            username: state.username,
            content,
            avatar_color: state.avatarColor,
            reply_to_id: state.threadRootId,
        };

        state.ws.send(JSON.stringify(msg));
        threadInput.value = "";
    });
}

// ── Typing Indicator ───────────────────────────────────
let typingTimeout = null;
let isTyping = false;

messageInput.addEventListener("input", () => {
    if (!state.ws || !state.currentRoomId) return;
    if (!isTyping) {
        isTyping = true;
        state.ws.send(JSON.stringify({
            type: "typing",
            room_id: state.currentRoomId,
            username: state.username
        }));
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { isTyping = false; }, 3000);
});

let typingHideTimeout = null;
function showTypingIndicator(username) {
    typingText.textContent = `${username} est en train d'écrire...`;
    typingIndicator.classList.remove("hidden");
    clearTimeout(typingHideTimeout);
    typingHideTimeout = setTimeout(() => {
        typingIndicator.classList.add("hidden");
    }, 4000);
}

// ── Admin: Delete Room ─────────────────────────────────
deleteRoomBtn.addEventListener("click", async () => {
    if (!confirm(`Voulez-vous vraiment supprimer le salon #${state.currentRoomName} ?`)) return;
    try {
        const res = await fetch(`${API}/api/rooms/${state.currentRoomId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${state.token}` }
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Erreur lors de la suppression");
        }
    } catch (err) {
        alert("Erreur réseau");
    }
});

// ── Members Toggle ─────────────────────────────────────
membersToggleBtn.addEventListener("click", () => {
    membersVisible = !membersVisible;
    membersSidebar.style.display = membersVisible ? "" : "none";
});

joinVoiceBtn.addEventListener("click", () => {
    joinVoiceRoom();
});

leaveVoiceBtn.addEventListener("click", () => {
    leaveVoiceRoom();
});

voiceMuteBtn.addEventListener("click", () => {
    toggleVoiceMute();
});

voiceDeafenBtn.addEventListener("click", () => {
    toggleVoiceDeafen();
});

voiceScreenBtn.addEventListener("click", () => {
    toggleVoiceScreenShare();
});

if (voiceScreenQualitySelect) {
    voiceScreenQualitySelect.addEventListener("change", () => {
        handleScreenSettingsChange();
    });
}

if (voiceScreenFpsSelect) {
    voiceScreenFpsSelect.addEventListener("change", () => {
        handleScreenSettingsChange();
    });
}

syncScreenShareSettingsUI();

muteBtn.addEventListener("click", () => {
    toggleVoiceMute();
});

deafenBtn.addEventListener("click", () => {
    toggleVoiceDeafen();
});

if (presenceSelect) {
    presenceSelect.addEventListener("change", () => {
        applyOwnPresenceState(presenceSelect.value, true);
    });
}

if (selfStatusDot) {
    selfStatusDot.title = "Cliquer pour changer le statut";
    selfStatusDot.addEventListener("click", (event) => {
        event.stopPropagation();
        cycleOwnPresence();
    });
}

// ── Chat Search (client-side filter) ───────────────────
chatSearch.addEventListener("input", () => {
    const query = chatSearch.value.toLowerCase();
    const messages = messagesContainer.querySelectorAll(".message");
    messages.forEach((msg) => {
        const content = msg.querySelector(".message-content");
        if (!content) return;
        if (query === "") {
            msg.style.display = "";
        } else {
            msg.style.display = content.textContent.toLowerCase().includes(query) ? "" : "none";
        }
    });
});

// ═══ Settings Logic ════════════════════════════════════

function switchSettingsSection(sectionName) {
    document.querySelectorAll(".settings-nav-item").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.section === sectionName);
    });

    document.querySelectorAll(".settings-section").forEach((section) => {
        section.classList.remove("active");
    });

    const target = document.getElementById(`section-${sectionName}`);
    if (target) {
        target.classList.add("active");
    }

    if (settingsContentInner) {
        settingsContentInner.scrollTop = 0;
    }
}

function filterSettingsNav(query) {
    const normalized = (query || "").trim().toLowerCase();
    document.querySelectorAll(".settings-nav-item").forEach((item) => {
        const label = item.textContent.toLowerCase();
        if (!normalized || label.includes(normalized) || item.classList.contains("danger")) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });
}

function setServerSettingsFeedback(message, isError = false) {
    if (!serverSettingsFeedback) return;
    serverSettingsFeedback.textContent = message || "";
    serverSettingsFeedback.style.color = isError ? "var(--red)" : "var(--green)";
}

function renderServerRoles() {
    if (!serverRolesList || !serverRoleSelect) return;

    const roles = Array.isArray(state.serverRoles) ? state.serverRoles : [];

    serverRolesList.innerHTML = "";
    if (roles.length === 0) {
        serverRolesList.innerHTML = `<div class="server-role-item"><span class="server-role-name">Aucun rôle.</span></div>`;
    } else {
        roles.forEach((role) => {
            const row = document.createElement("div");
            row.className = "server-role-item";

            const canDelete = role.name !== "admin" && role.name !== "user";
            row.innerHTML = `
                <div class="server-role-left">
                    <span class="server-role-dot" style="background:${escapeHtml(role.color || "#99aab5")}"></span>
                    <span class="server-role-name">${escapeHtml(role.name)}</span>
                </div>
                <button class="server-role-delete" data-role="${escapeHtml(role.name)}" ${canDelete ? "" : "disabled"}>Suppr.</button>
            `;

            const delBtn = row.querySelector(".server-role-delete");
            if (delBtn && canDelete) {
                delBtn.addEventListener("click", async () => {
                    if (!confirm(`Supprimer le rôle \"${role.name}\" ?`)) return;
                    try {
                        const res = await fetch(`${API}/api/server/roles/${encodeURIComponent(role.name)}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${state.token}` }
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            setServerSettingsFeedback(data.error || "Erreur", true);
                            return;
                        }
                        await loadServerSettingsData();
                        setServerSettingsFeedback("Rôle supprimé.");
                    } catch (err) {
                        setServerSettingsFeedback("Erreur réseau.", true);
                    }
                });
            }

            serverRolesList.appendChild(row);
        });
    }

    const currentSelected = serverRoleSelect.value;
    serverRoleSelect.innerHTML = "";
    roles.forEach((role) => {
        const opt = document.createElement("option");
        opt.value = role.name;
        opt.textContent = role.name;
        serverRoleSelect.appendChild(opt);
    });
    if (roles.some((r) => r.name === currentSelected)) {
        serverRoleSelect.value = currentSelected;
    }
}

function renderServerUsers() {
    if (!serverUserSelect) return;
    const users = Array.isArray(state.serverUsers) ? state.serverUsers : [];
    const currentSelected = serverUserSelect.value;

    serverUserSelect.innerHTML = "";
    users.forEach((user) => {
        const opt = document.createElement("option");
        opt.value = user.id;
        opt.textContent = `${user.username} (${user.role})`;
        serverUserSelect.appendChild(opt);
    });

    if (users.some((u) => u.id === currentSelected)) {
        serverUserSelect.value = currentSelected;
    }
}

async function loadServerSettingsData() {
    const [rolesRes, usersRes] = await Promise.all([
        fetch(`${API}/api/server/roles`, { headers: { Authorization: `Bearer ${state.token}` } }),
        fetch(`${API}/api/server/users`, { headers: { Authorization: `Bearer ${state.token}` } }),
    ]);

    const rolesData = await rolesRes.json().catch(() => []);
    const usersData = await usersRes.json().catch(() => []);

    if (!rolesRes.ok) {
        throw new Error(rolesData.error || "Impossible de charger les rôles");
    }
    if (!usersRes.ok) {
        throw new Error(usersData.error || "Impossible de charger les membres");
    }

    state.serverRoles = Array.isArray(rolesData) ? rolesData : [];
    state.serverUsers = Array.isArray(usersData) ? usersData : [];
    renderServerRoles();
    renderServerUsers();
}

async function openServerSettingsModal() {
    if (!serverSettingsModal || state.role !== "admin") return;
    setServerSettingsFeedback("Chargement...");
    serverSettingsModal.classList.remove("hidden");
    try {
        await loadServerSettingsData();
        setServerSettingsFeedback("");
    } catch (err) {
        setServerSettingsFeedback(err.message || "Erreur de chargement", true);
    }
}

function closeServerSettingsModal() {
    if (!serverSettingsModal) return;
    serverSettingsModal.classList.add("hidden");
    setServerSettingsFeedback("");
}

// Open settings
settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    switchSettingsSection("my-account");
    if (settingsSearchInput) {
        settingsSearchInput.value = "";
        filterSettingsNav("");
    }
    populateSettingsUI();
});

// Close settings
closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));

if (serverSettingsBtn) {
    serverSettingsBtn.addEventListener("click", () => {
        openServerSettingsModal();
    });
}

if (serverSettingsCloseBtn) {
    serverSettingsCloseBtn.addEventListener("click", () => {
        closeServerSettingsModal();
    });
}

if (serverSettingsModal) {
    serverSettingsModal.addEventListener("click", (event) => {
        if (event.target === serverSettingsModal) {
            closeServerSettingsModal();
        }
    });
}

if (serverRoleForm) {
    serverRoleForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = (serverRoleName?.value || "").trim().toLowerCase();
        const color = (serverRoleColor?.value || "#99aab5").trim();
        if (!name) return;

        try {
            const res = await fetch(`${API}/api/server/roles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${state.token}`
                },
                body: JSON.stringify({ name, color })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setServerSettingsFeedback(data.error || "Erreur", true);
                return;
            }

            if (serverRoleName) serverRoleName.value = "";
            await loadServerSettingsData();
            setServerSettingsFeedback("Rôle créé.");
        } catch (err) {
            setServerSettingsFeedback("Erreur réseau.", true);
        }
    });
}

if (serverAssignBtn) {
    serverAssignBtn.addEventListener("click", async () => {
        const userId = serverUserSelect?.value;
        const role = serverRoleSelect?.value;
        if (!userId || !role) return;

        try {
            const res = await fetch(`${API}/api/users/${userId}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${state.token}`
                },
                body: JSON.stringify({ role })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setServerSettingsFeedback(data.error || "Erreur", true);
                return;
            }

            await loadServerSettingsData();
            setServerSettingsFeedback("Rôle attribué.");
        } catch (err) {
            setServerSettingsFeedback("Erreur réseau.", true);
        }
    });
}

settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
        settingsModal.classList.add("hidden");
    }
});

// Close on ESC
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (searchModal && !searchModal.classList.contains("hidden")) {
            closeSearchModal();
            return;
        }
        if (threadPanel && !threadPanel.classList.contains("hidden")) {
            hideThreadPanel();
            return;
        }
        if (roomSettingsModal && !roomSettingsModal.classList.contains("hidden")) {
            closeRoomSettingsModal();
            return;
        }
        if (serverSettingsModal && !serverSettingsModal.classList.contains("hidden")) {
            closeServerSettingsModal();
            return;
        }
        if (!settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            return;
        }
        if (!userPopout.classList.contains("hidden")) {
            userPopout.classList.add("hidden");
            return;
        }
    }
});

// Tab navigation
document.querySelectorAll(".settings-nav-item[data-section]").forEach(tab => {
    tab.addEventListener("click", () => {
        switchSettingsSection(tab.dataset.section);
    });
});

if (settingsMiniEditBtn) {
    settingsMiniEditBtn.addEventListener("click", () => {
        switchSettingsSection("profiles");
    });
}

if (settingsSearchInput) {
    settingsSearchInput.addEventListener("input", () => {
        filterSettingsNav(settingsSearchInput.value);
    });
}

function populateSettingsUI() {
    const disc = `#${(hashString(state.username) % 9000) + 1000}`;

    if (settingsMiniAvatar) {
        settingsMiniAvatar.className = `settings-mini-avatar avatar-bg-${state.avatarColor % 8}`;
        if (state.avatarUrl) {
            settingsMiniAvatar.innerHTML = `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            settingsMiniAvatar.textContent = state.username[0].toUpperCase();
        }
    }
    if (settingsMiniName) {
        settingsMiniName.textContent = state.username;
    }

    // Mon Compte tab
    settingsAvatar.className = `profile-avatar avatar-bg-${state.avatarColor % 8}`;
    if (state.avatarUrl) {
        settingsAvatar.innerHTML = `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
        settingsAvatar.textContent = state.username[0].toUpperCase();
    }
    settingsUsernameDisplay.textContent = state.username;
    settingsDiscDisplay.textContent = disc;
    acctUsernameDisplay.textContent = state.username;
    settingsRoleBadge.textContent = (state.role || "USER").toUpperCase();
    setBannerBackground($("#settings-banner"), state.bannerUrl, state.avatarColor);
    applyOwnPresenceUI();

    // Edit panel hidden
    editPanel.classList.add("hidden");
    settingsUsername.value = state.username;
    settingsAbout.value = state.about || "";

    // Profils tab
    previewAvatar.className = `preview-avatar avatar-bg-${state.avatarColor % 8}`;
    if (state.avatarUrl) {
        previewAvatar.innerHTML = `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
        previewAvatar.textContent = state.username[0].toUpperCase();
    }
    setBannerBackground(previewBanner, state.bannerUrl, state.avatarColor);
    previewUsername.textContent = state.username;
    previewDisc.textContent = disc;
    previewAbout.textContent = state.about || "Aucune description.";
    profileAboutInput.value = state.about || "";
    renderColorPickerTo(profileColorPicker, state.avatarColor, (i) => {
        state.avatarColor = i;
        previewAvatar.className = `preview-avatar avatar-bg-${i}`;
        previewAvatar.innerHTML = state.avatarUrl ? `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : state.username[0].toUpperCase();
        setBannerBackground(previewBanner, state.bannerUrl, i);
    });

    // Avatar upload buttons
    const rmBtn = $("#avatar-remove-btn");
    if (rmBtn) rmBtn.style.display = state.avatarUrl ? "inline-flex" : "none";
    const upStatus = $("#avatar-upload-status");
    if (upStatus) upStatus.textContent = "";

    // Apparence tab
    const savedTheme = prefs.theme;
    document.querySelectorAll('input[name="theme"]').forEach(r => {
        r.checked = r.value === savedTheme;
    });
    colorThemeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.themeColor === prefs.themeColor);
    });
    const colorThemeBgToggle = $("#color-theme-bg-toggle");
    if (colorThemeBgToggle) {
        colorThemeBgToggle.checked = !!prefs.colorThemeBg;
    }
    const slider = $("#font-size-slider");
    slider.value = prefs.fontSize;
    $("#font-size-display").textContent = prefs.fontSize + "px";

    // Accessibility tab
    $("#reduce-motion-toggle").checked = prefs.reduceMotion;
    $("#compact-mode-toggle").checked = prefs.compactMode;
}

function getAvatarBgColor(index) {
    const colors = ["#5865f2", "#57f287", "#feb347", "#ed4245", "#e91e63", "#9b59b6", "#1abc9c", "#e67e22"];
    return colors[index % 8];
}

function toMediaUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
    return `${API}${path}`;
}

function setBannerBackground(el, bannerUrl, fallbackColorIndex = 0) {
    if (!el) return;
    if (bannerUrl) {
        const mediaUrl = toMediaUrl(bannerUrl);
        el.style.background = `center / cover no-repeat url("${mediaUrl}")`;
    } else {
        el.style.background = getAvatarBgColor(fallbackColorIndex);
    }
}

function renderColorPickerTo(container, selectedIndex, onClick) {
    container.innerHTML = "";
    for (let i = 0; i < 8; i++) {
        const div = document.createElement("div");
        div.className = `color-option avatar-bg-${i}`;
        if (i === selectedIndex) div.classList.add("selected");
        if (onClick) {
            div.addEventListener("click", () => {
                onClick(i);
                // Re-render with the same callback to keep buttons clickable
                renderColorPickerTo(container, i, onClick);
            });
        }
        container.appendChild(div);
    }
}

// Account field edit buttons
document.querySelectorAll(".btn-field-edit").forEach(btn => {
    btn.addEventListener("click", () => {
        const field = btn.dataset.edit;
        editPanel.classList.remove("hidden");
        // Hide all optional form groups
        $("#fg-username").classList.add("hidden");
        $("#fg-about").classList.add("hidden");
        $("#fg-password").classList.add("hidden");
        $("#fg-avatar-color").classList.add("hidden");

        if (field === "username") {
            editPanelTitle.textContent = "Modifier le nom d'utilisateur";
            $("#fg-username").classList.remove("hidden");
            settingsUsername.value = state.username;
        } else if (field === "password") {
            editPanelTitle.textContent = "Changer le mot de passe";
            $("#fg-password").classList.remove("hidden");
            settingsPassword.value = "";
        }
    });
});

// "Modifier le profil" button — edit all at once
btnEditProfile.addEventListener("click", () => {
    editPanel.classList.remove("hidden");
    editPanelTitle.textContent = "Modifier le profil";
    $("#fg-username").classList.remove("hidden");
    $("#fg-about").classList.remove("hidden");
    $("#fg-password").classList.remove("hidden");
    $("#fg-avatar-color").classList.remove("hidden");
    settingsUsername.value = state.username;
    settingsAbout.value = state.about || "";
    settingsPassword.value = "";
    renderColorPickerTo(avatarColorPicker, state.avatarColor, (i) => {
        state.avatarColor = i;
        settingsAvatarColorInput.value = i;
        settingsAvatar.className = `profile-avatar avatar-bg-${i}`;
        settingsAvatar.innerHTML = state.avatarUrl ? `<img src="${API}${state.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : state.username[0].toUpperCase();
    });
    settingsAvatarColorInput.value = state.avatarColor;
});

cancelEditBtn.addEventListener("click", () => {
    editPanel.classList.add("hidden");
});

// Save profile form
updateProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    settingsFeedback.textContent = "";

    const newUsername = settingsUsername.value.trim();
    const newAbout = settingsAbout.value.trim();
    const newPassword = settingsPassword.value;
    const newColor = parseInt(settingsAvatarColorInput.value || state.avatarColor);

    const body = { avatar_color: newColor, about: newAbout };
    if (newUsername && newUsername !== state.username) body.username = newUsername;
    if (newPassword) body.password = newPassword;

    try {
        const res = await fetch(`${API}/api/users/me`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.token}`
            },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            settingsFeedback.textContent = "✓ Modifications enregistrées !";
            if (body.username) state.username = body.username;
            state.about = newAbout;
            state.avatarColor = newColor;
            localStorage.setItem("username", state.username);
            populateSettingsUI();
            updateUserPanel();
            connectWebSocket();
        } else {
            const data = await res.json();
            alert(data.error || "Erreur de mise à jour");
        }
    } catch (err) {
        alert("Erreur réseau");
    }
});

// Save profile (Profils tab)
saveProfileBtn.addEventListener("click", async () => {
    profileFeedback.textContent = "";
    const newAbout = profileAboutInput.value.trim();
    const newColor = state.avatarColor;

    const body = { avatar_color: newColor, about: newAbout };
    if (state.avatarUrl) body.avatar_url = state.avatarUrl;
    if (state.bannerUrl) body.banner_url = state.bannerUrl;

    try {
        const res = await fetch(`${API}/api/users/me`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.token}`
            },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            profileFeedback.textContent = "\u2713 Profil mis \u00e0 jour !";
            state.about = newAbout;
            state.avatarColor = newColor;
            previewAbout.textContent = newAbout || "Aucune description.";
            updateUserPanel();
            populateSettingsUI();
            connectWebSocket();
        } else {
            const data = await res.json();
            alert(data.error || "Erreur de mise \u00e0 jour");
        }
    } catch (err) {
        alert("Erreur r\u00e9seau");
    }
});

// ── Avatar / Banner Upload (Profils tab) ───────────────
const bannerFileInput = $("#banner-file-input");
const bannerUploadBtn = $("#banner-upload-btn");
const bannerRemoveBtn = $("#banner-remove-btn");
const bannerUploadStatus = $("#banner-upload-status");
const bannerCropModal = $("#banner-crop-modal");
const bannerCropPreview = $("#banner-crop-preview");
const bannerCropZoom = $("#banner-crop-zoom");
const bannerCropX = $("#banner-crop-x");
const bannerCropY = $("#banner-crop-y");
const bannerCropCancel = $("#banner-crop-cancel");
const bannerCropApply = $("#banner-crop-apply");

let bannerCropImage = null;
let bannerCropImageUrl = "";
let bannerCropState = { zoom: 1, x: 0, y: 0 };
let bannerCropDragging = false;
let bannerCropDragStart = { mouseX: 0, mouseY: 0, x: 0, y: 0 };

function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function syncBannerCropInputs() {
    if (bannerCropZoom) bannerCropZoom.value = String(bannerCropState.zoom);
    if (bannerCropX) bannerCropX.value = String(bannerCropState.x);
    if (bannerCropY) bannerCropY.value = String(bannerCropState.y);
}

function updateBannerCropState(nextState) {
    bannerCropState = {
        zoom: clampValue(nextState.zoom ?? bannerCropState.zoom, 1, 3),
        x: clampValue(nextState.x ?? bannerCropState.x, -1, 1),
        y: clampValue(nextState.y ?? bannerCropState.y, -1, 1)
    };

    syncBannerCropInputs();
    refreshBannerCropPreview();
}

function computeBannerCropTransform(targetW, targetH) {
    if (!bannerCropImage) {
        return { drawX: 0, drawY: 0, drawW: targetW, drawH: targetH };
    }

    const iw = bannerCropImage.width;
    const ih = bannerCropImage.height;
    const baseScale = Math.max(targetW / iw, targetH / ih);
    const scale = baseScale * bannerCropState.zoom;

    const drawW = iw * scale;
    const drawH = ih * scale;

    const overflowX = Math.max(0, drawW - targetW);
    const overflowY = Math.max(0, drawH - targetH);

    const drawX = (-overflowX / 2) + (bannerCropState.x * overflowX / 2);
    const drawY = (-overflowY / 2) + (bannerCropState.y * overflowY / 2);

    return { drawX, drawY, drawW, drawH };
}

function closeBannerCropModal() {
    if (bannerCropImageUrl) {
        URL.revokeObjectURL(bannerCropImageUrl);
        bannerCropImageUrl = "";
    }
    bannerCropImage = null;
    if (bannerCropPreview) {
        bannerCropPreview.style.backgroundImage = "";
        bannerCropPreview.style.backgroundSize = "cover";
        bannerCropPreview.style.backgroundPosition = "center center";
    }
    if (bannerCropModal) {
        bannerCropModal.classList.add("hidden");
    }
    bannerCropDragging = false;
    bannerCropPreview?.classList.remove("dragging");
}

function refreshBannerCropPreview() {
    if (!bannerCropPreview || !bannerCropImageUrl) return;
    const previewW = Math.max(1, bannerCropPreview.clientWidth);
    const previewH = Math.max(1, bannerCropPreview.clientHeight);
    const { drawX, drawY, drawW, drawH } = computeBannerCropTransform(previewW, previewH);

    bannerCropPreview.style.backgroundImage = `url("${bannerCropImageUrl}")`;
    bannerCropPreview.style.backgroundSize = `${drawW}px ${drawH}px`;
    bannerCropPreview.style.backgroundPosition = `${drawX}px ${drawY}px`;
}

async function openBannerCropModal(file) {
    if (!bannerCropModal || !bannerCropPreview) return;

    bannerCropImageUrl = URL.createObjectURL(file);
    bannerCropImage = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = bannerCropImageUrl;
    });

    updateBannerCropState({ zoom: 1, x: 0, y: 0 });
    bannerCropModal.classList.remove("hidden");
}

async function exportBannerCroppedBlob() {
    if (!bannerCropImage) throw new Error("No crop image");

    const outW = 1200;
    const outH = 400;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    const { drawX, drawY, drawW, drawH } = computeBannerCropTransform(outW, outH);

    ctx.drawImage(bannerCropImage, drawX, drawY, drawW, drawH);

    return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/webp", 0.92);
    });
}

async function uploadAndSaveBanner(blob) {
    if (!blob) throw new Error("Invalid banner blob");

    const formData = new FormData();
    formData.append("file", new File([blob], "banner.webp", { type: "image/webp" }));

    const uploadRes = await fetch(`${API}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: formData
    });

    if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || "Erreur d'upload");
    }

    const uploadData = await uploadRes.json();
    const bannerUrl = uploadData.url;

    const saveRes = await fetch(`${API}/api/users/me`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.token}`
        },
        body: JSON.stringify({ banner_url: bannerUrl })
    });

    if (!saveRes.ok) {
        throw new Error("Erreur lors de la sauvegarde");
    }

    state.bannerUrl = bannerUrl;
    if (bannerRemoveBtn) bannerRemoveBtn.style.display = "inline-flex";
    if (bannerUploadStatus) bannerUploadStatus.textContent = "✓ Bannière mise à jour !";
    populateSettingsUI();
    connectWebSocket();
}

if (bannerUploadBtn) {
    bannerUploadBtn.addEventListener("click", () => bannerFileInput.click());
}

if (bannerFileInput) {
    bannerFileInput.addEventListener("change", async () => {
        const file = bannerFileInput.files?.[0];
        if (!file) return;

        if (bannerUploadStatus) bannerUploadStatus.textContent = "Préparation du recadrage...";
        try {
            await openBannerCropModal(file);
            if (bannerUploadStatus) bannerUploadStatus.textContent = "";
        } catch (err) {
            if (bannerUploadStatus) bannerUploadStatus.textContent = "Image invalide";
            closeBannerCropModal();
        }

        bannerFileInput.value = "";
    });
}

if (bannerCropZoom) {
    bannerCropZoom.addEventListener("input", (e) => {
        updateBannerCropState({ zoom: parseFloat(e.target.value || "1") });
    });
}

if (bannerCropX) {
    bannerCropX.addEventListener("input", (e) => {
        updateBannerCropState({ x: parseFloat(e.target.value || "0") });
    });
}

if (bannerCropY) {
    bannerCropY.addEventListener("input", (e) => {
        updateBannerCropState({ y: parseFloat(e.target.value || "0") });
    });
}

if (bannerCropPreview) {
    bannerCropPreview.addEventListener("mousedown", (event) => {
        if (!bannerCropImageUrl) return;
        bannerCropDragging = true;
        bannerCropDragStart = {
            mouseX: event.clientX,
            mouseY: event.clientY,
            x: bannerCropState.x,
            y: bannerCropState.y
        };
        bannerCropPreview.classList.add("dragging");
        event.preventDefault();
    });

    bannerCropPreview.addEventListener("wheel", (event) => {
        if (!bannerCropImageUrl) return;
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        const nextZoom = bannerCropState.zoom + (direction * 0.08);
        updateBannerCropState({ zoom: nextZoom });
    }, { passive: false });
}

window.addEventListener("mousemove", (event) => {
    if (!bannerCropDragging || !bannerCropPreview) return;

    const width = Math.max(1, bannerCropPreview.clientWidth);
    const height = Math.max(1, bannerCropPreview.clientHeight);
    const deltaX = (event.clientX - bannerCropDragStart.mouseX) * (2 / width);
    const deltaY = (event.clientY - bannerCropDragStart.mouseY) * (2 / height);

    updateBannerCropState({
        x: bannerCropDragStart.x - deltaX,
        y: bannerCropDragStart.y - deltaY
    });
});

window.addEventListener("mouseup", () => {
    if (!bannerCropDragging) return;
    bannerCropDragging = false;
    bannerCropPreview?.classList.remove("dragging");
});

if (bannerCropCancel) {
    bannerCropCancel.addEventListener("click", () => {
        if (bannerUploadStatus) bannerUploadStatus.textContent = "Recadrage annulé";
        closeBannerCropModal();
    });
}

if (bannerCropApply) {
    bannerCropApply.addEventListener("click", async () => {
        if (bannerUploadStatus) bannerUploadStatus.textContent = "Upload de la bannière...";
        try {
            const blob = await exportBannerCroppedBlob();
            await uploadAndSaveBanner(blob);
            closeBannerCropModal();
        } catch (err) {
            if (bannerUploadStatus) {
                bannerUploadStatus.textContent = err?.message || "Erreur bannière";
            }
        }
    });
}

if (bannerCropModal) {
    bannerCropModal.addEventListener("click", (event) => {
        if (event.target === bannerCropModal) {
            closeBannerCropModal();
        }
    });
}

if (bannerRemoveBtn) {
    bannerRemoveBtn.addEventListener("click", async () => {
        try {
            const res = await fetch(`${API}/api/users/me`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${state.token}`
                },
                body: JSON.stringify({ banner_url: "" })
            });
            if (res.ok) {
                state.bannerUrl = null;
                bannerRemoveBtn.style.display = "none";
                if (bannerUploadStatus) bannerUploadStatus.textContent = "✓ Bannière supprimée";
                populateSettingsUI();
                connectWebSocket();
            }
        } catch (err) {
            if (bannerUploadStatus) bannerUploadStatus.textContent = "Erreur réseau";
        }
    });
}

const avatarFileInput = $("#avatar-file-input");
const avatarUploadBtn = $("#avatar-upload-btn");
const avatarRemoveBtn = $("#avatar-remove-btn");
const avatarUploadStatus = $("#avatar-upload-status");

avatarUploadBtn.addEventListener("click", () => avatarFileInput.click());

avatarFileInput.addEventListener("change", async () => {
    const file = avatarFileInput.files[0];
    if (!file) return;

    avatarUploadStatus.textContent = "Upload en cours...";

    try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch(`${API}/api/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${state.token}` },
            body: formData
        });

        if (!uploadRes.ok) {
            const data = await uploadRes.json();
            avatarUploadStatus.textContent = data.error || "Erreur d'upload";
            return;
        }

        const uploadData = await uploadRes.json();
        const avatarUrl = uploadData.url;

        // Save to profile
        const saveRes = await fetch(`${API}/api/users/me`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.token}`
            },
            body: JSON.stringify({ avatar_url: avatarUrl })
        });

        if (saveRes.ok) {
            state.avatarUrl = avatarUrl;
            avatarUploadStatus.textContent = "\u2713 Avatar mis \u00e0 jour !";
            avatarRemoveBtn.style.display = "inline-flex";
            updateUserPanel();
            populateSettingsUI();
            connectWebSocket();
        } else {
            avatarUploadStatus.textContent = "Erreur lors de la sauvegarde";
        }
    } catch (err) {
        avatarUploadStatus.textContent = "Erreur r\u00e9seau";
    }
    avatarFileInput.value = "";
});

avatarRemoveBtn.addEventListener("click", async () => {
    try {
        const res = await fetch(`${API}/api/users/me`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.token}`
            },
            body: JSON.stringify({ avatar_url: "" })
        });
        if (res.ok) {
            state.avatarUrl = null;
            avatarRemoveBtn.style.display = "none";
            avatarUploadStatus.textContent = "\u2713 Avatar supprim\u00e9";
            updateUserPanel();
            populateSettingsUI();
            connectWebSocket();
        }
    } catch (err) {
        alert("Erreur r\u00e9seau");
    }
});

// Theme change
document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
        savePref("theme", radio.value);
    });
});

colorThemeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        const key = btn.dataset.themeColor;
        if (!COLOR_THEME_PRESETS[key]) return;
        savePref("themeColor", key);
        colorThemeButtons.forEach((item) => {
            item.classList.toggle("active", item === btn);
        });
    });
});

const colorThemeBgToggle = $("#color-theme-bg-toggle");
if (colorThemeBgToggle) {
    colorThemeBgToggle.addEventListener("change", (e) => {
        savePref("colorThemeBg", e.target.checked);
    });
}

// Font size slider
$("#font-size-slider").addEventListener("input", (e) => {
    const size = parseInt(e.target.value);
    $("#font-size-display").textContent = size + "px";
    savePref("fontSize", size);
});

// Accessibility toggles
$("#reduce-motion-toggle").addEventListener("change", (e) => {
    savePref("reduceMotion", e.target.checked);
});
$("#compact-mode-toggle").addEventListener("change", (e) => {
    savePref("compactMode", e.target.checked);
});

// ── Room Creation ──────────────────────────────────────
addRoomBtn.addEventListener("click", () => {
    createRoomModal.classList.remove("hidden");
    roomNameInput.value = "";
    roomKindInput.value = "text";
    if (roomRequiredRoleInput) {
        roomRequiredRoleInput.value = state.role === "admin" ? "user" : "user";
        roomRequiredRoleInput.disabled = state.role !== "admin";
    }
    roomNameInput.focus();
});
cancelRoomBtn.addEventListener("click", () => createRoomModal.classList.add("hidden"));

createRoomForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = roomNameInput.value.trim();
    const kind = roomKindInput.value === "voice" ? "voice" : "text";
    const requiredRole = roomRequiredRoleInput && roomRequiredRoleInput.value === "admin" ? "admin" : "user";
    if (!name) return;

    try {
        const res = await fetch(`${API}/api/rooms`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.token}`,
            },
            body: JSON.stringify({ name, kind, required_role: requiredRole }),
        });
        if (res.ok) {
            createRoomModal.classList.add("hidden");
            await loadRooms();
        } else {
            const data = await res.json();
            alert(data.error || "Erreur");
        }
    } catch (err) { alert("Erreur réseau"); }
});

// ── User Popout Card ───────────────────────────────────
let currentPopoutUserId = null;

function renderUserPopoutContent(uid, user) {
    const colorIndex = user.avatar_color % 8;

    // Avatar
    popoutAvatar.className = `popout-avatar avatar-bg-${colorIndex}`;
    popoutAvatar.innerHTML = user.avatar_url
        ? `<img src="${API}${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : user.username[0].toUpperCase();

    // Banner color
    setBannerBackground(popoutBanner, user.banner_url || null, colorIndex);
    applyStatusDot(popoutStatusDot, user.status || "online");

    // Username & Disc
    popoutUsername.textContent = user.username;
    // Mock discriminator based on hash
    const disc = `#${(hashString(user.username) % 9000) + 1000}`;
    popoutDisc.textContent = disc;

    // Role display (using existing structure)
    const roleBadges = userPopout.querySelector("#popout-badges"); // This exists in HTML
    if (roleBadges) {
        const statusText = presenceLabel(user.status || "online");
        roleBadges.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:4px;background:var(--background-secondary);padding:4px 8px;border-radius:4px;font-size:12px">
            <div style="width:8px;height:8px;border-radius:50%;background:${user.role === 'admin' ? '#ed4245' : '#99aab5'}"></div>
            ${user.role === 'admin' ? 'Admin' : 'Membre'}
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;background:var(--background-secondary);padding:4px 8px;border-radius:4px;font-size:12px">
            <div style="width:8px;height:8px;border-radius:50%;background:${presenceDotClass(user.status || 'online') === 'online' ? '#3ba55d' : presenceDotClass(user.status || 'online') === 'idle' ? '#faa61a' : presenceDotClass(user.status || 'online') === 'dnd' ? '#ed4245' : '#747f8d'}"></div>
            ${statusText}
        </div>`;
    }
    // About Me display
    const aboutSection = userPopout.querySelector("#popout-about-section");
    const aboutText = userPopout.querySelector("#popout-about-text");
    if (aboutSection && aboutText) {
        if (user.about && user.about.trim().length > 0) {
            aboutText.textContent = user.about;
            aboutSection.style.display = "block";
        } else {
            aboutSection.style.display = "none";
        }
    }
}

function showUserPopout(e, uid, user) {
    if (e) {
        e.stopPropagation();
        e.preventDefault(); // prevent triggering other clicks
    }

    currentPopoutUserId = uid;
    renderUserPopoutContent(uid, user);

    if (e) {
        const rect = e.currentTarget.getBoundingClientRect();
        // Position to the left of the members sidebar
        userPopout.style.top = `${Math.min(rect.top, window.innerHeight - 300)}px`;
        userPopout.style.right = `${window.innerWidth - rect.left + 8}px`;
        userPopout.style.left = "auto";
        userPopout.classList.remove("hidden");
    }
}

// Close popout on click outside
document.addEventListener("click", (e) => {
    if (!userPopout.contains(e.target) && !e.target.closest(".members-list li")) {
        userPopout.classList.add("hidden");
        currentPopoutUserId = null;
    }
});

// ── Context Menu Logic ─────────────────────────────────
function closeRoomSettingsModal() {
    return contextController?.closeRoomSettingsModal();
}

function showContextMenu(e, type, id, name) {
    return contextController?.showContextMenu(e, type, id, name);
}

// ── Utility Functions ──────────────────────────────────
function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

// Detect emoji-only messages → return CSS class for jumbo display
function getEmojiClass(text) {
    if (!text) return '';
    // Strip variation selectors, ZWJ, skin tone modifiers, then check if only emoji remain
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Regional_Indicator}{2}|[\u200D\uFE0E\uFE0F])+$/u;
    const trimmed = text.trim();
    if (!emojiRegex.test(trimmed)) return '';

    // Count emojis using Intl.Segmenter if available, fallback to spread
    let count;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        count = [...segmenter.segment(trimmed)].length;
    } else {
        count = [...trimmed].length;
    }

    if (count <= 3) return 'emoji-jumbo';
    if (count <= 6) return 'emoji-large';
    return '';
}

function formatTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const today = new Date();
    const isToday =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();

    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Aujourd'hui à ${time}`;
    if (isYesterday(d)) return `Hier à ${time}`;
    return `${d.toLocaleDateString("fr-FR")} ${time}`;
}

function formatDateLabel(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const today = new Date();

    if (d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()) {
        return "Aujourd'hui";
    }

    if (isYesterday(d)) return "Hier";

    return d.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function isYesterday(d) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function openSearchModal(prefill = "") {
    if (!searchModal) return;
    searchModal.classList.remove("hidden");
    if (searchQueryInput && prefill !== undefined) {
        searchQueryInput.value = (prefill || "").trim();
        searchQueryInput.focus();
    }
    if (searchRoomScope) {
        searchRoomScope.value = state.currentRoomId ? "current" : "all";
    }
}

function closeSearchModal() {
    searchModal?.classList.add("hidden");
}

function renderSearchResults(items) {
    if (!searchResults) return;
    if (!Array.isArray(items) || items.length === 0) {
        searchResults.innerHTML = `<div class="search-result-item">Aucun résultat.</div>`;
        return;
    }

    searchResults.innerHTML = "";
    items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "search-result-item";
        const room = state.rooms.find((r) => r.id === item.room_id);
        const roomLabel = room ? `#${room.name}` : "salon";
        const content = (item.content && item.content.trim()) || (item.image_url ? "[Image]" : "Message");

        row.innerHTML = `
            <div class="search-result-head">
                <span class="search-result-user">${escapeHtml(item.username || "Utilisateur")}</span>
                <span class="search-result-meta">${escapeHtml(roomLabel)} • ${escapeHtml(formatTime(item.created_at))}</span>
            </div>
            <div class="search-result-content">${escapeHtml(content)}</div>
        `;

        row.addEventListener("click", async () => {
            const targetRoom = state.rooms.find((r) => r.id === item.room_id);
            if (!targetRoom) return;

            if (state.currentRoomId !== targetRoom.id) {
                await selectRoom(targetRoom);
            }

            closeSearchModal();

            const target = messagesContainer.querySelector(`.message[data-id="${item.id}"]`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.classList.add("message-mentioned");
                setTimeout(() => target.classList.remove("message-mentioned"), 1400);
            }
        });

        searchResults.appendChild(row);
    });
}

async function runAdvancedSearch() {
    const params = new URLSearchParams();

    const q = (searchQueryInput?.value || "").trim();
    const author = (searchAuthorInput?.value || "").trim();
    const fromDate = (searchFromInput?.value || "").trim();
    const toDate = (searchToInput?.value || "").trim();
    const scope = (searchRoomScope?.value || "current").trim();

    if (q) params.set("q", q);
    if (author) params.set("author", author);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (scope === "current" && state.currentRoomId) {
        params.set("room_id", state.currentRoomId);
    }
    params.set("limit", "120");

    if (searchResults) {
        searchResults.innerHTML = `<div class="search-result-item">Recherche en cours...</div>`;
    }

    try {
        const res = await fetch(`${API}/api/messages/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${state.token}` }
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const message = data.error || "Erreur de recherche";
            if (searchResults) {
                searchResults.innerHTML = `<div class="search-result-item">${escapeHtml(message)}</div>`;
            }
            return;
        }

        const items = await res.json();
        renderSearchResults(items);
    } catch (err) {
        if (searchResults) {
            searchResults.innerHTML = `<div class="search-result-item">Erreur réseau.</div>`;
        }
    }
}

// ── Init ───────────────────────────────────────────────
async function initApp() {
    const discordAuthenticated = await handleDiscordOAuthCallback();
    if (state.token || discordAuthenticated) {
        enterApp();
    } else {
        authModal.classList.remove("hidden");
        app.classList.add("hidden");
    }
    updateVoiceQuickStatus();
    updateGlobalMentionBadge();
}

initApp();

if (chatSearch) {
    chatSearch.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            openSearchModal(chatSearch.value || "");
            runAdvancedSearch();
        }
    });
}

if (searchRunBtn) {
    searchRunBtn.addEventListener("click", () => {
        runAdvancedSearch();
    });
}

if (searchCloseBtn) {
    searchCloseBtn.addEventListener("click", () => {
        closeSearchModal();
    });
}

if (searchModal) {
    searchModal.addEventListener("click", (event) => {
        if (event.target === searchModal) {
            closeSearchModal();
        }
    });
}

// ═══ Emoji Picker ══════════════════════════════════════
const EMOJI_DATA = {
    smileys: {
        name: "Smileys & Émotion",
        emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "🫠", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "😵‍💫", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖"]
    },
    people: {
        name: "Personnes & Corps",
        emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "🫵", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲", "👨‍🦲"]
    },
    nature: {
        name: "Animaux & Nature",
        emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱", "🪴", "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃", "🪹", "🪺"]
    },
    food: {
        name: "Nourriture & Boissons",
        emojis: ["🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🥭", "🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🫐", "🥝", "🍅", "🫒", "🥥", "🥑", "🍆", "🥔", "🥕", "🌽", "🌶️", "🫑", "🥒", "🥬", "🥦", "🧄", "🧅", "🍄", "🥜", "🫘", "🌰", "🍞", "🥐", "🥖", "🫓", "🥨", "🥯", "🥞", "🧇", "🧀", "🍖", "🍗", "🥩", "🥓", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🫔", "🥙", "🧆", "🥚", "🍳", "🥘", "🍲", "🫕", "🥣", "🥗", "🍿", "🧈", "🧂", "🥫"]
    },
    activities: {
        name: "Activités",
        emojis: ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "🤺", "⛹️", "🏊", "🚴", "🚵", "🧘", "🎮", "🕹️", "🎲", "🧩", "♟️", "🎯", "🎳", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🪗", "🎸", "🪕", "🎻"]
    },
    objects: {
        name: "Objets",
        emojis: ["💡", "🔦", "🕯️", "🪔", "💻", "🖥️", "🖨️", "⌨️", "🖱️", "💾", "💿", "📀", "📱", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "⏱️", "⏲️", "⏰", "🕰️", "📡", "🔋", "🔌", "🛒", "⚙️", "🔧", "🔨", "🛠️", "🪛", "🔩", "🪜", "🧲", "💊", "💉", "🩹", "🩺", "🔬", "🔭", "📷", "📸", "📹", "🎥", "🎞️", "📽️", "📖", "📚", "📝", "✏️", "🖊️", "🖋️", "📌", "📎", "🔑", "🗝️", "🔒", "🔓"]
    },
    symbols: {
        name: "Symboles",
        emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "⭕", "🛑", "⛔", "❌", "❗", "❓", "‼️", "⁉️", "✅", "☑️", "✔️", "➕", "➖", "➗", "✖️", "💲", "💱"]
    },
    flags: {
        name: "Drapeaux",
        emojis: ["🏳️", "🏴", "🏁", "🚩", "🏳️‍🌈", "🏳️‍⚧️", "🇫🇷", "🇺🇸", "🇬🇧", "🇩🇪", "🇪🇸", "🇮🇹", "🇯🇵", "🇰🇷", "🇨🇳", "🇧🇷", "🇷🇺", "🇮🇳", "🇦🇺", "🇨🇦", "🇲🇽", "🇦🇷", "🇨🇴", "🇵🇹", "🇳🇱", "🇧🇪", "🇨🇭", "🇸🇪", "🇳🇴", "🇩🇰", "🇫🇮", "🇵🇱", "🇦🇹", "🇮🇪", "🇬🇷", "🇹🇷", "🇸🇦", "🇦🇪", "🇪🇬", "🇿🇦", "🇳🇬", "🇰🇪", "🇲🇦", "🇹🇳", "🇻🇳", "🇹🇭", "🇮🇩", "🇲🇾", "🇵🇭", "🇸🇬", "🇳🇿", "🇨🇱", "🇵🇪", "🇺🇾", "🇵🇾", "🇪🇨", "🇧🇴", "🇻🇪", "🇨🇺", "🇭🇹"]
    }
};

const emojiPickerEl = $("#emoji-picker");
const emojiPickerBody = $("#emoji-picker-body");
const emojiSearch = $("#emoji-search");
const emojiBtn = $("#emoji-btn");

let currentEmojiCategory = "smileys";

function renderEmojiCategory(category) {
    currentEmojiCategory = category;
    emojiPickerBody.innerHTML = "";
    const cat = EMOJI_DATA[category];
    if (!cat) return;

    const title = document.createElement("div");
    title.className = "emoji-category-title";
    title.textContent = cat.name;
    emojiPickerBody.appendChild(title);

    cat.emojis.forEach(emoji => {
        const btn = document.createElement("button");
        btn.className = "emoji-item";
        btn.textContent = emoji;
        btn.addEventListener("click", () => insertEmoji(emoji));
        emojiPickerBody.appendChild(btn);
    });
}

function renderAllEmojisFiltered(query) {
    emojiPickerBody.innerHTML = "";
    const q = query.toLowerCase();
    let found = false;

    Object.values(EMOJI_DATA).forEach(cat => {
        // Simple search: match against emoji characters
        const matches = cat.emojis.filter(e => e.includes(q));
        if (matches.length > 0) {
            found = true;
            matches.forEach(emoji => {
                const btn = document.createElement("button");
                btn.className = "emoji-item";
                btn.textContent = emoji;
                btn.addEventListener("click", () => insertEmoji(emoji));
                emojiPickerBody.appendChild(btn);
            });
        }
    });

    if (!found) {
        // Show all emojis flattened
        Object.values(EMOJI_DATA).forEach(cat => {
            cat.emojis.forEach(emoji => {
                const btn = document.createElement("button");
                btn.className = "emoji-item";
                btn.textContent = emoji;
                btn.addEventListener("click", () => insertEmoji(emoji));
                emojiPickerBody.appendChild(btn);
            });
        });
    }
}

function insertEmoji(emoji) {
    messageInput.value += emoji;
    messageInput.focus();
}

// Toggle emoji picker
emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = emojiPickerEl.classList.contains("hidden");
    if (isHidden) {
        emojiPickerEl.classList.remove("hidden");
        emojiSearch.value = "";
        renderEmojiCategory(currentEmojiCategory);
        emojiSearch.focus();
    } else {
        emojiPickerEl.classList.add("hidden");
    }
});

// Close emoji picker on click outside
document.addEventListener("click", (e) => {
    if (!emojiPickerEl.contains(e.target) && e.target !== emojiBtn) {
        emojiPickerEl.classList.add("hidden");
    }
});

// Category tabs
document.querySelectorAll(".emoji-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".emoji-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderEmojiCategory(tab.dataset.category);
        emojiSearch.value = "";
    });
});

// Search emojis
emojiSearch.addEventListener("input", () => {
    const q = emojiSearch.value.trim();
    if (q) {
        renderAllEmojisFiltered(q);
    } else {
        renderEmojiCategory(currentEmojiCategory);
    }
});

// ── Image Lightbox ─────────────────────────────────────
window.openLightbox = function (url) {
    const overlay = document.createElement("div");
    overlay.className = "image-lightbox";
    overlay.innerHTML = `<img src="${url}" />`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
};

// Close lightbox on ESC
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const lb = document.querySelector(".image-lightbox");
        if (lb) lb.remove();
    }
});

// ── Drag & Drop Image Upload ───────────────────────────
const chatDropArea = document.querySelector(".chat-area");
chatDropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

chatDropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!state.currentRoomId) return;
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change"));
    }
});

// ── Paste Image Upload ─────────────────────────────────
messageInput.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event("change"));
            }
            break;
        }
    }
});
