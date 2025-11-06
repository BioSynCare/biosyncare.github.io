const VERSION = '20251106-3';
// Minimal Firebase ESM client for shared comments
const FB_VER = '10.7.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}`;
const FB_APP = `${FB_BASE}/firebase-app.js`;
const FB_AUTH = `${FB_BASE}/firebase-auth.js`;
const FB_FS = `${FB_BASE}/firebase-firestore.js`;
const FB_CONFIG = {
  apiKey: 'AIzaSyAWcLkLlzmwlGJAb-CSkue78rnTUEhfAo8',
  authDomain: 'biosyncarelab.firebaseapp.com',
  projectId: 'biosyncarelab',
  storageBucket: 'biosyncarelab.firebasestorage.app',
  messagingSenderId: '831255166249',
  appId: '1:831255166249:web:708133d374e80af9d48b38',
  measurementId: 'G-K4X7HXKQ2C',
};
let fb = { app: null, auth: null, db: null, authModule: null, fsModule: null, ready: false };
async function initFirebaseClient() {
  if (fb.ready) return fb;
  try {
    const appMod = await import(FB_APP);
    const fsMod = await import(FB_FS);
    const authMod = await import(FB_AUTH);
    const app = appMod.initializeApp(FB_CONFIG);
    const db = fsMod.getFirestore(app);
    const auth = authMod.getAuth(app);
    try { auth.useDeviceLanguage && auth.useDeviceLanguage(); } catch {}
    if (!auth.currentUser) { try { await authMod.signInAnonymously(auth); } catch (e) { console.warn('[Entity] Anonymous auth failed', e); } }
    fb = { app, db, auth, authModule: authMod, fsModule: fsMod, ready: true };
  } catch (e) { console.warn('[Entity] Firebase unavailable, using LocalStorage comments.', e); fb.ready = false; }
  return fb;
}
async function loadJSON(path) { const url = path + (path.includes('?') ? '&' : '?') + 'v=' + VERSION; const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`Failed ${path}`); return r.json(); }
function getParam(name) { const u = new URL(window.location.href); return u.searchParams.get(name); }

async function main() {
  const uri = getParam('uri');
  const base = './data/';
  const entities = await loadJSON(base + 'entities.json');
  const nodes = await loadJSON(base + 'nodes.json');
  const edges = await loadJSON(base + 'edges.json');

  const t = document.getElementById('title');
  const st = document.getElementById('subtitle');
  const desc = document.getElementById('desc');
  const neigh = document.getElementById('neighbors');
  // Comments UI
  const commentsListEl = document.getElementById('commentsList');
  const commentInputEl = document.getElementById('commentInput');
  const addCommentBtn = document.getElementById('addComment');
  const COMMENTS_KEY = 'bsc-explorer-comments';
  function loadLocalStore() { try { const s = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); return { nodes: s.nodes || {}, edges: s.edges || {} }; } catch { return { nodes: {}, edges: {} }; } }
  function saveLocalStore(store) { localStorage.setItem(COMMENTS_KEY, JSON.stringify(store)); }
  let localStore = loadLocalStore();

  async function getNodeComments(id) {
    const { ready, db, fsModule } = await initFirebaseClient();
    if (!ready) { return localStore.nodes[id] || []; }
    const { collection, query, where, getDocs } = fsModule;
    const q = query(collection(db, 'ontology_comments'), where('targetType','==','node'), where('targetId','==', id));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((doc)=>{ const d = doc.data(); items.push({ id: doc.id, text: d.text, ts: d.createdAt?.toMillis ? d.createdAt.toMillis() : d.createdAt || Date.now(), userId: d.userId || null }); });
    items.sort((a,b)=> b.ts - a.ts);
    return items;
  }
  async function addNodeComment(id, text) {
    const { ready, db, fsModule, auth } = await initFirebaseClient();
    if (!ready) {
      const arr = localStore.nodes[id] || (localStore.nodes[id] = []);
      arr.push({ id: Date.now().toString(36), text: text.trim(), ts: Date.now() });
      saveLocalStore(localStore);
      return;
    }
    const { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } = fsModule;
    const userId = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    await addDoc(collection(db, 'ontology_comments'), { targetType: 'node', targetId: id, text: text.trim(), userId, createdAt: serverTimestamp() });
    const metaRef = doc(db, 'ontology_comments_meta', id);
    const ms = await getDoc(metaRef);
    if (!ms.exists()) await setDoc(metaRef, { count: 1 }); else await updateDoc(metaRef, { count: (ms.data().count || 0) + 1 });
  }
  async function deleteNodeComment(id, cid) {
    const { ready, db, fsModule } = await initFirebaseClient();
    if (!ready) {
      const arr = localStore.nodes[id] || [];
      const i = arr.findIndex(c => c.id === cid);
      if (i>=0) { arr.splice(i,1); saveLocalStore(localStore); }
      return;
    }
    const { doc, deleteDoc, getDoc, updateDoc } = fsModule;
    try { await deleteDoc(doc(db, 'ontology_comments', cid)); } catch {}
    const metaRef = doc(db, 'ontology_comments_meta', id);
    const ms = await getDoc(metaRef);
    if (ms.exists()) {
      const next = Math.max(0, (ms.data().count || 0) - 1);
      if (next === 0) { try { await deleteDoc(metaRef); } catch {} }
      else { await updateDoc(metaRef, { count: next }); }
    }
  }
  async function renderComments(id) { const items = await getNodeComments(id); commentsListEl.innerHTML = ''; for (const c of items) { const div = document.createElement('div'); div.className='comment-item'; const meta=document.createElement('div'); meta.className='comment-meta'; const date=new Date(c.ts).toLocaleString(); const left=document.createElement('span'); left.textContent=date; const del=document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.addEventListener('click', async ()=>{ await deleteNodeComment(id, c.id); await renderComments(id); }); meta.appendChild(left); meta.appendChild(del); const text=document.createElement('div'); text.textContent=c.text; div.appendChild(meta); div.appendChild(text); commentsListEl.appendChild(div);} }

  const ent = entities[uri];
  if (!ent) {
    t.textContent = uri || 'Unknown';
    desc.textContent = 'Entity not found in index.';
    return;
  }

  t.textContent = ent.label || uri;
  st.textContent = `${ent.type || ''} — ${uri}`;
  desc.textContent = ent.description || ent.comment || '';

  // Neighbor listing by kind
  const incoming = {}, outgoing = {};
  for (const e of edges) {
    if (e.target === uri) { (incoming[e.kind] ||= []).push(e); }
    if (e.source === uri) { (outgoing[e.kind] ||= []).push(e); }
  }

  function renderEdgeList(title, dict, dir) {
    const kinds = Object.keys(dict);
    if (kinds.length === 0) return '';
    let html = `<h3>${title}</h3>`;
    for (const k of kinds) {
      html += `<h4 class="muted">${k}</h4><ul>`;
      for (const e of dict[k]) {
        const other = dir === 'in' ? e.source : e.target;
        const otherNode = nodes.find(n => n.id === other);
        const label = otherNode?.label || other;
        html += `<li><a href="./entity.html?uri=${encodeURIComponent(other)}">${label}</a> <span class="muted">(${other})</span> <span class="pill">${e.label || ''}</span></li>`;
      }
      html += '</ul>';
    }
    return html;
  }

  neigh.innerHTML = [
    renderEdgeList('Incoming', incoming, 'in'),
    renderEdgeList('Outgoing', outgoing, 'out')
  ].join('');

  // Comments wiring
  await initFirebaseClient();
  await renderComments(uri);
  addCommentBtn.addEventListener('click', async () => { const txt=(commentInputEl.value||'').trim(); if (!txt) return; await addNodeComment(uri, txt); commentInputEl.value=''; await renderComments(uri); });

  // External links
  const webvowl = document.getElementById('webvowlLink');
  webvowl.href = '../webvowl/app/index.html#iri=' + encodeURIComponent(uri);
  const pylode = document.getElementById('pylodeLink');
  pylode.href = '../pylode/';
}

document.addEventListener('DOMContentLoaded', main);
