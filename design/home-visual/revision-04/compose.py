"""Compose the R04 shape proof from the three independently verifiable sources.

OCL: literal LaTeX \\mathcal{OCL}; R: screenshot slider geometry; S11: existing brush art.
All three are positioned with uniform scaling, without reshaping the supplied contours.
"""
from pathlib import Path
import copy
import subprocess
from xml.etree import ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')


def asset(filename, name, x, y, height):
    svg = ET.parse(ROOT / filename).getroot()
    _, _, w, h = map(float, svg.attrib['viewBox'].split())
    svg.attrib.update(id=name, x=str(x), y=str(y), width=str(w * height / h), height=str(height))
    svg.attrib.pop('version', None)
    svg.attrib.pop('aria-labelledby', None)
    # Give the composed document one accessible title and description.
    for child in list(svg):
        if child.tag.rsplit('}', 1)[-1] in ('title', 'desc', 'metadata'):
            svg.remove(child)
    return svg, w * height / h


def full_name(x, baseline, width):
    font = TTFont('/usr/share/fonts/noto/NotoSans-Regular.ttf')
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    label = 'OSU! CHINESE LEAGUE ROOKIE'
    scale = 27 / font['head'].unitsPerEm
    advances = [font['hmtx'].metrics[cmap[ord(c)]][0] * scale for c in label]
    spacing = (width - sum(advances)) / (len(label) - 1)
    group = ET.Element(f'{{{NS}}}g', id='english-name')
    for c, advance in zip(label, advances):
        pen = SVGPathPen(glyphs)
        glyphs[cmap[ord(c)]].draw(pen)
        if pen.getCommands():
            ET.SubElement(group, f'{{{NS}}}path', d=pen.getCommands(),
                          transform=f'translate({x:.4f} {baseline}) scale({scale} {-scale})')
        x += advance + spacing
    return group


svg = ET.Element(f'{{{NS}}}svg', {
    'viewBox': '0 0 1700 470', 'width': '1700', 'height': '470',
    'role': 'img', 'aria-labelledby': 'wordmark-title wordmark-desc',
    'color': '#15151b', 'fill': 'currentColor',
})
ET.SubElement(svg, f'{{{NS}}}title', id='wordmark-title').text = 'OCLR S11 · R04 形状稿'
ET.SubElement(svg, f'{{{NS}}}desc', id='wordmark-desc').text = (
    'OCL 使用 LaTeX mathcal 的花体大写轮廓。R 依照参考图的控制点和滑条外形重建。'
    '右侧保留原有笔刷 S11。准度条位于 OCLR 与英文全名之间。'
)

ocl, ocl_width = asset('ocl-mathcal.svg', 'OCL-mathcal', 64, 66, 260)
svg.append(ocl)
r_x = 64 + ocl_width + 24
r, r_width = asset('r-shape.svg', 'R-reference-slider', r_x, 66, 260)
svg.append(r)
left_width = r_x + r_width - 64
s11, _ = asset('s11-brush.svg', 'S11-original-brush', 1030, 46, 361)
svg.append(s11)

# Horizontal osu! hit-error bar: symmetry, centre, and restrained hit marks.
bar = ET.SubElement(svg, f'{{{NS}}}g', id='accuracy-bar')
segment_widths = [.15, .20, .30, .20, .15]
colors = ['#d4a72b', '#75ad63', '#68aed1', '#75ad63', '#d4a72b']
x = 64
for fraction, color in zip(segment_widths, colors):
    width = left_width * fraction
    ET.SubElement(bar, f'{{{NS}}}rect', x=f'{x:.4f}', y='358', width=f'{width:.4f}', height='7', fill=color)
    x += width
center = 64 + left_width / 2
ET.SubElement(bar, f'{{{NS}}}path', d=f'M{center:.4f} 351V372', stroke='currentColor', **{'stroke-width': '2'})
for offset, opacity in [(-50, '.25'), (-27, '.45'), (-13, '.65'), (18, '.45'), (37, '.25')]:
    ET.SubElement(bar, f'{{{NS}}}path', d=f'M{center + offset:.4f} 355V368', stroke='currentColor',
                  **{'stroke-width': '1.3', 'opacity': opacity})
svg.append(full_name(64, 413, left_width))

ET.indent(svg, space='  ')
ET.ElementTree(svg).write(ROOT / 'oclr-s11-shapes.svg', encoding='utf-8', xml_declaration=True)

board = copy.deepcopy(svg)
board.insert(2, ET.Element(f'{{{NS}}}rect', {'width': '1700', 'height': '470', 'fill': '#fff'}))
ET.ElementTree(board).write(ROOT / 'shape-board.svg', encoding='utf-8', xml_declaration=True)
subprocess.run(['rsvg-convert', '-o', str(ROOT / 'shape-board.png'), str(ROOT / 'shape-board.svg')], check=True)

ids = [e.attrib['id'] for e in svg.iter() if 'id' in e.attrib]
assert len(ids) == len(set(ids)), 'SVG IDs must remain unique'
assert not any(e.tag.rsplit('}', 1)[-1] in ('image', 'text', 'script', 'filter') for e in svg.iter())
print(f'R04: OCL width {ocl_width:.2f}, R width {r_width:.2f}, left block {left_width:.2f}; vector checks passed.')
