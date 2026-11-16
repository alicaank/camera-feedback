"""Build SVG presentation copies with consistent World model / Re-aim labels.

The embedded PNGs are preserved byte for byte. Vector labels replace only the
original legend text; plotted curves, axes, numbers, and diagram paths are unchanged.
"""
import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "img"


def figure(name, width, height, labels):
    encoded = base64.b64encode((IMAGES / f"{name}.png").read_bytes()).decode("ascii")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <image width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/>
  <g font-family="Arial, Helvetica, sans-serif">{labels}</g>
</svg>
'''
    (IMAGES / f"{name}.svg").write_text(svg)


def main():
    figure("fig_setup", 2402, 820, '''
    <rect x="623" y="349" width="132" height="36" fill="#f5f7fa"/>
    <text x="625" y="374" font-size="22" fill="#e4572e">World model</text>
    <rect x="585" y="412" width="108" height="27" fill="#f5f7fa"/>
    <text x="588" y="433" font-size="24" fill="#1463d6">Re-aim</text>
    <rect x="214" y="730" width="530" height="37" fill="#f5f7fa"/>
    <text x="218" y="759" font-size="26" fill="#26313c"><tspan fill="#e4572e" font-weight="700">World model:</tspan> command the plan</text>
    <rect x="145" y="766" width="555" height="38" fill="#f5f7fa"/>
    <text x="150" y="795" font-size="26" fill="#26313c"><tspan fill="#1463d6" font-weight="700">Re-aim:</tspan> command the way back</text>
    <circle cx="570" cy="784" r="16" fill="#1463d6"/>
    <text x="570" y="793" font-size="25" text-anchor="middle" fill="#fff">2</text>
''')
    figure("fig_time_compact", 2400, 398, '''
    <rect width="2400" height="48" fill="#fff"/>
    <g font-size="28" fill="#26313c">
      <path d="M740 25h76" stroke="#e4572e" stroke-width="3"/><text x="832" y="35">World model</text>
      <path d="M1045 25h76" stroke="#12a37d" stroke-width="3"/><text x="1137" y="35">Re-aim</text>
      <path d="M1275 25h76" stroke="#1463d6" stroke-width="4"/><text x="1367" y="35">Re-aim + RGC</text>
    </g>
''')
    print("Built two SVG figures with updated labels; embedded PNG data preserved.")


if __name__ == "__main__":
    main()
