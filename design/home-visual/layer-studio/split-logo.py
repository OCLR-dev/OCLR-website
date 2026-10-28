"""Split the existing SVG without redrawing paths or filling letter interiors."""
from pathlib import Path
from copy import deepcopy
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent / 'assets'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
source=ET.parse(ROOT/'logo.svg').getroot()
for kind in ['oclr','season']:
    svg=deepcopy(source)
    for node in list(svg):
        if node.tag==f'{{{NS}}}g' and ((node.get('id')=='season-label') != (kind=='season')):
            svg.remove(node)
    svg.find(f'{{{NS}}}title').text='OCLR' if kind=='oclr' else 'S11'
    svg.find(f'{{{NS}}}desc').text='Original transparent vector outlines, separate editable layer.'
    ET.ElementTree(svg).write(ROOT/f'{kind}-layer.svg',encoding='utf-8',xml_declaration=True)
    view,width,height=('40 60 1000 430','1000','430') if kind=='oclr' else ('1036 292 184 100','184','100')
    svg.set('viewBox',view);svg.set('width',width);svg.set('height',height)
    ET.ElementTree(svg).write(ROOT/f'{kind}-cropped.svg',encoding='utf-8',xml_declaration=True)
