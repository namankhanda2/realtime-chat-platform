import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../utils/api";
import { getSocket } from "../utils/socket";

const PAGE = 50;

export default function ChatWindow({ conversation, me }) {
  const peer = conversation.members?.[0] || {};
  const convId = conversation.id;

  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef(null);
  const socket = useMemo(() => getSocket(), []);

  // ---- history -----------------------------------------------------------
  const loadPage = useCallback(
    async (cursor = null) => {
      const q = new URLSearchParams({ limit: PAGE });
      if (cursor) q.set("cursor", cursor);
      const { data } = await api.get(`/conversations/${convId}/messages?${q}`);
      setMessages((prev) => (cursor ? [...data.messages, ...prev] : data.messages));
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      return data;
    },
    [convId]
  );

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setTypingUsers(new Set());
    socket.emit("conv:join", { conversationId: convId });
    socket.emit("message:read", { conversationId: convId });
    loadPage().finally(() => setLoading(false));
  }, [convId, socket, loadPage]);

  // ---- socket handlers -----------------------------------------------------
  useEffect(() => {
    const onNew = (msg) => {
      if (msg.conversationId !== convId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom();
    };
    const onTyping = ({ conversationId, userId }) => {
      if (conversationId !== convId || userId === me.id) return;
      setTypingUsers((prev) => new Set(prev).add(userId));
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }, 3500);
    };
    const onRead = ({ conversationId }) => {
      if (conversationId !== convId) return;
      setMessages((prev) =>
        prev.map((m) => (m.readBy.includes(me.id) ? m : { ...m, readBy: [...m.readBy, me.id] }))
      );
    };

    socket.on("message:new", onNew);
    socket.on("user:typing", onTyping);
    socket.on("user:stopped-typing", () => {});
    socket.on("message:read", onRead);
    socket.on("error:event", (e) => setError(e.error));

    return () => {
      socket.off("message:new", onNew);
      socket.off("user:typing", onTyping);
      socket.off("message:read", onRead);
      socket.off("error:event");
    };
  }, [convId, me.id, socket]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  useEffect(scrollToBottom, [messages, typingUsers, loading]);

  // ---- send ----------------------------------------------------------------
  const sendText = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || uploading) return;
    setError("");
    setText("");
    socket.emit("message:send", { conversationId: convId, type: "text", body });
  };

  const onTypingInput = (e) => {
    setText(e.target.value);
    if (e.target.value.trim() && e.target.value !== text) {
      socket.emit("typing", { conversationId: convId });
    }
  };

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      socket.emit("message:send", {
        conversationId: convId,
        type: data.kind === "image" ? "image" : "file",
        body: "",
        fileUrl: data.url,
        fileName: data.name,
        fileSize: data.size,
      });
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const typing = [...typingUsers].map((id) =>
    peer.id === id ? peer.displayName : "Someone"
  ).join(", ");
  const typingLabel = typing ? `${typing} ${typing.length > 1 ? "are" : "is"} typing…` : "";

  return (
    <main className="chat">
      <header className="chat-head">
        <div className="peer">
          <span className="avatar" style={{ backgroundImage: `url(${peer.avatarUrl})` }} />
          <div>
            <div className="peer-name">{peer.displayName || "…"}</div>
            <div className="peer-sub">@{peer.username}</div>
          </div>
        </div>
      </header>

      <div className="msgs" ref={scrollRef}>
        {loading ? (
          <p className="none t">Loading messages…</p>
        ) : (
          <>
            {hasMore && (
              <button className="more" onClick={() => loadPage(nextCursor)}>
                Load earlier messages
              </button>
            )}
            {messages.length === 0 && <p className="none t">No messages yet — say hi 👋</p>}
            {messages.map((m, i) => {
              const mine = m.senderId === me.id;
              const prev = messages[i - 1];
              const prevMine = prev && prev.senderId === m.senderId;
              const showTime = !prev || new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60_000;
              const read = mine && m.readBy.length > 1;
              return (
                <div key={m.id} className="mrow">
                  {showTime && (
                    <time className="stamp">
                      {new Date(m.createdAt).toLocaleString([], {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </time>
                  )}
                  <div className={`bubble ${mine ? "mine" : "theirs"} ${prevMine ? "glued" : ""}`}>
                    {m.type === "image" ? (
                      <img src={m.fileUrl} alt="attachment" className="imgmsg" />
                    ) : m.type === "file" ? (
                      <a href={m.fileUrl} target="_blank" rel="noreferrer" className="filemsg">
                        📎 {m.fileName || "attachment"}
                      </a>
                    ) : (
                      <span className="txtmsg">{m.body}</span>
                    )}
                    <span className="meta">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {mine && <span className={`read ${read ? "on" : ""}`}>{"✓✓"}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
            {typingLabel && <div className="typing">{typingLabel}</div>}
          </>
        )}
      </div>

      {error && <div className="err chat-err">{error}</div>}

      <form className="composer" onSubmit={sendText}>
        <label className="uploadbtn" title="Send photo or file">
          <input type="file" hidden onChange={onUpload} disabled={uploading} />
          {uploading ? "…" : "📎"}
        </label>
        <input
          className="composer-input"
          placeholder={`Message @${peer.username || "…"}`}
          value={text}
          onChange={onTypingInput}
          autoFocus
        />
        <button className="send" disabled={!text.trim() || uploading}>
          ➤
        </button>
      </form>
    </main>
  );
}