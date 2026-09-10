import axios from "axios";
import { io } from "socket.io-client";

const BASE = process.env.BASE || "http://localhost";
const runId = Date.now();
const aName = "alice" + runId % 100000;
const bName = "bob" + runId % 100000;
const PW = "SuperSecret99";
let failures = 0;

function ok(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
  if (!cond) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(name) {
  const { data } = await axios.post(`${BASE}/api/auth/register`, {
    username: name,
    email: `${name}@test.dev`,
    password: PW,
  });
  return data;
}

const a = await register(aName);
const b = await register(bName);
ok("register A", !!a.accessToken && a.user.username === aName);
ok("register B", !!b.accessToken && b.user.username === bName);

// auth/me with token
const me = await axios.get(`${BASE}/api/auth/me`, {
  headers: { Authorization: `Bearer ${a.accessToken}` },
});
ok("GET /auth/me", me.data.username === aName);

// refresh token rotation
const ref = await axios.post(`${BASE}/api/auth/refresh`, { refreshToken: a.refreshToken });
a.refreshToken = ref.data.refreshToken;
ok("refresh rotates token", ref.data.accessToken && ref.data.accessToken !== a.accessToken);

// find/create conversation
const conv = await axios.post(
  `${BASE}/api/conversations`,
  { userId: b.user.id },
  { headers: { Authorization: `Bearer ${a.accessToken}` } }
);
ok("create/find conversation", conv.data.id);
const convId = conv.data.id;

// history empty
const hist = await axios.get(`${BASE}/api/conversations/${convId}/messages`, {
  headers: { Authorization: `Bearer ${a.accessToken}` },
});
ok("history initially empty", hist.data.messages.length === 0 && hist.data.hasMore === false);

// conversation appears for both users
for (const [tok, who] of [[a.accessToken, "A"], [b.accessToken, "B"]]) {
  const list = await axios.get(`${BASE}/api/conversations`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  ok(`conversation listed for ${who}`, list.data.some((c) => c.id === convId));
}

// ---- websocket messaging -------------------------------------------------
const mkSocket = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

const sockA = await mkSocket(a.accessToken);
const sockB = await mkSocket(b.accessToken);
ok("socket A connected", sockA.connected);
ok("socket B connected", sockB.connected);

// B receives A's message via live socket
const msgReceived = new Promise((resolve) => sockB.on("message:new", (m) => resolve(m)));
await new Promise((r) => setTimeout(r, 300));
sockA.emit("message:send", { conversationId: convId, type: "text", body: "hello from Alice 👋" });
const got = await Promise.race([msgReceived, sleep(5000).then(() => null)]);
ok("message:new delivered to B", !!got && got.body === "hello from Alice 👋");
ok("message persisted in mongo(from ws)", !!got && !!got.id);

// typing indicator
const typingP = new Promise((resolve) => sockB.once("user:typing", resolve));
sockA.emit("typing", { conversationId: convId });
const typing = await Promise.race([typingP, sleep(5000).then(() => null)]);
ok("typing indicator broadcast", typing && typing.conversationId === convId && typing.userId === a.user.id);

// read receipt: B opens chat -> marks A's message read -> A notified
await new Promise((r) => setTimeout(r, 200));
const readP = new Promise((resolve) => sockA.once("message:read", resolve));
sockB.emit("conv:join", { conversationId: convId });
sockB.emit("message:read", { conversationId: convId });
const readEvt = await Promise.race([readP, sleep(5000).then(() => null)]);
ok("read receipt emitted to sender", readEvt && readEvt.conversationId === convId && readEvt.readerId === b.user.id);

// history now has 1 message and is marked read
const hist2 = await axios.get(`${BASE}/api/conversations/${convId}/messages`, {
  headers: { Authorization: `Bearer ${a.accessToken}` },
});
ok("history has 1 message", hist2.data.messages.length === 1);
ok("readBy includes B", hist2.data.messages[0].readBy.includes(b.user.id));

// B replies, A should see it (round-trip other direction)
const replyP = new Promise((resolve) => sockA.once("message:new", resolve));
await new Promise((r) => setTimeout(r, 200));
sockB.emit("message:send", { conversationId: convId, type: "text", body: "hi Alice, this is Bob" });
const reply = await Promise.race([replyP, sleep(5000).then(() => null)]);
ok("B->A live reply", reply && reply.body === "hi Alice, this is Bob");

// sender gets their own message back (ack)
const ackP = new Promise((resolve) => sockA.once("message:new", resolve));
await new Promise((r) => setTimeout(r, 200));
sockA.emit("message:send", { conversationId: convId, type: "text", body: "self ack test" });
const ack = await Promise.race([ackP, sleep(5000).then(() => null)]);
ok("sender receives own message ack", ack && ack.senderId === a.user.id);

// presence: B goes offline -> presence:update offline broadcast
const offlineP = new Promise((resolve) => sockA.once("presence:update", resolve));
sockB.disconnect();
const off = await Promise.race([offlineP, sleep(5000).then(() => null)]);
ok("presence offline broadcast", off && off.userId === b.user.id && off.online === false);

// 401 on bad token
await axios
  .get(`${BASE}/api/conversations`, { headers: { Authorization: "Bearer garbage" } })
  .then(() => ok("401 on bad token", false))
  .catch((e) => ok("401 on bad token", e.response?.status === 401));

// logout revokes refresh token
await waitOnLogout();
await axios
  .post(`${BASE}/api/auth/refresh`, { refreshToken: a.refreshToken })
  .then((r) => ok("refresh revoked after logout", false, `still worked ${r.status}`))
  .catch((e) => ok("refresh revoked after logout", e.response?.status === 401));

// rate limiting: hammer login LAST (leaves no state that breaks other tests)
let throttled = false;
for (let i = 0; i < 25; i++) {
  const r = await axios
    .post(`${BASE}/api/auth/login`, { emailOrUsername: aName, password: "wrong" })
    .catch((e) => e.response);
  if (r.status === 429) { throttled = true; break; }
}
ok("Redis rate limiter blocks flood", throttled);

async function waitOnLogout() {
  await axios.post(`${BASE}/api/auth/logout`, { refreshToken: a.refreshToken }).catch(() => {});
  await sleep(300);
}

sockA.disconnect();
console.log(failures === 0 ? "\nALL E2E TESTS PASSED ✅" : `\n${failures} TEST(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);