async function loadJSON(path) { const r = await fetch(path); if (!r.ok) throw new Error(`Failed ${path}`); return r.json(); }
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

  // External links
  const webvowl = document.getElementById('webvowlLink');
  webvowl.href = '../webvowl/app/index.html#iri=' + encodeURIComponent(uri);
  const pylode = document.getElementById('pylodeLink');
  pylode.href = '../pylode/';
}

document.addEventListener('DOMContentLoaded', main);
