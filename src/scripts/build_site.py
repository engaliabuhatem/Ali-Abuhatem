"""Render the portfolio site from content.json.

Outputs two variants of the same page:
  site/index.html    -> published as the claude.ai artifact (title is a plain name)
  deploy/index.html  -> for self-hosting (SEO title, theme choice remembered)

usage: python3 -I build_site.py <work_dir>
"""
import html
import json
import os
import re
import shutil
import sys

from jinja2 import Environment, FileSystemLoader, StrictUndefined

WORK = sys.argv[1]
SRC = os.path.join(WORK, "site_src")
DATA = json.load(open(os.path.join(WORK, "content", "content.json"), encoding="utf-8"))
P = DATA["person"]
for _p in DATA["projects"]:
    _p.setdefault("url", None)
    _p.setdefault("url_label", None)
    _p.setdefault("featured", False)
    _p.setdefault("spotlight", False)  # also gets a wide row on the site; print keeps one page each
    _p.setdefault("bars", ["hs-investment / home", "hs-investment / admin"])
    for _im in _p["images"]:
        _im.setdefault("phone", False)
BARS = {"tender": "tenderflow / dashboard", "infra": "infra-construction / home", "minutes": "meeting-minutes / dashboard",
        "ggp": "go-green-power / back office", "auction": "auction-admin / dashboard", "consultx": "consultx / home",
        "hs-investment": "localhost:3000"}
for _p in DATA["projects"]:
    _p["bar"] = BARS.get(_p["id"], _p["id"])
for _c in DATA["git_log"]:
    for _k in ("ref", "date", "tag"):
        _c.setdefault(_k, None)

SITE_URL = "https://engaliabuhatem.github.io/Ali-Abuhatem/"

FILES = {
    "cv": "Ali-Abu-Hatem-CV.pdf",
    "cv_ats": "Ali-Abu-Hatem-CV-no-photo.pdf",
    "portfolio": "Ali-Abu-Hatem-Portfolio.pdf",
}

SCENES = [
    {"fn": "network()", "caption": "Where I started: networks and servers for 100+ concurrent users."},
    {"fn": "code()", "caption": "What I write every day: Python, TypeScript and Dart."},
    {"fn": "stack()", "caption": "What I own: interface, API, data and infrastructure."},
    {"fn": "product()", "caption": "What I ship: web platforms and mobile apps that people use daily."},
]

ORBIT = [
    {"t": "Django", "c": "mint"}, {"t": "Next.js", "c": "sky"}, {"t": "Flutter", "c": "lilac"},
    {"t": "PostgreSQL", "c": "amber"}, {"t": "TypeScript", "c": "sky"}, {"t": "Ollama", "c": "coral"},
]
for i, o in enumerate(ORBIT):
    o["a"] = round(i * 360 / len(ORBIT))

LAYERS = [
    {"name": "Interface", "short": "ui", "c": "mint",
     "tech": ["Next.js", "React", "TypeScript", "Tailwind CSS", "Framer Motion", "Flutter"],
     "where": "INFRA, HS Investment, 3 Pillars, Go Green Power, Auction"},
    {"name": "API and business logic", "short": "api", "c": "lilac",
     "tech": ["Python", "Django", "Django REST Framework", "REST design", "RBAC"],
     "where": "Tender Management, HS Investment, ConsultX"},
    {"name": "Data", "short": "data", "c": "amber",
     "tech": ["PostgreSQL", "Cloud Firestore", "Hive offline cache", "Atomic transactions"],
     "where": "Tender Management, Go Green Power, Auction"},
    {"name": "Intelligence", "short": "ai", "c": "coral",
     "tech": ["Ollama (local inference)", "Google Gemini"],
     "where": "AI Meeting Minutes"},
    {"name": "Infrastructure", "short": "infra", "c": "sky",
     "tech": ["Vercel", "Windows Server", "Active Directory", "Networking and security", "Git"],
     "where": "HS Group servers and ERP, INFRA on Vercel"},
]

ABOUT_TS = '''// about.ts
export const ali = {
  role: "Senior Full-Stack Engineer & Technical Lead",
  based: "New Cairo, Egypt",
  experience: "5+ years",
  owns: ["architecture", "backend", "frontend", "mobile", "infra"],
  stack: {
    backend: ["Python", "Django", "DRF", "PostgreSQL"],
    web: ["Next.js", "React", "TypeScript", "Tailwind"],
    mobile: ["Flutter", "Dart", "Riverpod", "BLoC", "Firebase"],
    ai: ["Ollama", "Gemini"],
    infra: ["Vercel", "Windows Server", "Active Directory"],
  },
  shipped: 8,
  languages: ["Arabic", "English"],
  openTo: ["remote", "relocation"],
} as const;'''

TOKEN = re.compile(r'(?P<c>//.*$)|(?P<s>"[^"]*")|(?P<k>\b(?:export|const|as)\b)|(?P<n>\b\d+\b)|(?P<v>\b[A-Za-z_]\w*(?=\s*:))|(?P<p>[{}\[\],:;=])|(?P<w>\s+)|(?P<o>.)')


def highlight(code):
    lines = []
    for line in code.split("\n"):
        out = []
        for m in TOKEN.finditer(line):
            kind = m.lastgroup
            text = html.escape(m.group())
            if kind == "w" or kind == "o":
                out.append(text)
            elif kind == "v" and m.group() == "ali":
                out.append(f'<span class="tok-f">{text}</span>')
            else:
                out.append(f'<span class="tok-{kind}">{text}</span>')
        lines.append('<span class="ln">' + "".join(out) + "</span>")
    return "".join(lines)


def git_rows(log):
    awam_idx = [i for i, c in enumerate(log) if c["branch"] == "awam"]
    tip, fork = min(awam_idx), max(awam_idx)
    rows = []
    last = len(log) - 1
    for i, c in enumerate(log):
        r = dict(c)
        r["l1"] = "from" if i == 0 else ("to" if i == last else "full")
        r["l2"] = None
        if tip <= i <= fork:
            r["l2"] = "from" if i == tip else ("to" if i == fork else "full")
        r["fork"] = i == fork
        r["is_head"] = i == 0
        rows.append(r)
    return rows


def jsonld():
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Person",
        "name": P["name"],
        "url": SITE_URL,
        "image": SITE_URL + "assets/og-card.jpg",
        "jobTitle": P["headline"],
        "email": "mailto:" + P["email"],
        "telephone": P["phone"],
        "address": {"@type": "PostalAddress", "addressLocality": "New Cairo", "addressCountry": "EG"},
        "sameAs": [P["github_url"], P["linkedin_url"]],
        "knowsAbout": DATA["keywords"],
        "alumniOf": DATA["education"]["school"],
        "worksFor": {"@type": "Organization", "name": "HS Group"},
    }, ensure_ascii=False).replace("</", "<\\/")


def site_data(persist_theme):
    keep = ("id", "name", "status", "status_key", "company", "country", "oneliner", "stack", "url")
    return json.dumps({
        "persistTheme": persist_theme,
        "person": P,
        "skills": DATA["skills"],
        "experience": [{k: e[k] for k in ("org", "role", "dates", "place")} for e in DATA["experience"]],
        "education": DATA["education"],
        "languages": DATA["languages"],
        "projects": [{k: p.get(k) for k in keep} for p in DATA["projects"]],
        "scenes": SCENES,
        "files": FILES,
    }, ensure_ascii=False).replace("</", "<\\/")


def render(variant):
    env = Environment(loader=FileSystemLoader(SRC), autoescape=True, undefined=StrictUndefined,
                      trim_blocks=True, lstrip_blocks=True)
    tpl = env.get_template("index.html.j2")
    featured = [p for p in DATA["projects"] if p["featured"] or p["spotlight"]]
    others = [p for p in DATA["projects"] if p not in featured]
    deploy = variant == "deploy"
    return tpl.render(
        page_title=(f"{P['name']} | Senior Full-Stack Engineer" if deploy else "Ali Abu-Hatem Portfolio"),
        og_image=(SITE_URL + "assets/og-card.jpg" if deploy else ""),
        canonical=(SITE_URL if deploy else ""),
        p=P, d=DATA, stats=DATA["stats"], featured=featured, others=others,
        scenes=SCENES, orbit=ORBIT, layers=LAYERS, files=FILES,
        gitrows=git_rows(DATA["git_log"]),
        about_code=highlight(ABOUT_TS),
        keywords=", ".join(DATA["keywords"]),
        jsonld=jsonld(),
        data_json=site_data(persist_theme=deploy),
        css=open(os.path.join(SRC, "site.css"), encoding="utf-8").read(),
        js=open(os.path.join(SRC, "site.js"), encoding="utf-8").read(),
    )


def main():
    for variant, out_dir in (("artifact", "site"), ("deploy", "deploy")):
        out = os.path.join(WORK, out_dir)
        os.makedirs(os.path.join(out, "assets"), exist_ok=True)
        page = render(variant)
        if variant == "deploy":
            page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
                    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
                    "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2311161e'/%3E%3Ctext x='32' y='41' font-family='monospace' font-size='26' font-weight='700' fill='%237dd6bc' text-anchor='middle'%3Eah%3C/text%3E%3C/svg%3E\">\n"
                    + page.replace("<style>", "<style>\n:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}", 1)
                    .replace('<a class="skip"', "</head>\n<body>\n<a class=\"skip\"", 1)
                    + "\n</body>\n</html>\n")
            src_assets = os.path.join(WORK, "site", "assets")
            for f in os.listdir(src_assets):
                shutil.copy2(os.path.join(src_assets, f), os.path.join(out, "assets", f))
        with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(page)
        print(variant, os.path.join(out, "index.html"), f"{len(page) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
