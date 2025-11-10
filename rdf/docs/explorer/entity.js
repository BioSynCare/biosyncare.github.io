const VERSION = '20251106-4';
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

// Safe doc id for Firestore (no slashes): base64url of targetId
function safeId(str){
  try {
    let b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  } catch (e) {
    // Fallback: encodeURIComponent if btoa fails (will include % but no /)
    return encodeURIComponent(str);
  }
}

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
    // Streaming threaded comments with reactions + soft delete
    const commentsListEl = document.getElementById('commentsList');
    const commentInputEl = document.getElementById('commentInput');
    const addCommentBtn = document.getElementById('addComment');
    const COMMENTS_KEY = 'bsc-explorer-comments';
    function loadLocal() { try { const s = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); return s.nodes || {}; } catch { return {}; } }
    function saveLocal(map) { const raw = { nodes: map, edges: {} }; localStorage.setItem(COMMENTS_KEY, JSON.stringify(raw)); }
    let localNodesMap = loadLocal();
    let commentsUnsub = null;
    const reactionUnsubs = new Map();
    const reactionCounts = new Map();
    let latest = [];
    function clearReactions(){ for(const u of reactionUnsubs.values()){ try{u();}catch{} } reactionUnsubs.clear(); reactionCounts.clear(); }
    function startReactionsStream(commentId){ if(!fb.ready) return; try { const { collection, onSnapshot } = fb.fsModule; const col = collection(fb.db,'ontology_comments',commentId,'reactions'); const unsub = onSnapshot(col,(snap)=>{ const counts={ like:0, dislike:0, heart:0, celebrate:0 }; snap.forEach(d=>{ const t=d.data()?.type; if(counts[t]!==undefined) counts[t]++; }); reactionCounts.set(commentId, counts); renderTree(latest); }); reactionUnsubs.set(commentId, unsub); } catch {} }
  function renderTree(items){ const byId=new Map(); const roots=[]; items.forEach(c=>byId.set(c.id,{...c,children:[]})); items.forEach(c=>{ const n=byId.get(c.id); if(c.parentId && byId.has(c.parentId)) byId.get(c.parentId).children.push(n); else roots.push(n); }); commentsListEl.innerHTML=''; const renderNode=(n,d=0)=>{ const div=document.createElement('div'); div.className='comment-item'; div.style.marginLeft=Math.min(d*12,48)+'px'; const meta=document.createElement('div'); meta.className='comment-meta'; const date=document.createElement('span'); date.textContent=new Date(n.ts).toLocaleString(); const actions=document.createElement('div'); const reply=document.createElement('button'); reply.className='btn'; reply.textContent='Reply'; const del=document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.style.marginLeft='.25rem'; actions.appendChild(reply); actions.appendChild(del); meta.appendChild(date); meta.appendChild(actions); const text=document.createElement('div'); text.textContent=n.deleted?'[deleted]':(n.text||''); div.appendChild(meta); div.appendChild(text); const rx=reactionCounts.get(n.id)||{ like:0, dislike:0, heart:0, celebrate:0 }; const rxRow=document.createElement('div'); rxRow.className='muted'; rxRow.style.fontSize='.85rem'; rxRow.style.display='flex'; rxRow.style.gap='.5rem'; function mk(label,key){ const b=document.createElement('button'); b.className='btn'; b.textContent=`${label} ${rx[key]||0}`; b.addEventListener('click',()=>toggleReaction(n.id,key)); return b; } rxRow.appendChild(mk('👍','like')); rxRow.appendChild(mk('👎','dislike')); rxRow.appendChild(mk('❤️','heart')); rxRow.appendChild(mk('🎉','celebrate')); div.appendChild(rxRow); const replyWrap=document.createElement('div'); replyWrap.style.display='none'; replyWrap.style.marginTop='.25rem'; const ta=document.createElement('textarea'); ta.rows=2; ta.placeholder='Reply…'; ta.style.width='100%'; const add=document.createElement('button'); add.className='btn'; add.textContent='Add reply'; add.style.marginTop='.25rem'; replyWrap.appendChild(ta); replyWrap.appendChild(add); div.appendChild(replyWrap); reply.addEventListener('click',()=>{ replyWrap.style.display = replyWrap.style.display==='none'?'block':'none'; }); add.addEventListener('click', async()=>{ const v=(ta.value||'').trim(); if(!v) return; await addComment(uri,v,n.id); ta.value=''; replyWrap.style.display='none'; }); const canDelete = !fb.ready || !fb.auth?.currentUser?.uid || (n.userId && fb.auth.currentUser.uid === n.userId); if(!canDelete){ del.disabled = true; del.title = 'You can only delete your own comments.'; } del.addEventListener('click', async()=>{ if(!canDelete) return; await softDelete(n.id, uri); }); commentsListEl.appendChild(div); n.children.forEach(ch=>renderNode(ch, d+1)); }; roots.forEach(r=>renderNode(r,0)); }
    async function addComment(targetId, text, parentId=null){ const { ready, db, fsModule, auth } = await initFirebaseClient(); if(!ready||!auth?.currentUser?.uid){ const arr=localNodesMap[targetId]||(localNodesMap[targetId]=[]); arr.push({ id:Date.now().toString(36), text:text.trim(), ts:Date.now(), parentId, deleted:false }); saveLocal(localNodesMap); renderTree(arr); return; } const { collection, addDoc, serverTimestamp }=fsModule; await addDoc(collection(db,'ontology_comments'),{ targetType:'node', targetId, text:text.trim(), userId:auth.currentUser.uid, createdAt:serverTimestamp(), parentId:parentId||null, deleted:false }); }
  async function bumpMeta(targetId, delta){ const { ready, db, fsModule }=await initFirebaseClient(); if(!ready) return; const { doc, setDoc, increment, serverTimestamp } = fsModule; try { const id=safeId(targetId); const ref=doc(db,'ontology_comments_meta', id); await setDoc(ref, { targetId, count: increment(delta), updatedAt: serverTimestamp() }, { merge: true }); } catch(e){ console.warn('[Entity] meta update failed', e); } }
  async function addComment(targetId, text, parentId=null){ const { ready, db, fsModule, auth } = await initFirebaseClient(); if(!ready||!auth?.currentUser?.uid){ const arr=localNodesMap[targetId]||(localNodesMap[targetId]=[]); arr.push({ id:Date.now().toString(36), text:text.trim(), ts:Date.now(), parentId, deleted:false }); saveLocal(localNodesMap); renderTree(arr); return; } const { collection, addDoc, serverTimestamp }=fsModule; await addDoc(collection(db,'ontology_comments'),{ targetType:'node', targetId, text:text.trim(), userId:auth.currentUser.uid, createdAt:serverTimestamp(), parentId:parentId||null, deleted:false }); await bumpMeta(targetId, +1); }
  async function softDelete(commentId, targetId){ const { ready, db, fsModule } = await initFirebaseClient(); if(!ready) return; const { doc, updateDoc, getDoc } = fsModule; try { const cref=doc(db,'ontology_comments',commentId); const snap=await getDoc(cref); const wasDeleted = snap.exists() ? Boolean(snap.data()?.deleted) : false; if(wasDeleted) return; await updateDoc(cref, { deleted:true }); if(targetId) await bumpMeta(targetId, -1); } catch(e){ console.warn('[Entity] soft delete failed', e); } }
    async function toggleReaction(commentId,type){ const { ready, db, fsModule, auth }=await initFirebaseClient(); if(!ready||!auth?.currentUser?.uid) return; const { doc, getDoc, setDoc, deleteDoc }=fsModule; const uid=auth.currentUser.uid; const ref=doc(db,'ontology_comments',commentId,'reactions',uid); const snap=await getDoc(ref); if(snap.exists() && snap.data()?.type===type){ await deleteDoc(ref);} else { await setDoc(ref,{ type }); } }
    async function subscribeComments(targetId){ const { ready, db, fsModule }=await initFirebaseClient(); if(!ready){ const arr=localNodesMap[targetId]||[]; latest=arr; renderTree(arr); return; } const { collection, query, where, orderBy, onSnapshot }=fsModule; if(commentsUnsub){ try{commentsUnsub();}catch{} commentsUnsub=null; } clearReactions(); const q=query(collection(db,'ontology_comments'), where('targetType','==','node'), where('targetId','==',targetId), orderBy('createdAt','asc')); commentsUnsub=onSnapshot(q,(snap)=>{ const items=[]; snap.forEach(doc=>{ const d=doc.data(); items.push({ id:doc.id, text:d.text, ts:d.createdAt?.toMillis?d.createdAt.toMillis():Date.now(), userId:d.userId||null, parentId:d.parentId||null, deleted:Boolean(d.deleted) }); }); latest=items; items.forEach(c=>{ if(!reactionUnsubs.has(c.id)) startReactionsStream(c.id); }); renderTree(items); }, (e)=>{ console.warn('[Entity] comment stream error', e); }); }

  const ent = entities[uri];
  if (!ent) {
    t.textContent = uri || 'Unknown';
    desc.textContent = 'Entity not found in index.';
    return;
  }

  t.textContent = ent.label || uri;
  // Add a live comment count badge next to the title when Firebase is available
  const countBadge = document.createElement('span');
  countBadge.className = 'pill';
  countBadge.style.marginLeft = '.5rem';
  countBadge.textContent = '';
  t.insertAdjacentElement('beforeend', countBadge);
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
  // Subscribe to meta count for this entity (if cloud available)
  if (fb.ready) {
    try {
      const { doc, onSnapshot } = fb.fsModule;
      const ref = doc(fb.db, 'ontology_comments_meta', safeId(uri));
      onSnapshot(ref, (snap) => {
        const c = snap.exists() ? (snap.data()?.count || 0) : 0;
        countBadge.textContent = c > 0 ? `comments: ${c}` : '';
      }, () => { countBadge.textContent = ''; });
    } catch { /* ignore */ }
  }
  subscribeComments(uri);
  addCommentBtn.addEventListener('click', async () => { const txt=(commentInputEl.value||'').trim(); if(!txt) return; await addComment(uri, txt, null); commentInputEl.value=''; });

  // External links
  const webvowl = document.getElementById('webvowlLink');
  // Serverless mode: load pre-converted VOWL JSON instead of trying remote conversion
  webvowl.href = '../webvowl/app/index.html#url=../bsc.json';
  const pylode = document.getElementById('pylodeLink');
  pylode.href = '../pylode/';
}

document.addEventListener('DOMContentLoaded', main);
