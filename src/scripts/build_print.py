"""Render the CV (with and without photo) and the portfolio to PDF with headless Chrome.

usage: python3 -I build_print.py <work_dir>
"""
import asyncio
import json
import os
import sys

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter

WORK = sys.argv[1]
sys.path.insert(0, os.path.join(WORK, "scripts"))
OUT = os.path.join(WORK, "out")
PRINT = os.path.join(WORK, "print")
IMG = os.path.join(PRINT, "img")
os.makedirs(OUT, exist_ok=True)

DATA = json.load(open(os.path.join(WORK, "content", "content.json"), encoding="utf-8"))
P = DATA["person"]


def load_site_bits():
    """Reuse the layer list and git-row logic from the site build so all outputs agree."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_site", os.path.join(WORK, "scripts", "build_site.py"))
    mod = importlib.util.module_from_spec(spec)
    argv = sys.argv
    sys.argv = [argv[0], WORK]
    spec.loader.exec_module(mod)
    sys.argv = argv
    return mod


def img(name):
    path = os.path.join(IMG, name)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return "file://" + path


def render(template, out_html, static_fonts=False, **ctx):
    env = Environment(loader=FileSystemLoader(os.path.join(WORK, "print_src")), autoescape=True,
                      undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)
    # The CV uses static font files so they embed as standard (non Type 3) fonts for ATS parsers.
    css = os.path.join(WORK, "fonts", "static", "fonts.css") if static_fonts else os.path.join(WORK, "fonts", "fonts.css")
    html = env.get_template(template).render(fonts_css="file://" + css, img=img, **ctx)
    with open(out_html, "w", encoding="utf-8") as fh:
        fh.write(html)
    return out_html


def stamp(pdf_path, title, subject):
    reader = PdfReader(pdf_path)
    writer = PdfWriter(clone_from=reader)
    writer.add_metadata({
        "/Title": title,
        "/Author": P["name"],
        "/Subject": subject,
        "/Keywords": ", ".join(DATA["keywords"]),
        "/Creator": "Ali Abu-Hatem",
    })
    with open(pdf_path, "wb") as fh:
        writer.write(fh)
    return len(reader.pages)


async def to_pdf(jobs):
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        for html, pdf in jobs:
            page = await browser.new_page()
            await page.goto("file://" + html, wait_until="networkidle")
            await page.evaluate("document.fonts.ready")
            await page.wait_for_timeout(300)
            await page.pdf(path=pdf, print_background=True, prefer_css_page_size=True)
            await page.close()
        await browser.close()


def main():
    global DATA, P
    site = load_site_bits()
    DATA, P = site.DATA, site.P
    projects = DATA["projects"]
    featured = next(p for p in projects if p.get("featured"))
    others = [p for p in projects if not p.get("featured")]
    # page numbers: 1 cover, 2 readme, 3 career, 4 stack, 5 index, 6-7 featured, then one page each
    featured["page"] = 6
    for i, pr in enumerate(others):
        pr["page"] = 8 + i
    total = 8 + len(others)

    cv_ctx = dict(p=P, stats=DATA["stats"], skills=DATA["skills"], experience=DATA["experience"],
                  projects=projects, edu=DATA["education"], languages=DATA["languages"])
    jobs = [
        (render("cv.html.j2", os.path.join(PRINT, "cv.html"), static_fonts=True, photo=img("headshot-square-light.jpg"), **cv_ctx),
         os.path.join(OUT, "Ali-Abu-Hatem-CV.pdf")),
        (render("cv.html.j2", os.path.join(PRINT, "cv-no-photo.html"), static_fonts=True, photo="", **cv_ctx),
         os.path.join(OUT, "Ali-Abu-Hatem-CV-no-photo.pdf")),
        (render("portfolio.html.j2", os.path.join(PRINT, "portfolio.html"), p=P, d=DATA, stats=DATA["stats"],
                featured=featured, others=others, total=total, layers=site.LAYERS,
                gitrows=site.git_rows(DATA["git_log"])),
         os.path.join(OUT, "Ali-Abu-Hatem-Portfolio.pdf")),
    ]
    asyncio.run(to_pdf(jobs))
    n = stamp(jobs[0][1], f"{P['name']} CV, {P['headline']}", "Curriculum vitae")
    print("CV pages:", n)
    n = stamp(jobs[1][1], f"{P['name']} CV, {P['headline']}", "Curriculum vitae (no photo)")
    print("CV no-photo pages:", n)
    n = stamp(jobs[2][1], f"{P['name']} Portfolio", "Portfolio and case studies")
    print("Portfolio pages:", n, "expected", total)
    for _, pdf in jobs:
        print(os.path.basename(pdf), f"{os.path.getsize(pdf) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
