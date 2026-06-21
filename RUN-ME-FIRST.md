#  cognak.com — start here

This is the cognak.com website. It's plain files: text in Markdown, images in
folders. You edit, then push, and it goes live automatically. No WordPress,
no database, no hosting panel.

##  The only commands you need

| I want to…                        | Do this                                          |
|-----------------------------------|--------------------------------------------------|
| Preview the site on my computer   | Double-click **`dev.command`** (or `npm run dev`) |
| Start a new project               | `npm run new -- "Project Name"`                  |
| Make its share image              | `npm run og`                                      |
| Compress big gallery images       | `npm run optimize`                                |
| Check for mistakes before pushing | `npm run check`                                   |
| Publish changes                   | Commit + push in **GitHub Desktop** (auto-deploys)|

##  Add a project in 3 steps

1. `npm run new -- "Acme Co"`  → creates the folder + a starter file
2. Drop `thumb.jpg` (square) and `hero.jpg` (large) into that new folder
3. Open its `index.md` in Sublime, fill in the text, then commit + push

##  Edit a project

Open `src/content/projects/<name>/index.md` in Sublime, change the text or
swap an image (keep the same filename to avoid editing anything), commit + push.

##  Good to know

- Live site: **https://cognak.com** — updates ~30 seconds after you push.
- Full details: **README.md**. Editor setup: **SUBLIME-SETUP.md**.
- Copy-paste starter: `src/content/projects/_template/`.
- Email, domain, and hosting all run themselves — nothing to maintain.
