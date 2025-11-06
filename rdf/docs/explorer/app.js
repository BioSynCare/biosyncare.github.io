const VERSION = '20251106-3';

// Minimal Firebase ESM client for shared comments (falls back to LocalStorage if unavailable)
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
    if (!auth.currentUser) {
      try { await authMod.signInAnonymously(auth); } catch (e) { console.warn('[Explorer] Anonymous auth failed', e); }
    }
    fb = { app, db, auth, authModule: authMod, fsModule: fsMod, ready: true };
  } catch (e) {
    console.warn('[Explorer] Firebase unavailable, falling back to local comments.', e);
    fb.ready = false;
  }
  return fb;
}

async function loadJSON(path) {
  const url = path + (path.includes('?') ? '&' : '?') + 'v=' + VERSION;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

function edgeVisible(kind, toggles) {
  return (
    (kind === 'subclass' && toggles.subclass) ||
    (kind === 'objectProperty' && toggles.objectProperty) ||
    (kind === 'datatypeProperty' && toggles.datatypeProperty) ||
    (kind === 'skosBroader' && toggles.skosBroader) ||
    (kind === 'skosNarrower' && toggles.skosNarrower)
  );
}

function toElements(nodes, edges, toggles, colorForNs) {
  const elements = [];
  for (const n of nodes) {
    elements.push({ data: { id: n.id, label: n.label, type: n.type, color: colorForNs ? colorForNs(n) : '#111' } });
  }
  for (const e of edges) {
    if (!edgeVisible(e.kind, toggles)) continue;
    elements.push({ data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind } });
  }
  return elements;
}

function styleSheet(edgeLabels = true, nodeFont = 12, edgeFont = 10, textBg = 'rgba(255,255,255,0.85)', textOutline = 1, emphasizeSubclass = false) {
  return [
    { selector: 'node', style: { 'label': 'data(label)', 'font-size': nodeFont, 'text-valign': 'center', 'text-halign': 'center', 'background-color': 'data(color)', 'color': '#111', 'text-background-color': textBg, 'text-background-opacity': 1, 'text-background-shape': 'roundrectangle', 'text-border-width': 0, 'text-margin-y': -2, 'text-outline-color': '#fff', 'text-outline-width': textOutline } },
    { selector: 'node[type = "Concept"]', style: { 'background-color': '#2563eb' } },
    { selector: 'node[type = "Property"]', style: { 'background-color': '#7c3aed' } },
    { selector: 'node[type = "Datatype"]', style: { 'background-color': '#16a34a' } },
    { selector: 'node.commented', style: { 'border-width': 4, 'border-color': '#ef4444' } },
  { selector: 'edge', style: { 'width': 1.2, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'source-arrow-color': '#bbb', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'source-arrow-shape': 'circle', 'arrow-scale': 0.7, 'label': edgeLabels ? 'data(label)' : '', 'font-size': edgeFont, 'text-rotation': 'autorotate', 'color': '#666', 'text-background-color': textBg, 'text-background-opacity': 1, 'text-background-shape': 'roundrectangle' } },
  { selector: 'edge[kind = "subclass"]', style: { 'width': 2, 'line-style': 'dashed', 'line-color': '#4b5563', 'target-arrow-color': '#4b5563', 'source-arrow-color': '#4b5563', 'curve-style': 'straight', 'opacity': emphasizeSubclass ? 1 : 1 } },
  { selector: 'edge[kind = "objectProperty"]', style: { 'line-color': '#ea580c', 'target-arrow-color': '#ea580c', 'source-arrow-color': '#ea580c', 'opacity': emphasizeSubclass ? 0.4 : 1 } },
  { selector: 'edge[kind = "datatypeProperty"]', style: { 'line-color': '#16a34a', 'target-arrow-color': '#16a34a', 'source-arrow-color': '#16a34a', 'opacity': emphasizeSubclass ? 0.4 : 1 } },
  { selector: 'edge[kind = "skosBroader"]', style: { 'line-color': '#2563eb', 'target-arrow-color': '#2563eb', 'source-arrow-color': '#2563eb', 'opacity': emphasizeSubclass ? 0.8 : 1 } },
  { selector: 'edge[kind = "skosNarrower"]', style: { 'line-color': '#60a5fa', 'target-arrow-color': '#60a5fa', 'source-arrow-color': '#60a5fa', 'opacity': emphasizeSubclass ? 0.8 : 1 } },
    { selector: ':selected', style: { 'border-color': '#111', 'border-width': 2 } }
  ];
}

async function main() {
  const base = './data/';
  const [nodes, edges, entities] = await Promise.all([
    loadJSON(base + 'nodes.json'),
    loadJSON(base + 'edges.json'),
    loadJSON(base + 'entities.json'),
  ]);

  const toggles = {
    subclass: true,
    objectProperty: true,
    datatypeProperty: true,
    skosBroader: true,
    skosNarrower: true,
  };

  // Namespace filter state (prefix strings or raw ns strings)
  const namespaces = new Map();
  for (const n of nodes) {
    const key = n.prefix || n.ns || '';
    if (!namespaces.has(key)) namespaces.set(key, { key, label: n.prefix ? n.prefix + ':' : (n.ns || '(none)'), selected: true });
  }

  // Persist selection in localStorage
  const STORAGE_KEY = 'bsc-explorer-ns-selected';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } })();
  const selectedNamespaces = new Set(Array.isArray(saved) ? saved : Array.from(namespaces.keys()));

  function nsAllowed(node) {
    const key = node.prefix || node.ns || '';
    return selectedNamespaces.has(key);
  }

  // Build a namespace palette
  const basePalette = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'];
  const nsKeys = Array.from(namespaces.keys());
  const nsColor = new Map();
  nsKeys.forEach((k, i) => {
    if (i < basePalette.length) nsColor.set(k, basePalette[i]);
    else {
      // Generate additional distinct hues
      const hue = (i * 37) % 360; // simple spread
      nsColor.set(k, `hsl(${hue} 70% 40%)`);
    }
  });
  function colorForNs(node) {
    const key = node.prefix || node.ns || '';
    return nsColor.get(key) || '#111';
  }

  // Precompute id->node for faster filtering
  const idNode = new Map(nodes.map(n => [n.id, n]));

  // UI state
  let nodeFont = 12;
  let edgeFont = 10;
  let showEdgeLabels = true;
  let theme = 'light';
  let focusSet = null; // Set of node ids to keep when focused
  let emphasizeSubclass = false;

  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements: toElements(nodes.filter(nsAllowed), edges.filter(e => {
      const sOk = nsAllowed(idNode.get(e.source) || {ns:''});
      const tOk = nsAllowed(idNode.get(e.target) || {ns:''});
      return sOk && tOk;
    }), toggles, colorForNs),
  style: styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass),
    layout: { name: 'cose', animate: false, fit: true, padding: 20 },
    wheelSensitivity: 0.2,
  });

  function currentVisibleGraph() {
    // Start from namespace-allowed nodes
    let preNodes = nodes.filter(nsAllowed);
    const preIds = new Set(preNodes.map(n => n.id));
    // Keep only edges between allowed nodes and visible kinds
    let edgeList = edges.filter(e => preIds.has(e.source) && preIds.has(e.target) && edgeVisible(e.kind, toggles));
    // Apply focus restriction if present (only restrict edges/nodes used for degree calc/render)
    if (focusSet && focusSet.size > 0) {
      preNodes = preNodes.filter(n => focusSet.has(n.id));
      const focusedIds = new Set(preNodes.map(n => n.id));
      edgeList = edgeList.filter(e => focusedIds.has(e.source) && focusedIds.has(e.target));
    }
    // Compute degrees in the current edge set
    const deg = new Map(preNodes.map(n => [n.id, 0]));
    for (const e of edgeList) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
    }
    // Determine isolated nodes BEFORE pruning, to display in sidebar
    const isolated = preNodes.filter(n => (deg.get(n.id) || 0) === 0);
    // Prune isolated nodes from the graph drawing (always omit isolated)
    const nodeList = preNodes.filter(n => (deg.get(n.id) || 0) > 0);
    return { nodeList, edgeList, isolated };
  }

  function refresh(relayout = true) {
    const { nodeList, edgeList, isolated } = currentVisibleGraph();
    cy.json({ elements: toElements(nodeList, edgeList, toggles, colorForNs) });
    if (relayout) cy.layout({ name: 'cose', animate: false, fit: false }).run();
    renderIsolated(isolated);
    updateCommentHighlights();
  }

  for (const [id, key] of [
    ['toggleSubclass', 'subclass'],
    ['toggleObjProp', 'objectProperty'],
    ['toggleDataProp', 'datatypeProperty'],
    ['toggleSkosBroader', 'skosBroader'],
    ['toggleSkosNarrower', 'skosNarrower'],
  ]) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => { toggles[key] = el.checked; refresh(); });
  }

  const info = document.getElementById('info');
  const infoEl = document.getElementById('infoContent');
  // Comments UI
  const commentsListEl = document.getElementById('commentsList');
  const commentInputEl = document.getElementById('commentInput');
  const addCommentBtn = document.getElementById('addComment');
  const COMMENTS_KEY = 'bsc-explorer-comments';
  function loadLocalStore() { try { const s = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); return { nodes: s.nodes || {}, edges: s.edges || {} }; } catch { return { nodes: {}, edges: {} }; } }
  function saveLocalStore(store) { localStorage.setItem(COMMENTS_KEY, JSON.stringify(store)); }
  let localStore = loadLocalStore();
  let currentSelection = null; // { type: 'node'|'edge', id: string }

  // Meta-highlight of commented nodes
  let commentedTargets = new Set();
  function updateCommentHighlights() {
    cy.nodes().forEach((n) => {
      if (commentedTargets.has(n.id())) n.addClass('commented'); else n.removeClass('commented');
    });
  }

  async function fetchMetaAndHighlight() {
    const { ready, db, fsModule } = await initFirebaseClient();
    if (!ready) return;
    try {
      const { collection, getDocs } = fsModule;
      const snap = await getDocs(collection(db, 'ontology_comments_meta'));
      const next = new Set();
      snap.forEach((doc) => { const d = doc.data(); if ((d?.count || 0) > 0) next.add(doc.id); });
      commentedTargets = next;
      updateCommentHighlights();
    } catch (e) { console.warn('[Explorer] Failed to fetch comment meta', e); }
  }

  async function getCommentsFor(sel) {
    if (!sel) return [];
    const { ready, db, fsModule } = await initFirebaseClient();
    if (!ready) {
      const bucket = sel.type === 'edge' ? localStore.edges : localStore.nodes;
      return bucket[sel.id] || [];
    }
    const { collection, query, where, getDocs } = fsModule;
    const q = query(
      collection(db, 'ontology_comments'),
      where('targetType', '==', sel.type),
      where('targetId', '==', sel.id)
    );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((doc) => {
      const d = doc.data();
      items.push({ id: doc.id, text: d.text, ts: d.createdAt?.toMillis ? d.createdAt.toMillis() : d.createdAt || Date.now(), userId: d.userId || null });
    });
    items.sort((a,b) => b.ts - a.ts);
    return items;
  }

  async function addComment(sel, text) {
    if (!sel) return;
    const { ready, db, fsModule, auth } = await initFirebaseClient();
    if (!ready) {
      const bucket = sel.type === 'edge' ? localStore.edges : localStore.nodes;
      const arr = bucket[sel.id] || (bucket[sel.id] = []);
      arr.push({ id: Date.now().toString(36), text: text.trim(), ts: Date.now() });
      saveLocalStore(localStore);
      return;
    }
    const { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, updateDoc } = fsModule;
    const userId = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    await addDoc(collection(db, 'ontology_comments'), {
      targetType: sel.type,
      targetId: sel.id,
      text: text.trim(),
      userId,
      createdAt: serverTimestamp(),
    });
    // increment meta count
    const metaRef = doc(db, 'ontology_comments_meta', sel.id);
    const ms = await getDoc(metaRef);
    if (!ms.exists()) await setDoc(metaRef, { count: 1 });
    else await updateDoc(metaRef, { count: (ms.data().count || 0) + 1 });
    await fetchMetaAndHighlight();
  }

  async function deleteComment(sel, cid) {
    if (!sel) return;
    const { ready, db, fsModule } = await initFirebaseClient();
    if (!ready) {
      const bucket = sel.type === 'edge' ? localStore.edges : localStore.nodes;
      const arr = bucket[sel.id] || [];
      const idx = arr.findIndex(c => c.id === cid);
      if (idx >= 0) { arr.splice(idx, 1); saveLocalStore(localStore); }
      return;
    }
    const { doc, deleteDoc, getDoc, updateDoc } = fsModule;
    try { await deleteDoc(doc(db, 'ontology_comments', cid)); } catch (e) { console.warn('Delete failed', e); }
    const metaRef = doc(db, 'ontology_comments_meta', sel.id);
    const ms = await getDoc(metaRef);
    if (ms.exists()) {
      const next = Math.max(0, (ms.data().count || 0) - 1);
      if (next === 0) { try { await deleteDoc(metaRef); } catch {} }
      else { await updateDoc(metaRef, { count: next }); }
    }
    await fetchMetaAndHighlight();
  }

  async function renderComments() {
    const items = await getCommentsFor(currentSelection);
    commentsListEl.innerHTML = '';
    for (const c of items) {
      const div = document.createElement('div');
      div.className = 'comment-item';
      const meta = document.createElement('div');
      meta.className = 'comment-meta';
      const date = new Date(c.ts).toLocaleString();
      const left = document.createElement('span'); left.textContent = date;
      const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Delete';
      del.addEventListener('click', async () => { await deleteComment(currentSelection, c.id); await renderComments(); });
      meta.appendChild(left); meta.appendChild(del);
      const text = document.createElement('div'); text.textContent = c.text;
      div.appendChild(meta); div.appendChild(text);
      commentsListEl.appendChild(div);
    }
  }
  addCommentBtn.addEventListener('click', async () => {
    const text = (commentInputEl.value || '').trim();
    if (!text) return;
    await addComment(currentSelection, text);
    commentInputEl.value = '';
    await renderComments();
  });
  function showInfo(nodeId) {
    const ent = entities[nodeId];
    if (!ent) { infoEl.innerHTML = '<p class="muted">No info.</p>'; return; }
    const link = `./entity.html?uri=${encodeURIComponent(nodeId)}`;
    infoEl.innerHTML = `
      <h2>${ent.label || nodeId}</h2>
      <div class="muted">${ent.type || ''}</div>
      <p>${ent.description || ent.comment || ''}</p>
      <p>
        <span class="pill">in: ${Object.values(ent.in || {}).reduce((a,b)=>a+b,0)}</span>
        <span class="pill">out: ${Object.values(ent.out || {}).reduce((a,b)=>a+b,0)}</span>
      </p>
      <p><a class="btn" href="${link}">Open entity page</a></p>
    `;
  }

  function showEdgeInfo(edgeId) {
    const e = edges.find(x => x.id === edgeId);
    if (!e) { infoEl.innerHTML = '<p class="muted">No info.</p>'; return; }
    const s = idNode.get(e.source);
    const t = idNode.get(e.target);
    const sl = s?.label || e.source;
    const tl = t?.label || e.target;
    infoEl.innerHTML = `
      <h2>${e.label || e.kind}</h2>
      <div class="muted">${e.kind}</div>
      <p>${sl} → ${tl}</p>
      <p class="muted">IDs: ${e.source} → ${e.target}</p>
    `;
  }

  cy.on('select', 'node', (ev) => { currentSelection = { type: 'node', id: ev.target.id() }; showInfo(ev.target.id()); renderComments(); });
  cy.on('tap', 'node', (ev) => { currentSelection = { type: 'node', id: ev.target.id() }; showInfo(ev.target.id()); renderComments(); });
  cy.on('select', 'edge', (ev) => { currentSelection = { type: 'edge', id: ev.target.id() }; showEdgeInfo(ev.target.id()); renderComments(); });
  cy.on('tap', 'edge', (ev) => { currentSelection = { type: 'edge', id: ev.target.id() }; showEdgeInfo(ev.target.id()); renderComments(); });

  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    cy.elements().removeClass('match');
    if (!q) return;
    cy.nodes().forEach((n) => {
      const label = (n.data('label') || '').toLowerCase();
      const id = (n.id() || '').toLowerCase();
      if (label.includes(q) || id.includes(q)) {
        n.addClass('match');
      }
    });
  });

  cy.style().selector('.match').style({ 'border-width': 4, 'border-color': '#111' }).update();

  // Build namespace pills
  const nsFilters = document.getElementById('nsFilters');
  const nsLegend = document.getElementById('nsLegend');
  function renderNsFilters() {
    nsFilters.innerHTML = '';
    for (const { key, label } of namespaces.values()) {
      const id = 'ns_' + btoa(key).replace(/=/g, '');
      const wrap = document.createElement('label');
      wrap.className = 'ns-pill';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedNamespaces.has(key);
      cb.id = id;
      cb.addEventListener('change', () => {
        if (cb.checked) selectedNamespaces.add(key); else selectedNamespaces.delete(key);
        // persist
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedNamespaces)));
        refresh();
      });
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(cb);
      wrap.appendChild(span);
      nsFilters.appendChild(wrap);
    }
  }
  function renderNsLegend() {
    nsLegend.innerHTML = '';
    for (const { key, label } of namespaces.values()) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.backgroundColor = nsColor.get(key) || '#111';
      const text = document.createElement('span');
      text.textContent = label;
      item.appendChild(dot);
      item.appendChild(text);
      nsLegend.appendChild(item);
    }
  }
  renderNsFilters();
  renderNsLegend();

  // Controls: layout, fonts, theme, edge labels, focus
  const layoutSelect = document.getElementById('layoutSelect');
  const btnApplyLayout = document.getElementById('applyLayout');
  const btnFit = document.getElementById('fitView');
  const btnReset = document.getElementById('resetView');
  const nodeFontInput = document.getElementById('nodeFont');
  const edgeFontInput = document.getElementById('edgeFont');
  const toggleEdgeLabels = document.getElementById('toggleEdgeLabels');
  const themeSelect = document.getElementById('themeSelect');
  const focusKInput = document.getElementById('focusK');
  const btnFocus = document.getElementById('focusSelection');
  const btnClearFocus = document.getElementById('clearFocus');

  function applyTheme(name) {
    theme = name;
    const root = document.documentElement;
    if (name === 'dark') {
      root.style.setProperty('--bg', '#0b0f19');
      root.style.setProperty('--fg', '#e5e7eb');
      root.style.setProperty('--muted', '#9ca3af');
      root.style.setProperty('--border', '#1f2937');
    } else {
      root.style.setProperty('--bg', '#fff');
      root.style.setProperty('--fg', '#111');
      root.style.setProperty('--muted', '#6b7280');
      root.style.setProperty('--border', '#e5e7eb');
    }
  cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  }

  btnApplyLayout.addEventListener('click', () => {
    const name = layoutSelect.value;
    let options = { name, animate: false, fit: false };
    if (name === 'breadthfirst') {
      options = { name: 'breadthfirst', directed: true, grid: false, animate: false, fit: false, spacingFactor: 1.4 };
    } else if (name === 'concentric') {
      options = { name: 'concentric', animate: false, fit: false, minNodeSpacing: 20 };
    } else if (name === 'circle') {
      options = { name: 'circle', animate: false, fit: false };
    } else if (name === 'grid') {
      options = { name: 'grid', animate: false, fit: false };
    }
    cy.layout(options).run();
  });
  btnFit.addEventListener('click', () => cy.fit());
  btnReset.addEventListener('click', () => { focusSet = null; refresh(true); });

  nodeFontInput.addEventListener('input', () => {
    nodeFont = Number(nodeFontInput.value);
  cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  });
  edgeFontInput.addEventListener('input', () => {
    edgeFont = Number(edgeFontInput.value);
  cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  });
  toggleEdgeLabels.addEventListener('change', () => {
    showEdgeLabels = toggleEdgeLabels.checked;
  cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  });
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  applyTheme('light');

  // Focus controls (k-hop)
  function kHopFrom(selectedIds, k, nodeList, edgeList) {
    const adj = new Map();
    for (const e of edgeList) {
      (adj.get(e.source) || adj.set(e.source, new Set()).get(e.source)).add(e.target);
      (adj.get(e.target) || adj.set(e.target, new Set()).get(e.target)).add(e.source);
    }
    let frontier = new Set(selectedIds);
    let visited = new Set(selectedIds);
    for (let i = 0; i < k; i++) {
      const next = new Set(visited);
      for (const v of frontier) {
        const neigh = adj.get(v) || new Set();
        for (const u of neigh) next.add(u);
      }
      frontier = next;
      visited = next;
    }
    return visited;
  }
  btnFocus.addEventListener('click', () => {
    const selIds = cy.nodes(':selected').map(n => n.id());
    const k = Math.max(1, Math.min(3, Number(focusKInput.value) || 1));
    const { nodeList, edgeList } = currentVisibleGraph();
    focusSet = kHopFrom(selIds, k, nodeList, edgeList);
    refresh(false);
  });
  btnClearFocus.addEventListener('click', () => { focusSet = null; refresh(false); });

  // Zoom-based edge label visibility
  cy.on('zoom', () => {
    const z = cy.zoom();
  const show = showEdgeLabels && z >= 0.7;
  cy.style(styleSheet(show, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  // Emphasize subclass toggle
  const emphSubclassInput = document.getElementById('emphSubclass');
  emphSubclassInput.addEventListener('change', () => {
    emphasizeSubclass = emphSubclassInput.checked;
    cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1, emphasizeSubclass));
  });
  });

  // Isolated nodes list
  const isolatedList = document.getElementById('isolatedList');
  function renderIsolated(isolatedNodes) {
    isolatedList.innerHTML = '';
    for (const n of isolatedNodes) {
      const row = document.createElement('div');
      row.className = 'isolated-item';
      const a = document.createElement('a');
      a.href = '#'; a.textContent = n.label || n.id;
      a.title = n.id;
      a.addEventListener('click', (ev) => { ev.preventDefault(); showInfo(n.id); });
      const open = document.createElement('button');
      open.textContent = 'Open';
      open.addEventListener('click', () => { window.location.href = `./entity.html?uri=${encodeURIComponent(n.id)}`; });
      row.appendChild(a);
      row.appendChild(open);
      isolatedList.appendChild(row);
    }
  }
  // initial isolated render
  refresh(false);
  // Initialize Firebase (if available) and fetch comment meta for highlighting
  initFirebaseClient().then(() => fetchMetaAndHighlight());
}

document.addEventListener('DOMContentLoaded', main);
