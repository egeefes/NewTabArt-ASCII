# Builds the icon as SVG: a butterfly made of mosaic cells, like the animals on the page.
import sys
GRID = [
  "X.........X",
  ".X.......X.",
  "..A.....A..",
  "WWW.....WWW",
  "WWWW...WWWW",
  "WWWWW.WWWWW",
  ".WWWWBWWWW.",
  "..WWWBWWW..",
  ".WWW.B.WWW.",
  "WWW..B..WWW",
  ".W.......W.",
]
# antenna dots: X (tips), A (stalk)
rows, cols = len(GRID), len(GRID[0])
def color(r, c):
  ch = GRID[r][c]
  if ch in "XA": return "#9fc4ff" if ch == "X" else "#5d86d6"
  if ch == "B": return "#eef4ff"
  # wings: light at the outer tips, deeper toward the body
  d = abs(c - 5) / 5            # 0 at body, 1 at edge
  top = r < 6
  shades = ["#2a4fb0", "#3566cf", "#4a82ea", "#6fa3ff", "#a9cbff"]
  i = min(4, int(d * 4.6 + (0.4 if top else 0)))
  return shades[i]

def svg(size, gap):
  if gap:
    pad = size * 0.16
    cell = (size - 2 * pad) / max(rows, cols)
    ox = (size - cell * cols) / 2
    oy = (size - cell * rows) / 2 + cell * 0.1
  else:
    # Small sizes: whole-pixel squares, so the edges stay sharp.
    cell = max(1, int(size * 0.72 / cols))
    ox = (size - cell * cols) // 2
    oy = (size - cell * rows) // 2
  rad = size * (0.22 if gap else 0.2)
  out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}"' + ('' if gap else ' shape-rendering="crispEdges"') + '>',
         '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151a29"/><stop offset="1" stop-color="#07090f"/></linearGradient></defs>',
         f'<rect width="{size}" height="{size}" rx="{rad}" fill="url(#bg)"/>']
  if gap:  # faint grid like the page background
    step = cell
    for i in range(1, int(size / step)):
      x = ox % step + i * step - step
      out.append(f'<path d="M{x:.2f} 0V{size}M0 {oy % step + i*step - step:.2f}H{size}" stroke="#ffffff" stroke-opacity="0.045" stroke-width="{max(0.5,size/256):.2f}"/>')
  g = cell * (0.14 if gap else 0)
  for r in range(rows):
    for c in range(cols):
      if GRID[r][c] == ".": continue
      x, y = ox + c * cell + g / 2, oy + r * cell + g / 2
      w = cell - g
      out.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{w:.2f}" rx="{w*0.18 if gap else 0:.2f}" fill="{color(r,c)}"/>')
  out.append(f'<rect x="0.5" y="0.5" width="{size-1}" height="{size-1}" rx="{rad}" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>' if gap else '')
  out.append('</svg>')
  return "\n".join(out)

open("icon.svg", "w").write(svg(128, True))
open("icon-32.svg", "w").write(svg(32, False))
open("icon-16.svg", "w").write(svg(16, False))
