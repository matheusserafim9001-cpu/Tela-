const socket = io({ transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
const $ = id => document.getElementById(id);
const state = { role: null, code: null, localStream: null, peers: new Map(), hostPeer: null, iceServers: null, joined: false };
const show = (id, yes=true) => $(id).classList.toggle("hidden", !yes);
const setStatus = (title, hint) => { $("videoStatus").textContent = title; $("videoHint").textContent = hint; };
const setBusy = (button, busy, label) => { button.disabled = busy; if (label) button.textContent = label; };

$("hostTab").onclick = () => { $("hostTab").classList.add("active"); $("joinTab").classList.remove("active"); show("hostForm"); show("joinForm", false); };
$("joinTab").onclick = () => { $("joinTab").classList.add("active"); $("hostTab").classList.remove("active"); show("joinForm"); show("hostForm", false); };
$("roomInput").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g,"").slice(0,6));

async function loadConfig() {
  if (!state.iceServers) {
    const response = await fetch("/config");
    const config = await response.json();
    state.iceServers = config.iceServers;
    if (!config.turnConfigured) $("notice").textContent = "STUN ativo. Para conexões em redes restritas, configure um servidor TURN no Render.";
  }
}
function newPeer() {
  return new RTCPeerConnection({ iceServers: state.iceServers, iceCandidatePoolSize: 10, bundlePolicy: "max-bundle" });
}
function sendSignal(to, payload) { socket.emit("signal", { to, payload }); }
function showStage(role, code) {
  show("homePanel", false); show("stage");
  $("stageTitle").textContent = role === "host" ? "Sua transmissão" : "Assistindo transmissão";
  $("roomLabel").textContent = "Código: " + code;
  $("viewerCount").textContent = role === "host" ? "1" : "2";
}
function showVideoError(message) {
  show("placeholder", false); show("videoError");
  if (message) $("notice").textContent = message;
}
function resetVideo() {
  $("remoteVideo").srcObject = null;
  show("videoError", false); show("placeholder");
}
async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Use Chrome ou Edge atualizado em um endereço HTTPS para compartilhar a tela.");
  // Deve ser chamado diretamente pelo clique do usuário para o navegador liberar a captura.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: true
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("O navegador não forneceu uma faixa de vídeo. Tente compartilhar a tela novamente.");
  track.contentHint = "motion";
  track.addEventListener("ended", () => stopSession("Compartilhamento encerrado pelo navegador."));
  track.addEventListener("mute", () => { $("notice").textContent = "A captura foi pausada. Verifique se a janela compartilhada continua disponível."; });
  track.addEventListener("unmute", () => { $("notice").textContent = "Captura de tela ativa."; });
  state.localStream = stream;
  return stream;
}
async function createOfferFor(viewerId) {
  const pc = newPeer();
  state.peers.set(viewerId, pc);
  state.localStream.getTracks().forEach(track => pc.addTrack(track, state.localStream));
  pc.onicecandidate = e => { if (e.candidate) sendSignal(viewerId, { type: "candidate", candidate: e.candidate }); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
    if (pc.connectionState === "connected") $("notice").textContent = "Conexão estabelecida com um espectador.";
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal(viewerId, { type: "offer", sdp: pc.localDescription });
}
async function handleSignal({ from, payload }) {
  try {
    if (state.role === "host") {
      const pc = state.peers.get(from);
      if (!pc) return;
      if (payload.type === "answer") await pc.setRemoteDescription(payload.sdp);
      if (payload.type === "candidate" && payload.candidate) await pc.addIceCandidate(payload.candidate);
      return;
    }
    if (payload.type === "offer") {
      const pc = newPeer(); state.hostPeer = pc;
      pc.ontrack = event => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        $("remoteVideo").srcObject = stream;
        $("remoteVideo").muted = false;
        $("remoteVideo").play().then(() => { show("placeholder", false); show("videoError", false); }).catch(() => {
          setStatus("Toque para assistir", "O navegador bloqueou a reprodução automática.");
          show("placeholder");
          $("placeholder").onclick = () => $("remoteVideo").play().then(() => show("placeholder", false)).catch(()=>{});
        });
        event.track.onmute = () => showVideoError("A imagem foi pausada ou a janela compartilhada ficou indisponível.");
        event.track.onunmute = () => { show("videoError", false); show("placeholder", false); };
        event.track.onended = () => showVideoError("A transmissão de vídeo terminou.");
      };
      pc.onicecandidate = e => { if (e.candidate) sendSignal(from, { type: "candidate", candidate: e.candidate }); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") { setStatus("Reconectando...", "Tentando restabelecer a conexão."); pc.restartIce(); show("placeholder"); }
        if (pc.connectionState === "disconnected") { setStatus("Conexão instável", "Aguardando a rede se recuperar."); show("placeholder"); }
      };
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, { type: "answer", sdp: pc.localDescription });
    } else if (payload.type === "candidate" && payload.candidate && state.hostPeer) {
      await state.hostPeer.addIceCandidate(payload.candidate);
    }
  } catch (error) { console.error("Falha na sinalização:", error); $("notice").textContent = "Falha ao negociar a conexão. Tente sair e entrar novamente."; }
}

$("createBtn").onclick = async () => {
  const btn = $("createBtn"); setBusy(btn, true);
  try {
    await loadConfig();
    const stream = await startCapture();
    socket.emit("create-room", {}, async result => {
      if (!result?.ok) throw new Error("Não foi possível criar a sala.");
      state.role = "host"; state.code = result.code; state.joined = true;
      showStage("host", result.code);
      $("stageTitle").textContent = "Você está transmitindo";
      $("videoStatus").textContent = "Sua tela está sendo compartilhada";
      $("videoHint").textContent = "Envie o código da sala para seus amigos.";
      $("remoteVideo").srcObject = stream; $("remoteVideo").muted = true;
      show("placeholder", false);
      $("notice").textContent = "Compartilhamento ativo. Selecione a tela ou janela do jogo na janela do navegador.";
    });
  } catch (error) {
    alert(error.message || "Não foi possível iniciar a transmissão.");
    state.localStream?.getTracks().forEach(t => t.stop()); state.localStream = null;
  } finally { setBusy(btn, false, "Criar minha transmissão →"); }
};
$("joinBtn").onclick = async () => {
  const btn = $("joinBtn"), code = $("roomInput").value.trim();
  if (code.length !== 6) return alert("Digite o código de 6 caracteres.");
  setBusy(btn, true);
  try {
    await loadConfig();
    socket.emit("join-room", { code }, result => {
      if (!result?.ok) { alert(result?.error || "Não foi possível entrar."); setBusy(btn, false, "Entrar na transmissão →"); return; }
      state.role = "viewer"; state.code = result.code; state.joined = true;
      showStage("viewer", result.code);
      setStatus("Conectando à transmissão...", "Aguarde enquanto estabelecemos uma conexão segura.");
    });
  } catch (error) { alert(error.message); setBusy(btn, false, "Entrar na transmissão →"); }
};
socket.on("viewer-joined", async ({ viewerId }) => { if (state.role === "host" && state.localStream) await createOfferFor(viewerId); });
socket.on("signal", handleSignal);
socket.on("room-count", count => $("viewerCount").textContent = count);
socket.on("viewer-left", ({ viewerId }) => { state.peers.get(viewerId)?.close(); state.peers.delete(viewerId); });
socket.on("host-left", () => { setStatus("O anfitrião saiu", "A transmissão foi encerrada."); showVideoError("O anfitrião encerrou a sala."); });
socket.on("connect", () => { if (state.joined) $("notice").textContent = "Sinalização reconectada. Se a imagem não voltar, entre novamente na sala."; });
socket.on("disconnect", () => { if (state.joined) $("notice").textContent = "Conexão com o servidor interrompida. Tentando reconectar..."; });

function stopSession(message) {
  state.localStream?.getTracks().forEach(t => t.stop()); state.localStream = null;
  state.peers.forEach(pc => pc.close()); state.peers.clear();
  state.hostPeer?.close(); state.hostPeer = null;
  if (state.joined) socket.disconnect();
  state.joined = false; state.role = null; state.code = null;
  show("stage", false); show("homePanel", true); resetVideo();
  $("createBtn").disabled = false; $("joinBtn").disabled = false;
  $("notice").textContent = message || "Você saiu da sala.";
  socket.connect();
}
$("stopBtn").onclick = () => stopSession("Você saiu da sala.");
$("copyBtn").onclick = async () => {
  const text = state.code || "";
  try { await navigator.clipboard.writeText(text); $("copyBtn").textContent = "Código copiado!"; }
  catch { prompt("Copie o código da sala:", text); }
  setTimeout(() => $("copyBtn").textContent = "Copiar código", 1800);
};
window.addEventListener("beforeunload", () => {
  state.localStream?.getTracks().forEach(t => t.stop());
  state.peers.forEach(pc => pc.close()); state.hostPeer?.close();
});
