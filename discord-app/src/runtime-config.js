window.VOXIUM_RUNTIME_CONFIG = {
    apiBaseUrl: "http://127.0.0.1:8080",
    wsUrl: "ws://127.0.0.1:8080/ws",
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ],
    discordAuthorizeBaseUrl: "https://discord.com/oauth2/authorize",
    discordClientId: "",
    discordRedirectUri: "",
    discordScope: "identify email guilds",
    discordResponseType: "code",
    discordPrompt: "consent"
};
