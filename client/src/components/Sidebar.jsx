import { useEffect, useState } from "react";
import { api } from "../utils/api";

export default function Sidebar({
  user, conversations, activeId, onlineSet, connection, onSelect, onStartChat, onLogout, loaded,
}) {
  const [mode, setMode] = useState("list"); // list | search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
        setResults(data);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function fmtAgo(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return new Date(iso).toLocaleDateString();
  }

  const statusDot = connection === "connected" ? "online" : connection === "reconnecting" ? "reconnect" : "down";

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <div className="sb-user">
          <span className="avatar" style={{ backgroundImage: `url(${user?.avatarUrl})` }} />
          <div>
            <div className="sb-name">{user?.displayName}</div>
            <div className="sb-sub">
              <span className={`dot ${statusDot}`} />{" "}
              {connection === "connected" ? "online" : connection === "reconnecting" ? "reconnecting…" : "disconnected"}
            </div>
          </div>
        </div>
        <button className="ghost" title="Search people" onClick={() => setMode(mode === "search" ? "list" : "search")}>
          {mode === "search" ? "✕" : "＋"}
        </button>
        <button className="ghost" title="Log out" onClick={onLogout}>⏻</button>
      </div>

      {mode === "search" ? (
        <div className="sb-search">
          <input
            autoFocus
            placeholder="Search by username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="results">
            {query.trim() &&
              results.map((u) => (
                <button key={u.id} className="result" onClick={() => onStartChat(u.id)}>
                  <span className="avatar sm" style={{ backgroundImage: `url(${u.avatarUrl})` }} />
                  <span>
                    <b>{u.displayName}</b>
                    <span className="rs">@{u.username}</span>
                  </span>
                </button>
              ))}
            {query.trim() && results.length === 0 && <p className="none">No users found</p>}
          </div>
        </div>
      ) : (
        <div className="sb-list">
          {!loaded && <p className="none">Loading…</p>}
          {loaded && conversations.length === 0 && (
            <p className="none">No conversations yet. Use ＋ to find someone.</p>
          )}
          {conversations.map((c) => {
            const peer = c.members?.[0];
            const isOnline = peer && onlineSet.has(peer.id);
            return (
              <button
                key={c.id}
                className={`conv ${c.id === activeId ? "active" : ""}`}
                onClick={() => onSelect(c.id)}
              >
                <span className={`avatar ${isOnline ? "ring" : ""}`} style={{ backgroundImage: `url(${peer?.avatarUrl})` }} />
                <span className="conv-main">
                  <span className="conv-top">
                    <b>{c.name}</b>
                    <time>{c.latestMessage ? fmtAgo(c.latestMessage.createdAt) : ""}</time>
                  </span>
                  <span className="conv-preview">
                    {isOnline ? <span className="txt-online">online</span> : c.lastMessagePreview}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}