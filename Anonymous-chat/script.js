// ==========================================================
// PITCH BLACK — Anonymous Chat
// ==========================================================

// ⚠️ REPLACE THESE WITH YOUR SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  userId: crypto.randomUUID(),
  username: generateUsername(),
  roomId: null,
  channel: null,
  peers: new Map(),
  localStream: null,
  mediaRecorder: null,
  recChunks: [],
  recTimer: null,
};

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// --- Utilities ---
const $ = (id) => document.getElementById(id);
const showScreen = (id) => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
};
const toast = (msg, ms = 2500) => {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
};
const generateUsername = () => {
  const adj = ['Silent','Shadow','Midnight','Phantom','Ghost','Velvet','Hollow','Veiled','Neon','Cyber'];
  const noun = ['Knight','Rook','Bishop','Pawn','Raven','Wolf','Fox','Owl','Specter','Wraith'];
  return adj[Math.floor(Math.random()*adj.length)] + noun[Math.floor(Math.random()*noun.length)] + Math.floor(Math.random()*99);
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime = (s) => {
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
};
const roomSlug = (input) => (input || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32) || 'room-' + Math.random().toString(36).slice(2, 8);

// --- Landing ---
$('createBtn').onclick = () => {
  $('roomInput').value = 'room-' + Math.random().toString(36).slice(2, 8);
  joinRoom($('roomInput').value);
};
$('joinBtn').onclick = () => {
  const slug = roomSlug($('roomInput').value);
  if (!slug) return toast('Enter a room code');
  joinRoom(slug);
};

const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { $('roomInput').value = urlRoom; }

// --- Join Room ---
async function joinRoom(slug) {
  state.roomId = slug;
  $('roomName').textContent = '#' + slug;
  showScreen('chat');

  state.channel = supabase.channel('room:' + slug, {
    config: { broadcast: { self: false }, presence: { key: state.userId } }
  });

  state.channel.on('presence', { event: 'sync' }, () => {
    $('onlineCount').textContent = Object.keys(state.channel.presenceState()).length;
  });
  state.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
    addSystemMsg(`${newPresences[0]?.username || 'Someone'} joined`);
  });
  state.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    addSystemMsg(`${leftPresences[0]?.username || 'Someone'} left`);
    cleanupPeer(leftPresences[0]?.userId);
  });

  state.channel.on('broadcast', { event: 'chat' }, ({ payload }) => renderMessage(payload));
  state.channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (payload.userId !== state.userId) showTyping(payload.username);
  });
  state.channel.on('broadcast', { event: 'rtc-offer' }, handleOffer);
  state.channel.on('broadcast', { event: 'rtc-answer' }, handleAnswer);
  state.channel.on('broadcast', { event: 'rtc-ice' }, handleIce);
  state.channel.on('broadcast', { event: 'rtc-hangup' }, ({ payload }) => {
    if (payload.to === state.userId) endCall();
  });

  await state.channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await state.channel.track({ userId: state.userId, username: state.username });
      addSystemMsg(`You joined as ${state.username}`);
      loadHistory();
    }
  });
}

// --- History ---
async function loadHistory() {
  const { data } = await supabase.from('messages').select('*').eq('room_id', state.roomId).order('created_at', { ascending: true }).limit(50);
  if (data) data.forEach(renderMessage);
}

// --- Messaging ---
async function sendMessage(content, type = 'text', mediaUrl = null) {
  const payload = {
    id: crypto.randomUUID(), userId: state.userId, username: state.username,
    roomId: state.roomId, content, type, mediaUrl, createdAt: new Date().toISOString(),
  };
  if (type !== 'typing') await supabase.from('messages').insert(payload);
  state.channel.send({ type: 'broadcast', event: 'chat', payload });
}

function renderMessage(m) {
  if (document.querySelector(`[data-id="${m.id}"]`)) return;
  const el = document.createElement('div');
  el.className = 'msg ' + (m.userId === state.userId ? 'own' : (m.type === 'system' ? 'system' : 'other'));
  el.dataset.id = m.id;

  let body = '';
  if (m.userId !== state.userId && m.type !== 'system') body += `<div class="author">${escapeHtml(m.username)}</div>`;
  if (m.type === 'text') body += `<div>${escapeHtml(m.content).replace(/\n/g,'<br>')}</div>`;
  else if (m.type === 'image') body += `<img src="${m.mediaUrl}" alt="image" loading="lazy" />`;
  else if (m.type === 'video') body += `<video src="${m.mediaUrl}" controls playsinline></video>`;
  else if (m.type === 'voice') body += `<audio src="${m.mediaUrl}" controls></audio>`;
  else if (m.type === 'system') body += escapeHtml(m.content);

  el.innerHTML = body;
  $('messages').appendChild(el);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function addSystemMsg(text) { renderMessage({ id: crypto.randomUUID(), type: 'system', content: text, userId: 'system' }); }

// --- Composer ---
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
  const el = $('typingIndicator');
  el.textContent = `${username} is typing...`;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => (el.textContent = ''), 2000);
}

// --- Emoji ---
const EMOJIS = ['😀','😂','😍','😎','😭','🤔','🙄','😴','🤯','🥳','😱','🤗','😈','👻','💀','🔥','❤️','💔','✨','🎉','👍','👎','🙏','💯','🚀','⭐','🌙','☀️','🎵','🎮','☕','🍕','♞','♟','♜','♝','♛','♚'];
const picker = $('emojiPicker');
EMOJIS.forEach(e => {
  const b = document.createElement('button');
  b.textContent = e;
  b.onclick = () => { input.value += e; input.focus(); picker.classList.add('hidden'); };
  picker.appendChild(b);
});
$('emojiBtn').onclick = () => picker.classList.toggle('hidden');
document.addEventListener('click', (e) => {
  if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) picker.classList.add('hidden');
});

// --- File Upload ---
$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Max file size is 25MB');
  toast('Uploading...');
  
  const ext = file.name.split('.').pop();
  const path = `${state.roomId}/${state.userId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file);
  if (error) return toast('Upload failed');

  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  const type = file.type.startsWith('video') ? 'video' : 'image';
  sendMessage(type === 'video' ? '🎬 Video' : '📷 Photo', type, data.publicUrl);
  e.target.value = '';
};

// --- Voice Note ---
$('voiceBtn').onclick = async () => {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.recChunks = [];
    state.recStart = Date.now();
    $('voiceRecorder').classList.remove('hidden');
    state.recTimer = setInterval(() => { $('recTime').textContent = formatTime((Date.now() - state.recStart) / 1000); }, 500);

    state.mediaRecorder.ondataavailable = (e) => state.recChunks.push(e.data);
    state.mediaRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); clearInterval(state.recTimer); };
    state.mediaRecorder.start();
  } catch { toast('Mic access denied'); }
};
$('cancelRec').onclick = () => { state.mediaRecorder?.stop(); $('voiceRecorder').classList.add('hidden'); };
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

// --- WebRTC Calls ---
$('callBtn').onclick = () => startCall(false);
$('videoBtn').onclick = () => startCall(true);

async function startCall(withVideo) {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
    $('localVideo').srcObject = state.localStream;
    $('callOverlay').classList.remove('hidden');

    const present = state.channel.presenceState();
    for (const peerId of Object.keys(present)) {
      if (peerId === state.userId) continue;
      await createPeer(peerId, true, withVideo);
    }
  } catch { toast('Cannot start call'); endCall(); }
}

async function createPeer(remoteId, initiator, withVideo) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  state.peers.set(remoteId, pc);
  state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      state.channel.send({ type: 'broadcast', event: 'rtc-ice', payload: { from: state.userId, to: remoteId, candidate: e.candidate } });
    }
  };
  pc.ontrack = (e) => { $('remoteVideo').srcObject = e.streams[0]; };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.channel.send({ type: 'broadcast', event: 'rtc-offer', payload: { from: state.userId, to: remoteId, sdp: offer, video: withVideo } });
  }
  return pc;
}

async function handleOffer({ payload }) {
  if (payload.to !== state.userId) return;
  const pc = await createPeer(payload.from, false, payload.video);
  await pc.setRemoteDescription(payload.sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  state.channel.send({ type: 'broadcast', event: 'rtc-answer', payload: { from: state.userId, to: payload.from, sdp: answer } });
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
  state.channel.send({ type: 'broadcast', event: 'rtc-hangup', payload: { from: state.userId } });
  endCall();
};

function endCall() {
  state.peers.forEach(pc => pc.close());
  state.peers.clear();
  state.localStream?.getTracks().forEach(t => t.stop());
  state.localStream = null;
  $('callOverlay').classList.add('hidden');
}

function cleanupPeer(peerId) {
  const pc = state.peers.get(peerId);
  if (pc) { pc.close(); state.peers.delete(peerId); }
}

// --- Misc ---
$('copyLinkBtn').onclick = () => {
  navigator.clipboard.writeText(location.origin + '?room=' + state.roomId);
  toast('Invite link copied!');
};
$('leaveBtn').onclick = () => {
  state.channel?.unsubscribe();
  endCall();
  location.href = location.origin;
};
