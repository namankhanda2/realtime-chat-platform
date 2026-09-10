import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";

export default function AuthPage({ mode }) {
  const { handleLogin, handleRegister } = useAuth();
  const navigate = useNavigate();
  const isLogin = mode === "login";

  const [form, setForm] = useState({ username: "", email: "", displayName: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const url = isLogin ? "/auth/login" : "/auth/register";
      const body = isLogin
        ? { emailOrUsername: form.username, password: form.password }
        : form;
      const { data } = await api.post(url, body);
      if (isLogin) await handleLogin(data);
      else await handleRegister(data);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authlogo">Convo</div>
        <p className="authsub">Real-time messaging, engineered as microservices.</p>
        <h2>{isLogin ? "Sign in" : "Create account"}</h2>
        <form onSubmit={submit}>
          <input value={form.username} onChange={set("username")} placeholder={isLogin ? "email or username" : "username"} required autoFocus />
          {!isLogin && (
            <input value={form.email} onChange={set("email")} type="email" placeholder="email" required />
          )}
          {!isLogin && (
            <input value={form.displayName} onChange={set("displayName")} placeholder="display name (optional)" />
          )}
          <input value={form.password} onChange={set("password")} type="password" placeholder="password (min 8 chars)" required minLength={8} />
          {error && <div className="err">{error}</div>}
          <button className="btn" disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>
        </form>
        <button className="link" onClick={() => navigate(isLogin ? "/register" : "/login")}>
          {isLogin ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}