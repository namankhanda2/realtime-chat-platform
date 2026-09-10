import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../utils/socket";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";

export default function ChatApp() {
  const { user, handleLogout } = useAuth();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [onlineSet, setOnlineSet] = useState(new Set());
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState("connecting");

  const socketRef = useRef(null);
  const activeId = conversationId || null;

  const activeConv = conversations.find((c) => c.id === activeId) || null;

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    setConnection(socket.connected ? "connected" : "connecting");
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => setConnection("reconnecting"));
    socket.on("connect_error", (err) => {
      setConnection("error");
      if (String(err.message).includes("unauthorized")) handleLogout();
    });

    const onPresence = ({ userId, online }) => {
      setOnlineSet((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };
    const onNewMessage = (msg) => {
      if (msg.conversationId === activeId) return; // ChatWindow handles active view
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversationId);
        const preview = msg.type === "image" ? "Photo" : msg.type === "file" ? "File" : msg.body;
        if (idx === -1) return prev;
        const item = { ...prev[idx], lastMessagePreview: preview, updatedAt: msg.createdAt };
        return [item, ...prev.filter((_, i) => i !== idx)];
      });
    };

    socket.on("presence:update", onPresence);
    socket.on("message:new", onNewMessage);
    return () => {
      socket.off("presence:update", onPresence);
      socket.off("message:new", onNewMessage);
    };
  }, [activeId, handleLogout]);

  const refreshConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/conversations");
      setConversations(data);
      setOnlineSet((prev) => new Set(prev));
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  async function startChat(otherUserId) {
    const { data } = await api.post("/conversations", { userId: otherUserId });
    navigate(`/chat/${data.id}`);
    refreshConversations();
  }

  function openConversation(id) {
    navigate(`/chat/${id}`);
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        onlineSet={onlineSet}
        connection={connection}
        onSelect={openConversation}
        onStartChat={startChat}
        onLogout={handleLogout}
        loaded={loaded}
      />
      {activeConv ? (
        <ChatWindow key={activeConv.id} conversation={activeConv} me={user} />
      ) : (
        <div className="empty">
          <div className="empty-logo">Convo</div>
          <p>Select a conversation or search for someone to chat with.</p>
        </div>
      )}
    </div>
  );
}