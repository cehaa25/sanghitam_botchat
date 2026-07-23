/* ==========================================================
   PITCH BLACK — Anonymous Chat
   Supabase Realtime + Storage + WebRTC
   ========================================================== */

// ---------- CONFIG ----------
// Replace with your Supabase project credentials.
// For production, use Vercel env vars and inject via window.__ENV__ or a small API.
const SUPABASE_URL = window.__ENV__?.SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- STATE ----------
const state = {
  userId: crypto.randomUUID(),
  username: generateUsername(),
  roomId: null,
  channel: null,
  peers: new Map(),          // userId -> RTCPeerConnection
  localStream: null,
  remoteStream: null,
  mediaRecorder: null,
  recChunks: [],
  recStart: 0,
  recTimer: null,
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ---------- UTILS ----------
function $(id) { return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function toast(msg, ms = 2500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function generateUsername() {
  const adj = ['Silent','Shadow','Midnight','Phantom','Ghost','Velvet','Crimson','Hollow','Wandering','Veiled'];
  const noun = ['Knight','Rook','Bishop','Pawn','Crown','Mask','Raven','Wolf','Fox','Owl'];
  return adj[Math.floor(Math.random()*adj.length)] + noun[Math.floor(Math.random()*noun.length)] + Math.floor(Math.random()*99);
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatTime(s) {
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function roomSlug(input) {
  return (input || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32) || 'room-' + Math.random().toString(36).slice(2, 8);
}

// ---------- LANDING ----------
$('createBtn').onclick = () => {
  const slug = 'room-' + Math.random().toString(36).slice(2, 8);
  $('roomInput').value = slug;
  joinRoom(slug);
};
$('joinBtn').onclick = () => {
  const slug = roomSlug($('roomInput').value);
  if (!slug) return toast('Enter a room code');
  joinRoom(slug);
};

// Auto-join from URL: ?room=xxx
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { $('roomInput').value = urlRoom; }

// ---------- JOIN ROOM ----------
async function joinRoom(slug) {
  state.roomId = slug;
  $('roomName').textContent = '#' + slug;
  showScreen('chat');

  // Subscribe to realtime channel (broadcast + presence + db changes)
  state.channel = supabase.channel('room:' + slug, {
    config: { broadcast: { self: false }, presence: { key: state.userId } }
  });

  // --- Presence: online users ---
  state.channel.on('presence', { event: 'sync' }, () => {
    const present = state.channel.presenceState();
    $('onlineCount').textContent = Object.keys(present).length;
  });
  state.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    addSystemMsg(`${newPresences[0]?.username || 'Someone'} joined`);
  });
  state.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    addSystemMsg(`${leftPresences[0]?.username || 'Someone'} left`);
    cleanupPeer(key);
  });

  // --- Broadcast: chat messages ---
  state.channel.on('broadcast', { event: 'chat' }, ({ payload }) => renderMessage(payload));

  // --- Broadcast: typing indicator ---
  state.channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (payload.userId !== state.userId) showTyping(payload.username);
  });

  // --- Broadcast: WebRTC signaling ---
  state.channel.on('broadcast', { event: 'rtc-offer' }, handleOffer);
  state.channel.on('broadcast', { event: 'rtc-answer' }, handleAnswer);
  state.channel.on('broadcast', { event: 'rtc-ice' }, handleIce);
  state.channel.on('broadcast', { event: 'rtc-hangup' }, ({ payload }) => {
    if (payload.to === state.userId) endCall();
  });

  await state.channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await state.channel.track({ userId: state.userId, username: state.username, onlineAt: new Date().toISOString() });
      addSystemMsg(`You joined as ${state.username}`);
      loadHistory();
    }
  });
}

// ---------- MESSAGE HISTORY (optional) ----------
async function loadHistory() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', state.roomId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return;
  (data || []).forEach(renderMessage);
}

// ---------- SEND MESSAGE ----------
async function sendMessage(content, type = 'text', mediaUrl = null) {
  const payload = {
    id: crypto.randomUUID(),
    userId: state.userId,
    username: state.username,
    roomId: state.roomId,
    content,
    type,
    mediaUrl,
    createdAt: new Date().toISOString(),
  };

  // Persist to DB (for history)
  if (type !== 'typing') {
    await supabase.from('messages').insert(payload);
  }

  // Broadcast live
  state.channel.send({ type: 'broadcast', event: 'chat', payload });
}

// ---------- RENDER MESSAGE ----------
function renderMessage(m) {
  if (document.querySelector(`[data-id="${m.id}"]`)) return; // dedupe
  const el = document.createElement('div');
  el.className = 'msg ' + (m.userId === state.userId ? 'own' : 'other');
  el.dataset.id = m.id;

  let body = '';
  if (m.userId !== state.userId) body += `<div class="author">${escapeHtml(m.username)}</div>`;

  if (m.type === 'text') body += `<div>${escapeHtml(m.content).replace(/\n/g,'<br>')}</div>`;
  else if (m.type === 'image') body += `<img src="${m.mediaUrl}" alt="image" loading="lazy" />`;
  else if (m.type === 'video') body += `<video src="${m.mediaUrl}" controls playsinline></video>`;
  else if (m.type === 'voice') body += `<audio src="${m.mediaUrl}" controls></audio>`;

  el.innerHTML = body;
  $('messages').appendChild(el);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function addSystemMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg system';
  el.textContent = text;
  $('messages').appendChild(el);
  $('messages').scrollTop = $('messages').scrollHeight;
}

// ---------- COMPOSER ----------
const input = $('messageInput');
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  state.channel.send({ type: 'broadcast', event: 'typing', payload: { userId: state.userId, username: state.username } });
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
});
$('sendBtn').onclick = doSend;

function doSend() {
  const text = input.value.trim();
  if (!text) return;
  sendMessage(text, 'text');
  input.value = '';
  input.style.height = 'auto';
}

let typingTimer;
function showTyping(username) {
  let el = document.querySelector('.typing');
  if (!el) {
    el = document.createElement('div');
    el.className = 'typing';
    $('messages').parentNode.insertBefore(el, document.querySelector('.composer'));
  }
  el.textContent = `${username} is typing...`;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => el.remove(), 2000);
}

// ---------- EMOJI PICKER ----------
const EMOJIS = ['😀','😂','😍','😎','😭','🤔','🙄','😴','🤯','🥳','😱','🤗','😈','👻','💀','🔥','❤️','💔','✨','🎉','👍','👎','🙏','💯','🚀','⭐','🌙','☀️','🎵','🎮','☕','🍕','🍺','🌈','♞','♟','♜','♝','♛','♚'];
const picker = $('emojiPicker');
EMOJIS.forEach(e => {
  const b = document.createElement('button');
  b.textContent = e;
  b.onclick = () => { input.value += e; input.focus(); picker.classList.add('hidden'); };
  picker.appendChild(b);
});
$('emojiBtn').onclick = () => picker.classList.toggle('hidden');

// ---------- FILE UPLOAD (image/video) ----------
$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Max 25MB');

  toast('Uploading...');
  const ext = file.name.split('.').pop();
  const path = `${state.roomId}/${state.userId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file, { upsert: false });
  if (error) return toast('Upload failed');

  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  const type = file.type.startsWith('video') ? 'video' : 'image';
  sendMessage(type === 'video' ? '🎬 Video' : '📷 Photo', type, data.publicUrl);
  e.target.value = '';
};

// ---------- VOICE NOTE ----------
$('voiceBtn').onclick = async () => {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.recChunks = [];
    state.recStart = Date.now();
    $('voiceRecorder').classList.remove('hidden');
    state.recTimer = setInterval(() => {
      $('recTime').textContent = formatTime((Date.now() - state.recStart) / 1000);
    }, 500);

    state.mediaRecorder.ondataavailable = e => state.recChunks.push(e.data);
    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(state.recTimer);
    };
    state.mediaRecorder.start();
  } catch (err) {
    toast('Mic access denied');
  }
};
$('cancelRec').onclick = () => {
  state.mediaRecorder?.stop();
  $('voiceRecorder').classList.add('hidden');
};
$('sendRec').onclick = async () => {
  state.mediaRecorder?.stop();
  $('voiceRecorder').classList.add('hidden');
  setTimeout(async () => {
    const blob = new Blob(state.recChunks, { type: 'audio/webm' });
    const path = `${state.roomId}/voice-${state.userId}-${Date.now()}.webm`;
    const { error } = await supabase.storage.from('chat-media').upload(path, blob);
    if (error) return toast('Upload failed');
    const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
    sendMessage('🎤 Voice note', 'voice', data.publicUrl);
  }, 300);
};

// ---------- CALLS (WebRTC) ----------
$('callBtn').onclick = () => startCall(false);
$('videoBtn').onclick = () => startCall(true);

async function startCall(withVideo) {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo,
    });
    $('localVideo').srcObject = state.localStream;
    $('callOverlay').classList.remove('hidden');

    // Signal all present peers
    const present = state.channel.presenceState();
    for (const peerId of Object.keys(present)) {
      if (peerId === state.userId) continue;
      await createPeer(peerId, true, withVideo);
    }
  } catch (err) {
    toast('Cannot start call');
    endCall();
  }
}

async function createPeer(remoteId, initiator, withVideo) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  state.peers.set(remoteId, pc);

  state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      state.channel.send({
        type: 'broadcast',
        event: 'rtc-ice',
        payload: { from: state.userId, to: remoteId, candidate: e.candidate },
      });
    }
  };
  pc.ontrack = (e) => {
    state.remoteStream = e.streams[0];
    $('remoteVideo').srcObject = state.remoteStream;
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.channel.send({
      type: 'broadcast',
      event: 'rtc-offer',
      payload: { from: state.userId, to: remoteId, sdp: offer, video: withVideo },
    });
  }
  return pc;
}

async function handleOffer({ payload }) {
  if (payload.to !== state.userId) return;
  const pc = await createPeer(payload.from, false, payload.video);
  await pc.setRemoteDescription(payload.sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  state.channel.send({
    type: 'broadcast',
    event: 'rtc-answer',
    payload: { from: state.userId, to: payload.from, sdp: answer },
  });
}

async function handleAnswer({ payload }) {
  if (payload.to !== state.userId) return;
  const pc = state.peers.get(payload.from);
  if (pc) await pc.setRemoteDescription(payload.sdp);
}

async function handleIce({ payload }) {
  if (payload.to !== state.userId) return;
  const pc = state.peers.get(payload.from);
  if (pc) await pc.addIceCandidate(payload.candidate).catch(()=>{});
}

$('muteBtn').onclick = () => {
  if (!state.localStream) return;
  const t = state.localStream.getAudioTracks()[0];
  t.enabled = !t.enabled;
  $('muteBtn').textContent = t.enabled ? '🎤' : '🔇';
};
$('camBtn').onclick = () => {
  if (!state.localStream) return;
  const t = state.localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('camBtn').textContent = t.enabled ? '📹' : '📷';
};
$('hangupBtn').onclick = () => {
  state.channel.send({
    type: 'broadcast',
    event: 'rtc-hangup',
    payload: { from: state.userId },
  });
  endCall();
};

function endCall() {
  state.peers.forEach(pc => pc.close());
  state.peers.clear();
  state.localStream?.getTracks().forEach(t => t.stop());
  state.localStream = null;
  state.remoteStream = null;
  $('callOverlay').classList.add('hidden');
}

function cleanupPeer(peerId) {
  const pc = state.peers.get(peerId);
  if (pc) { pc.close(); state.peers.delete(peerId); }
}

// ---------- MISC ----------
$('copyLinkBtn').onclick = () => {
  const url = location.origin + '?room=' + state.roomId;
  navigator.clipboard.writeText(url);
  toast('Invite link copied');
};
$('leaveBtn').onclick = () => {
  state.channel?.unsubscribe();
  endCall();
  location.href = location.origin;
};

// Close emoji picker on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) {
    picker.classList.add('hidden');
  }
});
