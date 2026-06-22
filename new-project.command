#!/bin/bash
# ============================================================================
#  Double-click this file to add a new cognak.com project — start to finish.
#
#  It asks for the project name, scaffolds the folder + index.md, opens that
#  folder in Finder and the text file in your editor, then (after you've added
#  images + filled in the text) generates the share card and validates the site.
#  When it finishes, just commit + push in GitHub Desktop to publish.
# ============================================================================
cd "$(dirname "$0")"

echo "──────────────────────────────────────────────"
echo "   New cognak.com project"
echo "──────────────────────────────────────────────"
echo

read -r -p "Project name (e.g. Acme Co):  " NAME
if [ -z "$NAME" ]; then
  echo "No name entered — nothing to do. Closing."
  exit 0
fi

# Derive the URL slug the same way the scaffold script does, so we can open the
# project's page in the browser at the end.
SLUG=$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed "s/['’.]//g" | sed 's/[^a-z0-9]\{1,\}/-/g' | sed 's/^-\{1,\}//;s/-\{1,\}$//')

# Make sure dependencies are present (silent unless something's wrong).
npm install >/dev/null 2>&1

# 1. Scaffold + auto-open the folder in Finder and index.md in your editor.
OPEN_AFTER=1 node scripts/new-project.mjs "$NAME"
if [ $? -ne 0 ]; then
  echo
  echo "Stopped — see the message above (the project may already exist)."
  read -r -p "Press Enter to close..."
  exit 1
fi

echo
echo "──────────────────────────────────────────────"
echo "  Finder + your editor just opened."
echo "  Now:  drop in thumb.jpg + hero.jpg (and any gallery images),"
echo "        then fill in the text in index.md and save."
echo "──────────────────────────────────────────────"
echo
read -r -p "Press Enter when you've added images + saved the text (or close this window to skip)... "

# 2. Generate the social share card.
echo
echo "Generating social share card..."
npm run og

# 3. Validate before you push.
echo
echo "Validating the site..."
npm run check

echo
echo "──────────────────────────────────────────────"
echo "  Starting the live preview..."
echo "  Your project will open at:"
echo "      http://localhost:4321/projects/$SLUG"
echo
echo "  Leave this window open while you work."
echo "  Press Ctrl+C (or close it) to stop the preview."
echo
echo "  When you're happy: open GitHub Desktop, write a"
echo "  summary, Commit to main, and Push origin —"
echo "  Vercel publishes it in ~30 seconds."
echo "──────────────────────────────────────────────"
echo

# Open the project's page once the dev server has had a moment to boot, then
# start the server in the foreground (Ctrl+C stops it).
( sleep 4; open "http://localhost:4321/projects/$SLUG" ) &
npx astro dev
