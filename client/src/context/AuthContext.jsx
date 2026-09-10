import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getTokens, setTokens, clearTokens } from "../utils/api";
import { getSocket, destroySocket } from "../utils/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      const { refresh } = getTokens();
      if (refresh) await api.post("/auth/logout", { refreshToken: refresh });
    } catch {
      /* ignore */
    }
    clearTokens();
    destroySocket();
    setUser(null);
    setOnline(false);
    window.location.href = "/login";
  }, []);

  const startSocket = useCallback(() => {
    const s = getSocket();
    s.connect();

    s.on("connect_error", (err) => {
      // The socket singleton fires connect_error BEFORE it is connected;
      // if the access token is invalid, log the user out.
      if (String(err.message).includes("unauthorized")) handleLogout();
    });
  }, [handleLogout]);

  const handleLogin = useCallback(async (payload) => {
    setTokens(payload);
    setUser(payload.user);
    setOnline(true);
    startSocket();
    return payload.user;
  }, [startSocket]);

  const handleRegister = useCallback(async (payload) => {
    setTokens(payload);
    setUser(payload.user);
    setOnline(true);
    startSocket();
    return payload.user;
  }, [startSocket]);

  useEffect(() => {
    const { access } = getTokens();
    if (!access) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data);
        setOnline(true);
        startSocket();
      })
      .catch(() => {
        clearTokens();
      })
      .finally(() => setLoading(false));
  }, [startSocket, handleLogout]);

  useEffect(() => {
    const onLogout = () => handleLogout();
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, [handleLogout]);

  return (
    <AuthContext.Provider value={{ user, loading, online, handleLogin, handleRegister, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}