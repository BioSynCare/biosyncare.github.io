#!/usr/bin/env python3
"""
Export a lightweight graph and entity index from OWL/SKOS TTL files
for a static explorer under rdf/docs/explorer/.

Outputs (JSON):
- rdf/docs/explorer/data/nodes.json
- rdf/docs/explorer/data/edges.json
- rdf/docs/explorer/data/entities.json

Nodes:
  { id, label, type, ns, prefix }
Edges:
  { id, source, target, kind, label }
    kind ∈ { subclass, objectProperty, datatypeProperty, skosBroader, skosNarrower }
Entities index:
  map from URI to metadata and neighbor summaries

Run:
  python3 scripts/rdf/export_explorer_data.py
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

from rdflib import Graph, URIRef, RDF, RDFS, OWL, Namespace, Literal

ROOT = Path(__file__).resolve().parents[2]
RDF_ROOT = ROOT / "rdf"
OUT_DIR = RDF_ROOT / "docs" / "explorer" / "data"

SKOS = Namespace("http://www.w3.org/2004/02/skos/core#")
DCT = Namespace("http://purl.org/dc/terms/")

TTL_FILES = [
    RDF_ROOT / "core" / "bsc-owl.ttl",
    RDF_ROOT / "core" / "bsc-skos.ttl",
    RDF_ROOT / "external" / "sso" / "sso-ontology.ttl",
]


def local_name(uri: URIRef) -> str:
    s = str(uri)
    for sep in ("#", "/"):
        if sep in s:
            s = s.rsplit(sep, 1)[-1]
            break
    return s


def best_label(g: Graph, uri: URIRef) -> str:
    # Prefer rdfs:label, then skos:prefLabel, then dct:title, else local name
    for p in (RDFS.label, SKOS.prefLabel, DCT.title):
        for lit in g.objects(uri, p):
            if isinstance(lit, Literal):
                return str(lit)
    return local_name(uri)


def ns_prefix(uri: URIRef, g: Graph) -> Tuple[str, str]:
    s = str(uri)
    for prefix, ns in g.namespaces():
        ns_str = str(ns)
        if s.startswith(ns_str):
            return ns_str, (prefix or "")
    # Fallback crude namespace
    if "#" in s:
        return s.rsplit("#", 1)[0] + "#", ""
    if "/" in s:
        return s.rsplit("/", 1)[0] + "/", ""
    return "", ""


def build_graph() -> Tuple[List[Dict], List[Dict], Dict[str, Dict]]:
    g = Graph()
    for path in TTL_FILES:
        if path.exists():
            g.parse(path)

    nodes: Dict[str, Dict] = {}
    edges: List[Dict] = []

    def ensure_node(uri: URIRef, ntype: str) -> None:
        sid = str(uri)
        if sid in nodes:
            # Upgrade type priority if needed (Class > Concept > Property > Individual > Datatype)
            return
        ns, prefix = ns_prefix(uri, g)
        nodes[sid] = {
            "id": sid,
            "label": best_label(g, uri),
            "type": ntype,
            "ns": ns,
            "prefix": prefix,
        }

    # Classes and subclass edges
    for c in g.subjects(RDF.type, OWL.Class):
        ensure_node(c, "Class")
        for sup in g.objects(c, RDFS.subClassOf):
            if isinstance(sup, URIRef):
                ensure_node(sup, "Class")
                edges.append({
                    "id": f"subclass:{c}->{sup}",
                    "source": str(c),
                    "target": str(sup),
                    "kind": "subclass",
                    "label": "subClassOf",
                })

    # SKOS concepts and broader/narrower
    for concept in g.subjects(RDF.type, SKOS.Concept):
        ensure_node(concept, "Concept")
        for broader in g.objects(concept, SKOS.broader):
            if isinstance(broader, URIRef):
                ensure_node(broader, "Concept")
                edges.append({
                    "id": f"skosBroader:{concept}->{broader}",
                    "source": str(concept),
                    "target": str(broader),
                    "kind": "skosBroader",
                    "label": "skos:broader",
                })
        for narrower in g.objects(concept, SKOS.narrower):
            if isinstance(narrower, URIRef):
                ensure_node(narrower, "Concept")
                edges.append({
                    "id": f"skosNarrower:{concept}->{narrower}",
                    "source": str(concept),
                    "target": str(narrower),
                    "kind": "skosNarrower",
                    "label": "skos:narrower",
                })

    # Properties: object/datatype and domain->range edges
    for prop in g.subjects(RDF.type, OWL.ObjectProperty):
        ensure_node(prop, "Property")
        domains = list(g.objects(prop, RDFS.domain)) or [None]
        ranges = list(g.objects(prop, RDFS.range)) or [None]
        for d in domains:
            for r in ranges:
                if isinstance(d, URIRef) and isinstance(r, URIRef):
                    ensure_node(d, "Class")
                    ensure_node(r, "Class")
                    edges.append({
                        "id": f"objProp:{prop}:{d}->{r}",
                        "source": str(d),
                        "target": str(r),
                        "kind": "objectProperty",
                        "label": local_name(prop),
                    })

    for prop in g.subjects(RDF.type, OWL.DatatypeProperty):
        ensure_node(prop, "Property")
        for d in g.objects(prop, RDFS.domain):
            if isinstance(d, URIRef):
                ensure_node(d, "Class")
                # Range may be a datatype IRI
                for r in g.objects(prop, RDFS.range):
                    if isinstance(r, URIRef):
                        ensure_node(r, "Datatype")
                        edges.append({
                            "id": f"dataProp:{prop}:{d}->{r}",
                            "source": str(d),
                            "target": str(r),
                            "kind": "datatypeProperty",
                            "label": local_name(prop),
                        })

    # Build entity index with basic metadata and neighbor stats
    neighbor_in: Dict[str, Dict[str, int]] = {}
    neighbor_out: Dict[str, Dict[str, int]] = {}
    for e in edges:
        s = e["source"]
        t = e["target"]
        k = e["kind"]
        neighbor_out.setdefault(s, {}).setdefault(k, 0)
        neighbor_out[s][k] += 1
        neighbor_in.setdefault(t, {}).setdefault(k, 0)
        neighbor_in[t][k] += 1

    entities: Dict[str, Dict] = {}
    for sid, node in nodes.items():
        uri = URIRef(sid)
        meta = {
            "uri": sid,
            "label": node["label"],
            "type": node["type"],
            "ns": node["ns"],
            "prefix": node["prefix"],
            "comment": next((str(o) for o in g.objects(uri, RDFS.comment)), None),
            "description": next((str(o) for o in g.objects(uri, DCT.description)), None),
            "in": neighbor_in.get(sid, {}),
            "out": neighbor_out.get(sid, {}),
        }
        entities[sid] = meta

    return list(nodes.values()), edges, entities


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    nodes, edges, entities = build_graph()
    (OUT_DIR / "nodes.json").write_text(json.dumps(nodes, indent=2), encoding="utf-8")
    (OUT_DIR / "edges.json").write_text(json.dumps(edges, indent=2), encoding="utf-8")
    (OUT_DIR / "entities.json").write_text(json.dumps(entities, indent=2), encoding="utf-8")
    print(f"[OK] Wrote explorer data under {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
