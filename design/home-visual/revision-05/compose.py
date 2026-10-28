"""R05: angular OCL/S11, preserved R04 slider and R03 Katu glyph."""
from pathlib import Path
import copy
import subprocess
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

svg = ET.Element(f'{{{NS}}}svg', {
    'viewBox': '0 0 1700 470', 'width': '1700', 'height': '470',
    'role': 'img', 'aria-labelledby': 'title desc', 'color': '#15151b',
})
ET.SubElement(svg, f'{{{NS}}}title', id='title').text = 'OCLR S11 · R05 棱角形状稿'
ET.SubElement(svg, f'{{{NS}}}desc', id='desc').text = (
    'OCL 与 S11 采用切角、斜切笔画构成，内部透明。'
    'R 沿用上一稿的轮廓、六个控制点与连线。R 的右上角喝沿用 R03 字形。'
)


def letter(name, x, y, d):
    ET.SubElement(svg, f'{{{NS}}}path', {
        'id': name, 'd': d, 'transform': f'translate({x} {y})',
        'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '1.8',
        'stroke-linejoin': 'miter', 'stroke-miterlimit': '4',
    })


# A shared rightward lean and clipped corners, each silhouette built from lines.
letter('O-angular', 64, 66,
       'M62 0H212L238 28L196 232L163 260H14L0 232L38 28Z '
       'M86 52H174L179 59L151 204L145 210H59L56 204L83 59Z')
letter('C-angular', 326, 66,
       'M64 0H229L221 52H96L85 63L58 197L66 208H195L185 260H22L0 235L39 29Z')
letter('L-angular', 567, 66,
       'M52 0H109L72 208H213L203 260H0Z')

previous = ET.parse(ROOT.parent / 'revision-04/oclr-s11-shapes.svg').getroot()
for name in ['R-reference-slider', 'accuracy-bar', 'english-name']:
    svg.append(copy.deepcopy(next(e for e in previous if e.get('id') == name)))

letter('S-angular', 1030, 66,
       'M73 0H250L240 59H98L88 70L79 111H189L217 141L191 270L159 300H0L11 241H137L148 230L155 185H45L17 155L40 31Z')
one = 'M20 45L79 0H140L83 300H23L65 81L6 118Z'
letter('season-one-a', 1300, 66, one)
letter('season-one-b', 1470, 66, one)

# Reuse the exact earlier glyph path, rather than substitute another CJK font.
old = ET.parse(ROOT.parent / 'revision-03/oclr-s11-rhythm.svg').getroot()
katu = next(e for e in old.iter() if e.get('id') == 'judgement-katu')
glyph = copy.deepcopy(katu.find(f'{{{NS}}}g/{{{NS}}}path'))
glyph.set('transform', 'translate(986 83) scale(.064 -.064)')
badge = ET.SubElement(svg, f'{{{NS}}}g', {
    'id': 'judgement-katu', 'fill': 'currentColor',
    'transform': 'rotate(-12 1016 55)',
})
badge.append(glyph)

ET.indent(svg, space='  ')
ET.ElementTree(svg).write(ROOT / 'oclr-s11-angular.svg', encoding='utf-8', xml_declaration=True)
board = copy.deepcopy(svg)
board.insert(2, ET.Element(f'{{{NS}}}rect', {'width': '1700', 'height': '470', 'fill': '#fff'}))
ET.ElementTree(board).write(ROOT / 'shape-board.svg', encoding='utf-8', xml_declaration=True)
subprocess.run(['rsvg-convert', str(ROOT / 'shape-board.svg'), '-o', str(ROOT / 'shape-board.png')], check=True)
ids = [e.get('id') for e in svg.iter() if e.get('id')]
assert len(ids) == len(set(ids))
assert not any(e.tag.rsplit('}', 1)[-1] in ('image', 'text', 'filter', 'script') for e in svg.iter())
assert ET.tostring(next(e for e in svg if e.get('id') == 'R-reference-slider')) == ET.tostring(
    next(e for e in previous if e.get('id') == 'R-reference-slider'))
print('R05 rendered; native vectors, unique IDs and unchanged R verified.')
