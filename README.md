<div align="center">

<img src="src/Logo.png" alt="TidyBiber logo" width="140">

# TidyBiber

**Lint, format, and verify your BibTeX — right in the browser.**

Runs entirely in your browser. Your library never leaves your machine.

[**▶ Open the app**](https://arrjon.github.io/TidyBiber/)
·
[MIT License](LICENSE)

</div>

---

## What it does

- 🔍 **Lints** every entry — missing/unexpected fields, bad years, page ranges, non-bare DOIs, duplicate keys & DOIs, and more.
- ⚡ **Autocorrects** the easy stuff with one click (`dio`→`doi`, `1-9`→`1--9`, bare DOIs, brace-protected terms…).
- 🎨 **Formats on load** — entries sorted, fields ordered and aligned.
- 🔑 **Citation-key styles** — automatically generate keys from author, year, title.
- 🌐 **Verifies online** against Crossref, OpenAlex, Semantic Scholar, DataCite, DBLP & PMLR — each entry is checked against the first source (in your configured order) that returns a confident match on title, year, author, venue, pages and DOI, with fixes that apply the looked-up value.
- 🔗 **Checks dead links** and finds the **published version** of arXiv preprints.
- ✏️ **Edit, add, delete** entries as BibTeX; **search** and filter; **export** the formatted `.bib`.

## Usage

1. Open the app (link above).
2. Drag in a `.bib` file.
3. Review, fix, optionally **Verify**, then **Export .bib**.

Settings live only for the session — use **Config → Export / Import JSON** to keep them.

---

<div align="center">
MIT © 2026 Jonas Arruda
</div>
