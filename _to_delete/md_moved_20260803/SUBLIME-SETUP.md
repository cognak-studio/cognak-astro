# Editing this site in Sublime Text

## One-time setup

1. **Open the project file:** in Sublime, **Project → Open Project…** and pick
   `cognak.sublime-project` (in this folder). From then on, **Project → Switch
   Project** reopens the whole site with the right settings, and `node_modules`/
   `dist` are hidden from the sidebar.

2. **Install Package Control** (Sublime's add-on manager), if you don't have it:
   open the command palette (`Cmd+Shift+P`) → type **"Install Package Control"** →
   Enter. (Newer Sublime builds already include it.)

3. **Install syntax highlighting** for the file types here. `Cmd+Shift+P` →
   **"Package Control: Install Package"** → install each of these:
   - **MarkdownEditing** — nicer Markdown editing (the project `index.md` files)
   - **Naomi** *(or "Astro")* — highlights `.astro` files (the page templates)
   - **TOML** — optional, only if you ever touch config

   None are required to edit content — they just make things prettier and easier
   to read. Markdown + JSON/YAML already highlight natively.

## Daily rhythm

1. Edit files in Sublime (`Cmd+P` to jump to any file by name — e.g. type
   `hex` to open `hex/index.md`).
2. Optional: run `npm run dev` in a terminal and watch changes live at
   http://localhost:4321.
3. Commit + push in **GitHub Desktop** → Vercel deploys automatically.

## Good habits (the project file enforces most of these)

- Keep files **UTF-8** (so curly quotes ' and em-dashes — stay intact).
- Don't hard-wrap the long frontmatter lines — let them run to one line each.
- See `README.md` for the full content guide and `src/content/projects/_template/`
  for a copy-paste starter project.
