"""Select existing SVG groups directly. Preserve vector path data, not raster crops."""
from pathlib import Path
from copy import deepcopy
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent / 'assets'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
source=ET.parse(ROOT/'logo.svg').getroot()
for kind in ['oclr','season','katu']:
    svg=deepcopy(source)
    for node in list(svg):
        if node.tag!=f'{{{NS}}}g': continue
        is_season=node.get('id')=='season-label'
        if is_season:
            if kind!='season':svg.remove(node)
        elif kind=='season': svg.remove(node)
        else:
            for child in list(node):
                is_katu=child.get('id')=='judgement-katu'
                if (kind=='katu') != is_katu: node.remove(child)
    svg.find(f'{{{NS}}}title').text={'oclr':'OCLR','season':'S11','katu':'喝'}[kind]
    svg.find(f'{{{NS}}}desc').text='Original transparent SVG paths, independently selectable.'
    ET.ElementTree(svg).write(ROOT/f'{kind}-layer.svg',encoding='utf-8',xml_declaration=True)
    view,width,height={'oclr':('40 60 1000 430','1000','430'),'season':('1036 292 184 100','184','100'),'katu':('970 70 100 100','100','100')}[kind]
    svg.set('viewBox',view);svg.set('width',width);svg.set('height',height)
    ET.ElementTree(svg).write(ROOT/f'{kind}-cropped.svg',encoding='utf-8',xml_declaration=True)
