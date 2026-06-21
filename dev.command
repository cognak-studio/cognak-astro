#!/bin/bash
# Double-click this file in Finder to start the local preview.
# It opens a Terminal window, starts the dev server, and opens your browser
# to the site. Press Ctrl+C in that window (or just close it) to stop.
cd "$(dirname "$0")"
echo "Starting cognak.com local preview..."
npm install >/dev/null 2>&1
npm run dev
