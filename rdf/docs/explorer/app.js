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

function toElements(nodes, edges, toggles) {
  const elements = [];
  for (const n of nodes) {
    elements.push({ data: { id: n.id, label: n.label, type: n.type } });
  }
  for (const e of edges) {
    if (!edgeVisible(e.kind, toggles)) continue;
    elements.push({ data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind } });
  }
  return elements;
}

function styleSheet() {
  return [
    { selector: 'node', style: { 'label': 'data(label)', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#111', 'color': '#fff' } },
    { selector: 'node[type = "Concept"]', style: { 'background-color': '#2563eb' } },
    { selector: 'node[type = "Property"]', style: { 'background-color': '#7c3aed' } },
    { selector: 'node[type = "Datatype"]', style: { 'background-color': '#16a34a' } },
    { selector: 'edge', style: { 'width': 1.2, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'label': 'data(label)', 'font-size': 9, 'text-rotation': 'autorotate', 'color': '#666' } },
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

  const selectedNamespaces = new Set(Array.from(namespaces.keys()));

  function nsAllowed(node) {
    const key = node.prefix || node.ns || '';
    return selectedNamespaces.has(key);
  }

  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements: toElements(nodes.filter(nsAllowed), edges.filter(e => {
      const sOk = nsAllowed(nodes.find(n => n.id === e.source) || {ns:''});
      const tOk = nsAllowed(nodes.find(n => n.id === e.target) || {ns:''});
      return sOk && tOk;
    }), toggles),
    style: styleSheet(),
    layout: { name: 'cose', animate: false, fit: true, padding: 20 },
    wheelSensitivity: 0.2,
  });

  function refresh() {
    const nodeList = nodes.filter(nsAllowed);
    const nodeIds = new Set(nodeList.map(n => n.id));
    const edgeList = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    cy.json({ elements: toElements(nodeList, edgeList, toggles) });
    cy.layout({ name: 'cose', animate: false, fit: false }).run();
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
  function showInfo(nodeId) {
    const ent = entities[nodeId];
    if (!ent) { info.innerHTML = '<p class="muted">No info.</p>'; return; }
    const link = `./entity.html?uri=${encodeURIComponent(nodeId)}`;
    info.innerHTML = `
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
        refresh();
      });
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(cb);
      wrap.appendChild(span);
      nsFilters.appendChild(wrap);
    }
  }
  renderNsFilters();
}

document.addEventListener('DOMContentLoaded', main);
