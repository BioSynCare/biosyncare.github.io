async function loadJSON(path) {
  const res = await fetch(path);
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

function styleSheet(edgeLabels = true, nodeFont = 12, edgeFont = 10, textBg = 'rgba(255,255,255,0.85)', textOutline = 1) {
  return [
    { selector: 'node', style: { 'label': 'data(label)', 'font-size': nodeFont, 'text-valign': 'center', 'text-halign': 'center', 'background-color': 'data(color)', 'color': '#111', 'text-background-color': textBg, 'text-background-opacity': 1, 'text-background-shape': 'roundrectangle', 'text-border-width': 0, 'text-margin-y': -2, 'text-outline-color': '#fff', 'text-outline-width': textOutline } },
    { selector: 'node[type = "Concept"]', style: { 'background-color': '#2563eb' } },
    { selector: 'node[type = "Property"]', style: { 'background-color': '#7c3aed' } },
    { selector: 'node[type = "Datatype"]', style: { 'background-color': '#16a34a' } },
    { selector: 'edge', style: { 'width': 1.2, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'label': edgeLabels ? 'data(label)' : '', 'font-size': edgeFont, 'text-rotation': 'autorotate', 'color': '#666', 'text-background-color': textBg, 'text-background-opacity': 1, 'text-background-shape': 'roundrectangle' } },
    { selector: 'edge[kind = "subclass"]', style: { 'line-style': 'dashed', 'line-color': '#888', 'target-arrow-color': '#888' } },
    { selector: 'edge[kind = "objectProperty"]', style: { 'line-color': '#ea580c', 'target-arrow-color': '#ea580c' } },
    { selector: 'edge[kind = "datatypeProperty"]', style: { 'line-color': '#16a34a', 'target-arrow-color': '#16a34a' } },
    { selector: 'edge[kind = "skosBroader"]', style: { 'line-color': '#2563eb', 'target-arrow-color': '#2563eb' } },
    { selector: 'edge[kind = "skosNarrower"]', style: { 'line-color': '#60a5fa', 'target-arrow-color': '#60a5fa' } },
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

  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements: toElements(nodes.filter(nsAllowed), edges.filter(e => {
      const sOk = nsAllowed(idNode.get(e.source) || {ns:''});
      const tOk = nsAllowed(idNode.get(e.target) || {ns:''});
      return sOk && tOk;
    }), toggles, colorForNs),
    style: styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1),
    layout: { name: 'cose', animate: false, fit: true, padding: 20 },
    wheelSensitivity: 0.2,
  });

  function currentVisibleGraph() {
    let nodeList = nodes.filter(nsAllowed);
    const nodeIds = new Set(nodeList.map(n => n.id));
    let edgeList = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target) && edgeVisible(e.kind, toggles));
    // Apply focus restriction if present
    if (focusSet && focusSet.size > 0) {
      nodeList = nodeList.filter(n => focusSet.has(n.id));
      const focusedIds = new Set(nodeList.map(n => n.id));
      edgeList = edgeList.filter(e => focusedIds.has(e.source) && focusedIds.has(e.target));
    }
    return { nodeList, edgeList };
  }

  function refresh(relayout = true) {
    const { nodeList, edgeList } = currentVisibleGraph();
    cy.json({ elements: toElements(nodeList, edgeList, toggles, colorForNs) });
    if (relayout) cy.layout({ name: 'cose', animate: false, fit: false }).run();
    renderIsolated(nodeList, edgeList);
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

  cy.on('select', 'node', (ev) => showInfo(ev.target.id()));
  cy.on('tap', 'node', (ev) => showInfo(ev.target.id()));

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
    cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1));
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
    cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1));
  });
  edgeFontInput.addEventListener('input', () => {
    edgeFont = Number(edgeFontInput.value);
    cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1));
  });
  toggleEdgeLabels.addEventListener('change', () => {
    showEdgeLabels = toggleEdgeLabels.checked;
    cy.style(styleSheet(showEdgeLabels, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1));
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
    cy.style(styleSheet(show, nodeFont, edgeFont, theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)', theme === 'dark' ? 0 : 1));
  });

  // Isolated nodes list
  const isolatedList = document.getElementById('isolatedList');
  function renderIsolated(nodeList, edgeList) {
    const deg = new Map(nodeList.map(n => [n.id, 0]));
    for (const e of edgeList) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
    }
    const isolated = nodeList.filter(n => (deg.get(n.id) || 0) === 0);
    isolatedList.innerHTML = '';
    for (const n of isolated) {
      const row = document.createElement('div');
      row.className = 'isolated-item';
      const a = document.createElement('a');
      a.href = '#'; a.textContent = n.label || n.id;
      a.title = n.id;
      a.addEventListener('click', (ev) => { ev.preventDefault(); cy.$id(n.id).select(); cy.center(cy.$id(n.id)); });
      const btn = document.createElement('button');
      btn.textContent = 'Focus';
      btn.addEventListener('click', () => { focusSet = new Set([n.id]); refresh(false); cy.center(cy.$id(n.id)); });
      row.appendChild(a);
      row.appendChild(btn);
      isolatedList.appendChild(row);
    }
  }
  // initial isolated render
  refresh(false);
}

document.addEventListener('DOMContentLoaded', main);
