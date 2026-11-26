# Building the Riftborn book

- `originals/` holds the three Word documents the book is made from.
- `book.md` is the assembled text of the book (pandoc Markdown). Edit this to change the book.
- `tools/` turns it into the PDF and the GitHub page.

To rebuild after editing `book.md` (needs pandoc and `pip install weasyprint`):

1. Put the fonts in `tools/fonts/`: Cinzel (SemiBold 600, ExtraBold 800), Crimson Pro (Regular, Italic, SemiBold) and Barlow Condensed (Medium, Bold) from Google Fonts, named as in `tools/book.css`.
2. Run `python3 tools/build.py book.md ..` from this folder.

To start again from the Word documents instead, run
`python3 tools/assemble.py originals/Riftborn_World_Guide.docx originals/Riftborn_Faction_Guide.docx originals/Riftborn_Core_Rules_Part1.docx book.md`.
