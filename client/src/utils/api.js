import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

const TOKEN_KEYS = { access: "chat_access_token", refresh: "chat_refresh_token" };

export function getTokens() {
  return {
    access: localStorage.getItem(TOKEN_KEYS.access),
    refresh: localStorage.getItem(TOKEN_KEYS.refresh),
  };
}

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(TOKEN_KEYS.access, accessToken);
  if (refreshToken) localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
}

// attach access token
api.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

// single-flight refresh on 401
let refreshing = null;

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) throw new Error("no refresh token");

  const { data } = await axios.post("/api/auth/refresh", { refreshToken: refresh });
  setTokens(data);
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && !config._retry) {
      config._retry = true;
      try {
        refreshing = refreshing || refreshAccessToken();
        await refreshing;
        refreshing = null;
        config.headers.Authorization = `Bearer ${getTokens().access}`;
        return api(config);
      } catch (refreshErr) {
        refreshing = null;
        clearTokens();
        window.dispatchEvent(new CustomEvent("auth:logout"));
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);