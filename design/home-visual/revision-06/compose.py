"""Layout B homepage wordmark; preserves the R05 source and all background art."""
from pathlib import Path
import copy
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
source = ET.parse(ROOT.parent / 'revision-05/oclr-s11-angular.svg').getroot()
svg = ET.Element(f'{{{NS}}}svg', {
    'viewBox': '40 0 1200 490', 'width': '1200', 'height': '490',
    'color': '#fff5ee', 'role': 'img', 'aria-labelledby': 'title desc',
})
ET.SubElement(svg, f'{{{NS}}}title', id='title').text = 'osu! Chinese League Rookie — S11'
ET.SubElement(svg, f'{{{NS}}}desc', id='desc').text = 'Horizontal outline OCLR, small S11 to the right of OCLR aligned to its baseline, Katu above the R, and an outline timing bar divided into five judgement regions with one marker in the early 100 region.'
main = ET.SubElement(svg, f'{{{NS}}}g', transform='translate(0 60)')
for name in ['O-angular', 'C-angular', 'L-angular', 'R-reference-slider', 'judgement-katu', 'english-name']:
    node = copy.deepcopy(next(e for e in source if e.get('id') == name))
    if name in ('O-angular', 'C-angular', 'L-angular'):
        node.set('stroke-width', '3')
    if name == 'R-reference-slider':
        for e in node.iter():
            # Keep geometry; make its contour legible at homepage display size.
            if e.get('id') == 'r-outer-r-track':
                e.set('stroke-width', '163')
            if e.get('id') in ('r-outer-r-head-cap', 'r-outer-r-tail-cap'):
                e.set('r', '82.25')
            if e.get('id') in ('r-control-0', 'r-control-2'):
                e.set('fill', '#bda2ff')
            if e.tag.endswith('polyline'):
                e.set('stroke', '#e3d9f5')
    main.append(node)
season = ET.SubElement(svg, f'{{{NS}}}g', id='season-label',
                       transform='translate(1040 296) scale(.30) translate(-1030 -66)')
for name in ['S-angular', 'season-one-a', 'season-one-b']:
    node = copy.deepcopy(next(e for e in source if e.get('id') == name))
    node.set('stroke-width', '10')
    season.append(node)
# The former early 100 zone occupies 15–35% of the bar; retain one mark at 25%.
old_bar = next(e for e in source if e.get('id') == 'accuracy-bar')
width = sum(float(e.get('width')) for e in old_bar if e.tag.endswith('rect'))
bar = ET.SubElement(main, f'{{{NS}}}g', id='accuracy-bar', fill='none', stroke='currentColor')
ET.SubElement(bar, f'{{{NS}}}rect', x='64', y='358', width=str(width), height='7', **{'stroke-width':'1.8'})
# Reuse the original five region boundaries without restoring their fills.
regions = [e for e in old_bar if e.tag.endswith('rect')]
for index, region in enumerate(regions[1:], start=1):
    boundary = region.get('x')
    ET.SubElement(bar, f'{{{NS}}}path', id=f'accuracy-boundary-{index}',
                  d=f'M{boundary} 358V365', **{'stroke-width': '1.8'})
x = 64 + width * .25
ET.SubElement(bar, f'{{{NS}}}path', id='accuracy-100-marker', d=f'M{x} 351V372', **{'stroke-width':'2.6'})
assert len(list(bar)) == 6
assert len([e for e in bar if e.get('id', '').startswith('accuracy-boundary-')]) == 4
ids = [e.get('id') for e in svg.iter() if e.get('id')]
assert len(ids) == len(set(ids))
assert not any(e.tag.rsplit('}',1)[-1] in ('image','text','script','filter') for e in svg.iter())
ET.indent(svg, space='  ')
output = ROOT.parents[2] / 'public/branding/oclr-s11-layout-b.svg'
ET.ElementTree(svg).write(output, encoding='utf-8', xml_declaration=True)
print(f'Wrote {output}; five outlined regions, one 100 marker and native vectors verified.')
