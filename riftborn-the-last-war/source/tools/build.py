"""Build the Riftborn book (PDF and GitHub Markdown) from book.md.

usage: python3 -I build.py BOOK.md OUT_DIR
Needs pandoc and WeasyPrint; book.css and fonts/ sit next to this script.
"""
import html, os, re, subprocess, sys

src, out_dir = sys.argv[1:3]
here = os.path.dirname(os.path.abspath(__file__))
TITLE = "Riftborn: The Last War"
SUB = "The World, the Factions and the Core Rules"
EDITION = "Version 1.0"

PARTS = {
    "Part One: The World": ("Part One", "The World", "The Great Shattering and the Riftborn Universe"),
    "Part Two: The Factions": ("Part Two", "The Factions", "The Powers of the Last War"),
    "Part Three: The Core Rules": ("Part Three", "The Core Rules", "Turns, Movement, Shooting and Melee"),
}


def pandoc(args, data):
    return subprocess.run(["pandoc", *args], input=data, check=True,
                          capture_output=True, text=True).stdout


def rift_svg(cx, cy, h, glow, rings=True):
    """A violet tear in the sky: a jagged lens, a glow and faint rings."""
    pts_l, pts_r = [], []
    steps = 14
    zig = [0.0, .35, .15, .6, .3, .85, .55, 1.0, .7, .9, .45, .6, .25, .3, 0.0]
    for i in range(steps + 1):
        y = cy - h / 2 + h * i / steps
        w = zig[i] * h * 0.05
        off = (h * 0.012) * (1 if i % 2 else -1)
        pts_l.append(f"{cx - w + off:.2f},{y:.2f}")
        pts_r.append(f"{cx + w * 0.8 + off:.2f},{y:.2f}")
    lens = " ".join(pts_l + pts_r[::-1])
    outer = []
    for i in range(steps + 1):
        y = cy - h / 2 + h * i / steps
        w = zig[i] * h * 0.11 + (h * 0.01 if 0 < i < steps else 0)
        outer.append((cx - w, y, cx + w, y))
    outer_pts = " ".join(f"{a:.2f},{b:.2f}" for a, b, _, _ in outer) + " " + \
        " ".join(f"{c:.2f},{d:.2f}" for _, _, c, d in outer[::-1])
    bolts = ""
    for (dx, dy, sx, sy) in [(-1, -.18, -.55, -.32), (1, .05, .6, -.1), (-1, .22, -.5, .38), (1, .3, .42, .48), (1, -.3, .38, -.46)]:
        x0, y0 = cx + dx * h * 0.05, cy + dy * h
        x1, y1 = cx + sx * h * 0.5, cy + sy * h
        mx, my = (x0 + x1) / 2 + dy * h * 0.08, (y0 + y1) / 2 - dx * h * 0.04
        bolts += f'<polyline points="{x0:.1f},{y0:.1f} {mx:.1f},{my:.1f} {x1:.1f},{y1:.1f}" fill="none" stroke="#b794f6" stroke-width="{h*0.003:.2f}" stroke-opacity=".55"/>'
    ring_svg = ""
    if rings:
        for r, op, dash in [(0.42, .22, ""), (0.56, .14, f'stroke-dasharray="{h*0.01:.1f} {h*0.02:.1f}"'), (0.74, .08, "")]:
            ring_svg += f'<circle cx="{cx}" cy="{cy}" r="{h*r:.1f}" fill="none" stroke="#a78bfa" stroke-width="{h*0.003:.2f}" stroke-opacity="{op}" {dash}/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" preserveAspectRatio="none">
<defs>
<radialGradient id="g{cy}" cx="{cx/210:.3f}" cy="{cy/297:.3f}" r="{glow:.3f}" gradientUnits="objectBoundingBox">
<stop offset="0" stop-color="#7c4ddb" stop-opacity=".55"/><stop offset=".45" stop-color="#4c2a96" stop-opacity=".25"/><stop offset="1" stop-color="#120f19" stop-opacity="0"/></radialGradient>
<linearGradient id="l{cy}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".5" stop-color="#f5f0ff"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
</defs>
<rect width="210" height="297" fill="#120f19"/>
<rect width="210" height="297" fill="url(#g{cy})"/>
{ring_svg}{bolts}
<polygon points="{outer_pts}" fill="#8b5cf6" fill-opacity=".28"/>
<polygon points="{lens}" fill="url(#l{cy})"/>
</svg>'''


md = open(src).read()

# ---------- HTML / PDF ----------
body = pandoc(["-f", "markdown", "-t", "html5", "--wrap=none"], md)

toc = []


def part_page(m):
    hid, label = m.group(1), html.unescape(re.sub("<[^>]+>", "", m.group(2)))
    if label in PARTS:
        num, name, tag = PARTS[label]
        toc.append(("part", hid, f"{num}: {name}"))
        return (f'<section class="part">{rift_svg(105, 66, 74, .55)}<div class="inner">'
                f'<p class="num">{num}</p><h1 id="{hid}">{name}</h1><p class="tag">{tag}</p></div></section>')
    # the glossary: a chapter of its own at the back
    toc.append(("part", hid, label))
    return f'<h2 id="{hid}" class="backmatter">{label}</h2>'


body = re.sub(r'<h1 id="([^"]+)">(.*?)</h1>', part_page, body)


def chap(m):
    toc.append(("chap", m.group(1), html.unescape(re.sub("<[^>]+>", "", m.group(3)))))
    return m.group(0)


# collect chapters in document order (parts were collected above; rebuild in order)
toc.clear()
for m in re.finditer(r'<(?:h1|h2) id="([^"]+)"( class="[^"]*")?>(.*?)</h[12]>', body):
    hid, cls, label = m.group(1), m.group(2) or "", html.unescape(re.sub("<[^>]+>", "", m.group(3)))
    if m.group(0).startswith("<h1"):
        num = next(v[0] for v in PARTS.values() if v[1] == label)
        toc.append(("part", hid, f"{num}: {label}"))
    elif "backmatter" in cls:
        toc.append(("part", hid, label))
    else:
        toc.append(("chap", hid, label))

# glossary table and stat-line tables get their own classes
body = re.sub(r'(<h2 id="glossary"[^>]*>.*?</h2>\s*)<table>', r'\1<table class="glossary">', body, flags=re.S)


def stats(m):
    t = m.group(0)
    head = re.search(r"<thead>.*?</thead>", t, re.S)
    if head and head.group(0).count("<th") >= 6:
        return t.replace("<table>", '<table class="stats">', 1)
    return t


body = re.sub(r"<table>.*?</table>", stats, body, flags=re.S)
body += '<p class="end">✦ ✦ ✦</p>'

toc_html = ['<nav class="toc"><h2 class="cont" style="string-set:none">Contents</h2><ol>']
open_part = False
for kind, hid, label in toc:
    if kind == "part":
        if open_part:
            toc_html.append("</ol></li>")
        toc_html.append(f'<li class="part"><a href="#{hid}">{html.escape(label)}</a><ol>')
        open_part = True
    else:
        toc_html.append(f'<li class="chap"><a href="#{hid}">{html.escape(label)}</a></li>')
toc_html.append("</ol></li></ol></nav>")

doc = f'''<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>{TITLE}</title>
<link rel="stylesheet" href="book.css"></head><body>
<section class="cover">{rift_svg(105, 92, 120, .7)}
<div class="titles"><p class="riftborn">RIFTBORN</p><p class="lastwar">THE LAST WAR</p><p class="sub">{SUB}</p></div>
<p class="edition">{EDITION}</p></section>
<div class="front">
<section class="titlepage"><p class="riftborn">RIFTBORN</p><p class="lastwar">THE LAST WAR</p><p class="sub">{SUB}</p>
<p class="quote">Every world we ever knew was a page in the same book. Then someone tore the binding.</p></section>
{"".join(toc_html)}
</div>
{body}
</body></html>'''

os.makedirs(out_dir, exist_ok=True)
html_path = os.path.join(here, "book.html")
open(html_path, "w").write(doc)
from weasyprint import HTML  # noqa: E402
pdf_path = os.path.join(out_dir, "riftborn-the-last-war.pdf")
HTML(html_path, base_url=here).write_pdf(pdf_path)

# ---------- GitHub Markdown ----------
lua = os.path.join(here, "gfm.lua")
gfm = pandoc(["-f", "markdown", "-t", "gfm", "--wrap=none", "--lua-filter", lua], md)

seen = {}


def slug(s):
    s = re.sub(r"[^\w\- ]", "", s.lower()).replace(" ", "-")
    n = seen.get(s, 0)
    seen[s] = n + 1
    return s if n == 0 else f"{s}-{n}"


lines = []
for line in gfm.splitlines():
    m = re.match(r"^(#{1,2}) (.*)$", line)
    if m:
        lines.append((len(m.group(1)), m.group(2), slug(m.group(2))))
    elif re.match(r"^#{3,6} ", line):
        slug(re.sub(r"^#+ ", "", line))
contents = []
for level, label, s in lines:
    contents.append(("" if level == 1 else "   - ") + (f"- [{label}](#{s})" if level == 1 else f"[{label}](#{s})"))

readme = f"""# {TITLE}

*{SUB}*

A tabletop miniatures wargame for two players, played with D6 dice, a tape measure and two armies on a 48" × 48" battlefield. Four hundred years after the Great Shattering broke the walls between realities, every Rift is drifting into one colossal wound in the sky, the Maw, and every army is marching to reach it first.

This book brings together the World Guide, the Faction Guide and Core Rules Part 1.

**[Download the printable PDF](riftborn-the-last-war.pdf)** (A4, {EDITION.lower()}).

## Contents

{chr(10).join(contents)}

---

{gfm}"""
open(os.path.join(out_dir, "README.md"), "w").write(readme)
print("ok", pdf_path)
