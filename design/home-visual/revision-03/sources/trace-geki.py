"""Trace the verified ppy Legacy hit300g asset to native vector paths.
Original image: ppy/osu-resources, CC BY-NC 4.0. See GEKI-SOURCE.md.
This is a deterministic format adaptation, not a newly typeset character.
"""
from pathlib import Path
import tempfile, subprocess
from xml.etree import ElementTree as ET
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'legacy-hit300g@2x.png'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
im=np.asarray(Image.open(SRC).convert('RGBA'))
alpha=im[:,:,3]
foreground=(alpha>=220)&(im[:,:,0]>=170)&(im[:,:,1]>=225)&(im[:,:,2]>=230)

def trace(mask):
    with tempfile.TemporaryDirectory(prefix='oclr-geki-trace-') as d:
        pbm=Path(d)/'mask.pbm';out=Path(d)/'trace.svg'
        Image.fromarray(np.where(mask,0,255).astype('uint8')).convert('1').save(pbm)
        subprocess.run(['potrace',str(pbm),'-s','-o',str(out),'-t','4','-a','0.75','-O','0.15'],check=True)
        root=ET.parse(out).getroot()
        g=root.find('{'+NS+'}g')
        return g
svg=ET.Element('{'+NS+'}svg',{'viewBox':'0 0 162 164','role':'img','aria-labelledby':'geki-title geki-desc'})
ET.SubElement(svg,'{'+NS+'}title',{'id':'geki-title'}).text='激 — osu! Legacy default hit300g'
ET.SubElement(svg,'{'+NS+'}desc',{'id':'geki-desc'}).text='Native vector trace of ppy/osu-resources Legacy hit300g@2x.png. Original ppy/osu! resources, CC BY-NC 4.0. Changes: deterministic contour tracing, smooth vector glow bands, and a white-to-cyan fill matching the source.'
ET.SubElement(svg,'{'+NS+'}metadata').text='Source: https://github.com/ppy/osu-resources/blob/b86b30a9c1109f612fead25c269f8ad6cae4a1c1/osu.Game.Resources/Skins/Legacy/hit300g%402x.png ; License: https://creativecommons.org/licenses/by-nc/4.0/ ; Attribution: ppy / osu! resources'
defs=ET.SubElement(svg,'{'+NS+'}defs')
grad=ET.SubElement(defs,'{'+NS+'}linearGradient',{'id':'geki-white-cyan','gradientUnits':'userSpaceOnUse','x1':'0','y1':'1640','x2':'0','y2':'0'})
for off,color in [('0','#ffffff'),('.42','#ffffff'),('1','#caffff')]:ET.SubElement(grad,'{'+NS+'}stop',{'offset':off,'stop-color':color})
for ident,mask,color,opacity in [('glow-outer',alpha>=28,'#32bce7','.25'),('glow-mid',alpha>=118,'#32bce7','.55'),('blue-core',alpha>=230,'#32bce7','1'),('glyph',foreground,'url(#geki-white-cyan)','1')]:
    g=trace(mask);g.set('id','geki-'+ident);g.set('fill',color);g.set('opacity',opacity)
    svg.append(g)
ET.ElementTree(svg).write(ROOT.parent/'geki.svg',encoding='unicode',xml_declaration=False)
print('geki.svg created from verified Legacy source.')
