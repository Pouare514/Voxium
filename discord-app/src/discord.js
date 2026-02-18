window.VoxiumDiscord = (() => {
    const runtime = window.VOXIUM_RUNTIME_CONFIG || {};
    const apiBase = (runtime.apiBaseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");

    async function parseResponse(response) {
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = text;
        }
        if (!response.ok) {
            const message = (data && (data.error || data.message)) || `Erreur HTTP ${response.status}`;
            throw new Error(message);
        }
        return data;
    }

    function getBackendToken() {
        return localStorage.getItem("token") || "";
    }

    async function getMe() {
        const token = getBackendToken();
        if (!token) {
            throw new Error("Session Voxium manquante");
        }
        const response = await fetch(`${apiBase}/api/discord/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return parseResponse(response);
    }

    async function request(path, options = {}) {
        const token = getBackendToken();
        if (!token) {
            throw new Error("Session Voxium manquante");
        }

        const method = (options.method || "GET").toUpperCase();
        const body = options.body === undefined ? null : options.body;

        const response = await fetch(`${apiBase}/api/discord/proxy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                method,
                path,
                body,
            }),
        });

        return parseResponse(response);
    }

    return {
        getMe,
        request,
    };
})();
