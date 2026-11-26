"""Assemble the three Riftborn .docx files into one book (pandoc Markdown).

usage: python3 -I assemble.py WORLD.docx FACTIONS.docx RULES.docx OUT.md
"""
import json, subprocess, sys, re

world_f, factions_f, rules_f, out_f = sys.argv[1:5]


def ast(path):
    return json.loads(subprocess.run(["pandoc", path, "-t", "json"], check=True,
                                     capture_output=True, text=True).stdout)


def text(inlines):
    out = []
    for i in inlines:
        t = i["t"]
        if t == "Str":
            out.append(i["c"])
        elif t in ("Space", "SoftBreak", "LineBreak"):
            out.append(" ")
        elif t in ("Strong", "Emph", "Underline", "SmallCaps", "Strikeout"):
            out.append(text(i["c"]))
        elif t == "Span":
            out.append(text(i["c"][1]))
        elif t == "Quoted":
            out.append(text(i["c"][1]))
    return "".join(out)


def block_text(b):
    if b["t"] in ("Para", "Plain"):
        return text(b["c"])
    if b["t"] == "Header":
        return text(b["c"][2])
    return ""


def inl(s):
    """Plain string -> pandoc inlines."""
    out = []
    for n, w in enumerate(s.split(" ")):
        if n:
            out.append({"t": "Space"})
        out.append({"t": "Str", "c": w})
    return out


def header(level, s):
    return {"t": "Header", "c": [level, ["", [], []], inl(s)]}


glossary = {}


def table_rows(tbl):
    _, _, _, head, bodies, _ = tbl["c"]
    rows = []
    for body in bodies:
        rows += body[3]
    return rows


def cell_blocks(cell):
    return cell[4]


def transform(doc, renames):
    blocks = doc["blocks"]
    # drop the title block before the first heading
    first = next(i for i, b in enumerate(blocks) if b["t"] == "Header")
    blocks = blocks[first:]
    out = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        t = block_text(b)
        if b["t"] == "Para" and t.startswith("Next:"):
            break  # "Next: Step N" footer
        if b["t"] == "Para" and t.startswith("Coming in Core Rules Part 2"):
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            body = [nxt] if nxt else []
            out.append({"t": "Div", "c": [["", ["callout"], []],
                                         [{"t": "Para", "c": [{"t": "Strong", "c": inl(t)}]}] + body]})
            break
        if b["t"] == "Para" and re.match(r"^Part \d+: ", t) and len(b["c"]) == 1:
            b = header(1, t)  # a heading that was set as bold text
            t = block_text(b)
        if b["t"] == "Header":
            lvl = b["c"][0]
            if "Glossary" in t:
                # collect the glossary table, merged into one at the back
                j = i + 1
                while j < len(blocks) and blocks[j]["t"] != "Header":
                    if blocks[j]["t"] == "Table":
                        for row in table_rows(blocks[j]):
                            cells = row[1]
                            term = block_text(cell_blocks(cells[0])[0])
                            if term == "Term":
                                continue
                            glossary[term] = cells
                    j += 1
                i = j
                continue
            new = renames.get(t, re.sub(r"^Part \d+: ", "", t))
            b = {"t": "Header", "c": [lvl + 1, ["", [], []],
                                      inl(new) if new != t else b["c"][2]]}
        if b["t"] == "Table" and len(b["c"][2]) == 1:
            rows = table_rows(b)
            cb = cell_blocks(rows[0][1][0])
            b = {"t": "Div", "c": [["", ["callout"], []], cb]}
        if b["t"] == "BlockQuote":
            b = {"t": "Div", "c": [["", ["epigraph"], []], [b]]}
        out.append(b)
        i += 1
    return out


world = ast(world_f)
factions = ast(factions_f)
rules = ast(rules_f)

blocks = []
blocks.append(header(1, "Part One: The World"))
blocks += transform(world, {"About This Guide": "Introduction"})
blocks.append(header(1, "Part Two: The Factions"))
blocks += transform(factions, {"About This Guide": "Introduction"})
blocks.append(header(1, "Part Three: The Core Rules"))
blocks += transform(rules, {})

# merged glossary
blocks.append(header(1, "Glossary"))
rows = []
for term in sorted(glossary, key=lambda s: s.lower()):
    rows.append(["", glossary[term]])


def mkcell(blocks_):
    return [["", [], []], {"t": "AlignDefault"}, 1, 1, blocks_]


head_row = [["", [], []], [mkcell([{"t": "Plain", "c": [{"t": "Strong", "c": inl("Term")}]}]),
                            mkcell([{"t": "Plain", "c": [{"t": "Strong", "c": inl("Meaning")}]}])]]
body_rows = [[["", [], []], cells] for _, cells in rows]
blocks.append({"t": "Table", "c": [
    ["", ["glossary"], []],
    [None, []],
    [[{"t": "AlignDefault"}, {"t": "ColWidth", "c": 0.28}],
     [{"t": "AlignDefault"}, {"t": "ColWidth", "c": 0.72}]],
    [["", [], []], [head_row]],
    [[["", [], []], 0, [], body_rows]],
    [["", [], []], []],
]})

doc = {"pandoc-api-version": world["pandoc-api-version"], "meta": {}, "blocks": blocks}
md = subprocess.run(["pandoc", "-f", "json", "-t", "markdown", "--wrap=none"],
                    input=json.dumps(doc), check=True, capture_output=True, text=True).stdout

# Wording that pointed at the separate documents now points inside the book.
replacements = [
    ("This guide sets out the universe of Riftborn: The Last War.",
     "This part sets out the universe of Riftborn: The Last War."),
    ("Where the guide leaves something unexplained",
     "Where it leaves something unexplained"),
    ("The World Guide explained how reality broke. This guide introduces the powers that fight over what is left.",
     "Part One explained how reality broke. This part introduces the powers that fight over what is left."),
    ("Part 1 gives a short introduction to each of them, so players can see the shape of the whole war. Parts 2 and 3 tell the full stories of the two launch factions",
     "The first chapter gives a short introduction to each of them, so players can see the shape of the whole war. The next two chapters tell the full stories of the two launch factions"),
    ("This document contains Part 1 of the core rules for Riftborn: The Last War.",
     "This part contains Part 1 of the core rules for Riftborn: The Last War."),
    ("Part 2 will add morale, commanders, terrain and the Rift Energy mechanic.",
     "Core Rules Part 2 will add morale, commanders, terrain and the Rift Energy mechanic."),
    ("Example units and weapons in this document show",
     "Example units and weapons in this part show"),
    ("explained in Part 2", "explained in Core Rules Part 2"),
    ("are covered in Part 2.", "are covered in Core Rules Part 2."),
    ("described in detail in Part 2", "described in detail in Core Rules Part 2"),
    ("Full rules in Part 2", "Full rules in Core Rules Part 2"),
    ("remove tokens. (Part 2)", "remove tokens. (Core Rules Part 2)"),
]
for old, new in replacements:
    n = md.count(old)
    if n == 0:
        sys.exit(f"replacement not found: {old!r}")
    md = md.replace(old, new)

leftover = re.findall(r"[^.\n]*\b(?:this guide|this document|Step \d)\b[^.\n]*", md, re.I)
if leftover:
    print("check wording:", *leftover, sep="\n  ", file=sys.stderr)

open(out_f, "w").write(md)
print("glossary terms:", len(glossary))
