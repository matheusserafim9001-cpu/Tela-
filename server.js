import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, app: "Serafim Transmissões" }));
app.get("/config", (_req, res) => {
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(",").map(x => x.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  res.json({ iceServers, turnConfigured: iceServers.length > 1 });
});

const rooms = new Map();
const makeCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();

io.on("connection", socket => {
  socket.on("create-room", (_data, callback) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    rooms.set(code, { host: socket.id, viewers: new Set() });
    socket.join(code);
    socket.data.room = code;
    socket.data.role = "host";
    callback?.({ ok: true, code });
    socket.emit("room-count", 1);
  });

  socket.on("join-room", ({ code }, callback) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback?.({ ok: false, error: "Sala não encontrada. Confira o código." });
    if (room.viewers.size >= 8) return callback?.({ ok: false, error: "Esta sala já atingiu o limite de 8 espectadores." });
    if (room.host === socket.id) return callback?.({ ok: false, error: "Você já é o anfitrião desta sala." });
    room.viewers.add(socket.id);
    socket.join(code);
    socket.data.room = code;
    socket.data.role = "viewer";
    callback?.({ ok: true, code });
    io.to(room.host).emit("viewer-joined", { viewerId: socket.id });
    io.to(code).emit("room-count", room.viewers.size + 1);
  });

  socket.on("signal", ({ to, payload }) => {
    if (!to || !payload || !socket.data.room) return;
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const allowed = socket.data.role === "host"
      ? room.viewers.has(to)
      : room.host === to;
    if (allowed) io.to(to).emit("signal", { from: socket.id, payload });
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.data.role === "host") {
      io.to(code).emit("host-left");
      rooms.delete(code);
    } else {
      room.viewers.delete(socket.id);
      io.to(room.host).emit("viewer-left", { viewerId: socket.id });
      io.to(code).emit("room-count", room.viewers.size + 1);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => console.log(`Serafim Transmissões online na porta ${port}`));
