const TOKEN_KEY = "tornos_token";
const API_BASE_URL = (window.TORNOS_API_BASE_URL || window.ZSISTEMA_API_BASE_URL || "").replace(/\/$/, "");
const IS_NETLIFY_STATIC_SITE = location.hostname.endsWith(".netlify.app");

export function getToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) return token;
  const legacyToken = localStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    localStorage.removeItem(TOKEN_KEY);
  }
  return legacyToken;
}

export function setToken(token) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  if (!API_BASE_URL && IS_NETLIFY_STATIC_SITE && path.startsWith("/api/")) {
    throw new Error("API no configurada. En Netlify define TORNOS_API_BASE_URL con la URL del backend Node/MySQL.");
  }
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      // no-op
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.blob();
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
