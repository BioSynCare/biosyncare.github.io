#!/usr/bin/env python3
"""
Generate a simple HTML report for RDF/OWL/SKOS content in rdf/:

- OWL/RDFS Classes and subclass relations
- OWL Object and Datatype properties (with domain/range when present)
- SKOS ConceptSchemes and Concepts (with broader/narrower where available)

Output: rdf/docs/summary.html
"""
from pathlib import Path
from rdflib import Graph, RDF, RDFS, OWL, SKOS


REPO_ROOT = Path(__file__).resolve().parents[2]
RDF_DIR = REPO_ROOT / "rdf"
OUT_FILE = RDF_DIR / "docs" / "summary.html"


def link(uri: str) -> str:
    try:
        return f'<a href="{uri}">{uri}</a>'
    except Exception:
        return uri


def get_label(g: Graph, s) -> str:
    for p in (RDFS.label, SKOS.prefLabel):
        o = g.value(s, p)
        if o:
            return str(o)
    return s.n3(g.namespace_manager)


def collect_info(files):
    g = Graph()
    for f in files:
        g.parse(f.as_posix(), format="turtle")

    classes = set(g.subjects(RDF.type, OWL.Class)) | set(g.subjects(RDF.type, RDFS.Class))
    subclasses = []  # (child, parent)
    for c in classes:
        for parent in g.objects(c, RDFS.subClassOf):
            subclasses.append((c, parent))

    obj_props = set(g.subjects(RDF.type, OWL.ObjectProperty))
    dt_props = set(g.subjects(RDF.type, OWL.DatatypeProperty))

    def prop_info(prop):
        domains = list(g.objects(prop, RDFS.domain))
        ranges = list(g.objects(prop, RDFS.range))
        return {
            "uri": prop,
            "label": get_label(g, prop),
            "domains": domains,
            "ranges": ranges,
        }

    obj_props_info = [prop_info(p) for p in sorted(obj_props, key=lambda x: get_label(g, x).lower())]
    dt_props_info = [prop_info(p) for p in sorted(dt_props, key=lambda x: get_label(g, x).lower())]

    # SKOS
    concept_schemes = set(g.subjects(RDF.type, SKOS.ConceptScheme))
    concepts = set(g.subjects(RDF.type, SKOS.Concept))
    broader = []  # (child, parent)
    for c in concepts:
        for parent in g.objects(c, SKOS.broader):
            broader.append((c, parent))

    return {
        "graph": g,
        "classes": classes,
        "subclasses": subclasses,
        "obj_props": obj_props_info,
        "dt_props": dt_props_info,
        "concept_schemes": concept_schemes,
        "concepts": concepts,
        "broader": broader,
    }


def render_html(info):
    g = info["graph"]
    classes = sorted(info["classes"], key=lambda x: get_label(g, x).lower())
    subclasses = info["subclasses"]
    obj_props = info["obj_props"]
    dt_props = info["dt_props"]
    concept_schemes = sorted(info["concept_schemes"], key=lambda x: get_label(g, x).lower())
    concepts = sorted(info["concepts"], key=lambda x: get_label(g, x).lower())
    broader = info["broader"]

    def uri_to_href(u):
        return link(str(u))

    html = []
    html.append("<!doctype html>")
    html.append("<html lang='en'><head><meta charset='utf-8'>")
    html.append("<meta name='viewport' content='width=device-width, initial-scale=1'>")
    html.append("<title>RDF/OWL/SKOS Summary</title>")
    html.append("<style>body{font:16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial;} table{border-collapse:collapse;margin:1rem 0;width:100%;} th,td{border:1px solid #ddd;padding:.5rem;vertical-align:top;} th{background:#f6f8fa;text-align:left;} h2{margin-top:1.5rem;} code{background:#f6f8fa;padding:.1rem .25rem;border-radius:3px;}</style>")
    html.append("</head><body>")
    html.append("<h1>RDF/OWL/SKOS Summary</h1>")
    html.append("<p>This document is auto-generated from the Turtle files under <code>rdf/</code>.</p>")

    # Classes
    html.append("<h2>Classes (OWL/RDFS)</h2>")
    html.append("<table><thead><tr><th>Class</th><th>Label</th><th>SubClassOf</th></tr></thead><tbody>")
    subs_by_child = {}
    for child, parent in subclasses:
        subs_by_child.setdefault(child, []).append(parent)
    for c in classes:
        lbl = get_label(g, c)
        parents = subs_by_child.get(c, [])
        parents_html = "<br/>".join(uri_to_href(p) for p in parents) if parents else "—"
        html.append(f"<tr><td>{uri_to_href(c)}</td><td>{lbl}</td><td>{parents_html}</td></tr>")
    html.append("</tbody></table>")

    # Object properties
    html.append("<h2>Object Properties</h2>")
    html.append("<table><thead><tr><th>Property</th><th>Label</th><th>Domain</th><th>Range</th></tr></thead><tbody>")
    for p in obj_props:
        domains = "<br/>".join(uri_to_href(d) for d in p["domains"]) or "—"
        ranges = "<br/>".join(uri_to_href(r) for r in p["ranges"]) or "—"
        html.append(f"<tr><td>{uri_to_href(p['uri'])}</td><td>{p['label']}</td><td>{domains}</td><td>{ranges}</td></tr>")
    html.append("</tbody></table>")

    # Datatype properties
    html.append("<h2>Datatype Properties</h2>")
    html.append("<table><thead><tr><th>Property</th><th>Label</th><th>Domain</th><th>Range</th></tr></thead><tbody>")
    for p in dt_props:
        domains = "<br/>".join(uri_to_href(d) for d in p["domains"]) or "—"
        ranges = "<br/>".join(uri_to_href(r) for r in p["ranges"]) or "—"
        html.append(f"<tr><td>{uri_to_href(p['uri'])}</td><td>{p['label']}</td><td>{domains}</td><td>{ranges}</td></tr>")
    html.append("</tbody></table>")

    # SKOS
    html.append("<h2>SKOS</h2>")
    if concept_schemes:
        html.append("<h3>Concept Schemes</h3>")
        html.append("<ul>")
        for cs in concept_schemes:
            html.append(f"<li>{uri_to_href(cs)} — {get_label(g, cs)}</li>")
        html.append("</ul>")

    html.append("<h3>Concepts</h3>")
    html.append("<table><thead><tr><th>Concept</th><th>Label</th><th>Broader</th></tr></thead><tbody>")
    broader_by_child = {}
    for child, parent in broader:
        broader_by_child.setdefault(child, []).append(parent)
    for c in concepts:
        lbl = get_label(g, c)
        parents = broader_by_child.get(c, [])
        parents_html = "<br/>".join(uri_to_href(p) for p in parents) if parents else "—"
        html.append(f"<tr><td>{uri_to_href(c)}</td><td>{lbl}</td><td>{parents_html}</td></tr>")
    html.append("</tbody></table>")

    html.append("<p><a href='/rdf/'>Return to RDF index</a></p>")
    html.append("</body></html>")
    return "\n".join(html)


def main():
    ttl_files = sorted(RDF_DIR.rglob("*.ttl"))
    if not ttl_files:
        print("No TTL files found.")
        return 1

    info = collect_info(ttl_files)
    html = render_html(info)
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT_FILE.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
