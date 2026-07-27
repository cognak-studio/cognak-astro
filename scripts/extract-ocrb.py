"""
Bake the ten OCR-B digit outlines into a JS module.

Exports are drawn as vector paths rather than live text, so no font has to be
embedded in the PDF/EPS or installed by whoever opens the SVG. OCR-B is not one
of the PDF base-14 fonts, so live text in that face would silently substitute
to Courier on a printer's machine — outlines remove that whole class of failure.

Source font: the Schwarz / Skala OCR-B (ISO 1073-2), public domain, so the
baked outlines carry no redistribution question.
"""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

src = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/ocr-b/OCRB.otf'
out = sys.argv[2] if len(sys.argv) > 2 else 'ocrb-digits.js'

font = TTFont(src)
upm = font['head'].unitsPerEm
gs = font.getGlyphSet()
cmap = font.getBestCmap()

# Opcodes: 0 move, 1 line, 2 cubic, 3 close. Coordinates are em fractions,
# y up, baseline at 0 — the emitters flip and scale as needed.
OPS = {'moveTo': 0, 'lineTo': 1, 'curveTo': 2, 'closePath': 3}

glyphs, advance, top, bottom = {}, None, -1e9, 1e9
for d in '0123456789':
    pen = RecordingPen()
    gs[cmap[ord(d)]].draw(pen)
    cmds = []
    for op, pts in pen.value:
        if op == 'qCurveTo':
            raise SystemExit('quadratic outlines: expected a CFF font')
        code = OPS.get(op)
        if code is None:
            raise SystemExit('unhandled pen op: ' + op)
        row = [code]
        for (x, y) in pts:
            row += [round(x / upm, 5), round(y / upm, 5)]
            top = max(top, y / upm)
            bottom = min(bottom, y / upm)
        cmds.append(row)
    glyphs[d] = cmds
    w = gs[cmap[ord(d)]].width / upm
    if advance is None:
        advance = w
    elif abs(w - advance) > 1e-6:
        raise SystemExit('OCR-B digits are expected to be monospaced')

# Cap height measured off a flat-topped digit, so the round digits' optical
# overshoot doesn't inflate it.
pen = RecordingPen(); gs[cmap[ord('1')]].draw(pen)
cap = max(y for _, pts in pen.value for (x, y) in pts) / upm

body = [
    '/**',
    ' * OCR-B digit outlines — generated, do not edit by hand.',
    ' * Source: tools/extract-ocrb.py, run against the public-domain',
    ' * Schwarz / Skala OCR-B (ISO 1073-2).',
    ' *',
    ' * Coordinates are fractions of the em, y up, baseline at y=0.',
    ' * Command rows: [0,x,y] move, [1,x,y] line, [2,x1,y1,x2,y2,x,y] cubic, [3] close.',
    ' */',
    '',
    'export const OCRB = {',
    '  advance: %s,   // em fraction; OCR-B digits are monospaced' % round(advance, 5),
    '  cap: %s,        // cap height, em fraction (flat-topped digit)' % round(cap, 5),
    '  top: %s,        // highest point incl. optical overshoot' % round(top, 5),
    '  bottom: %s,    // lowest point; round digits dip below the baseline' % round(bottom, 5),
    '  glyphs: {',
]
for d in '0123456789':
    body.append("    '%s': %s," % (d, json.dumps(glyphs[d], separators=(',', ':'))))
body += ['  },', '};', '']
open(out, 'w').write('\n'.join(body))
print('advance %.5f  cap %.5f  top %.5f  bottom %.5f' % (advance, cap, top, bottom))
