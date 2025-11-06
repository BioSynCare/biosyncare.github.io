const VERSION = '20251106-2';
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
  function loadCommentsStore() { try { const s = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); return { nodes: s.nodes || {}, edges: s.edges || {} }; } catch { return { nodes: {}, edges: {} }; } }
  function saveCommentsStore() { localStorage.setItem(COMMENTS_KEY, JSON.stringify(commentsStore)); }
  let commentsStore = loadCommentsStore();
  function getNodeComments(id) { return commentsStore.nodes[id] || []; }
  function addNodeComment(id, text) { const arr = commentsStore.nodes[id] || (commentsStore.nodes[id] = []); arr.push({ id: Date.now().toString(36), text: text.trim(), ts: Date.now() }); saveCommentsStore(); }
  function deleteNodeComment(id, cid) { const arr = commentsStore.nodes[id] || []; const i = arr.findIndex(c => c.id === cid); if (i>=0) { arr.splice(i,1); saveCommentsStore(); } }
  function renderComments(id) { const items = getNodeComments(id); commentsListEl.innerHTML = ''; for (const c of items) { const div = document.createElement('div'); div.className='comment-item'; const meta=document.createElement('div'); meta.className='comment-meta'; const date=new Date(c.ts).toLocaleString(); const left=document.createElement('span'); left.textContent=date; const del=document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.addEventListener('click', ()=>{ deleteNodeComment(id, c.id); renderComments(id); }); meta.appendChild(left); meta.appendChild(del); const text=document.createElement('div'); text.textContent=c.text; div.appendChild(meta); div.appendChild(text); commentsListEl.appendChild(div);} }

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
  renderComments(uri);
  addCommentBtn.addEventListener('click', () => { const txt=(commentInputEl.value||'').trim(); if (!txt) return; addNodeComment(uri, txt); commentInputEl.value=''; renderComments(uri); });

  // External links
  const webvowl = document.getElementById('webvowlLink');
  webvowl.href = '../webvowl/app/index.html#iri=' + encodeURIComponent(uri);
  const pylode = document.getElementById('pylodeLink');
  pylode.href = '../pylode/';
}

document.addEventListener('DOMContentLoaded', main);
