"""Export the approved layered winter composition as a self-contained SVG."""
from pathlib import Path
import re,base64,subprocess,xml.etree.ElementTree as E
from copy import deepcopy
root=Path(__file__).resolve().parent
ns='http://www.w3.org/2000/svg';E.register_namespace('',ns)
def svg_at(s,start):
 depth=0
 for tag in re.finditer(r'</?svg\b[^>]*>',s[start:]):
  depth+=-1 if tag.group().startswith('</') else 1
  if depth==0:
   parsed=E.fromstring(s[start:start+tag.end()])
   for node in parsed.iter():
    if not node.tag.startswith('{'):node.tag='{'+ns+'}'+node.tag
   return parsed
html=(root/'centered/index.html').read_text()
svg=E.Element('{'+ns+'}svg',{'viewBox':'0 0 1000 500','width':'1000','height':'500','role':'img','aria-labelledby':'banner-title banner-description'})
E.SubElement(svg,'{'+ns+'}title',{'id':'banner-title'}).text='osu! Chinese League Rookie — S11 · 2026 winter'
E.SubElement(svg,'{'+ns+'}desc',{'id':'banner-description'}).text='Winter Orion nebula, pastel OCLR, glowing constellation R and white S11. Image credit: NASA, ESA, M. Robberto (STScI/ESA), Hubble Space Telescope Orion Treasury Project Team.'
grade=svg_at(html,html.index('<svg'));svg.append(deepcopy(grade.find('{'+ns+'}defs')))
E.SubElement(svg,'{'+ns+'}rect',{'width':'1000','height':'500','fill':'#07091f'})
# Crop and resize only the embedded runtime photo; keep the 6000px studio original.
photo=subprocess.check_output(['node',str(root/'export-runtime-images.mjs'),'--banner-photo'])
data=base64.b64encode(photo).decode()
E.SubElement(svg,'{'+ns+'}image',{'href':'data:image/jpeg;base64,'+data,'width':'1000','height':'500','preserveAspectRatio':'xMidYMin slice','filter':'url(#nebula-clear-grade)'})
defs=E.SubElement(svg,'{'+ns+'}defs');g=E.SubElement(defs,'{'+ns+'}radialGradient',{'id':'quiet-center','cx':'51%','cy':'43%','r':'64%','gradientTransform':'translate(0 .19) scale(1 .55)'})
for offset,opacity in [('0','.58'),('.44','.36'),('1','0')]:E.SubElement(g,'{'+ns+'}stop',{'offset':offset,'stop-color':'#07091f','stop-opacity':opacity})
E.SubElement(svg,'{'+ns+'}rect',{'width':'1000','height':'500','fill':'url(#quiet-center)'})
for key,x,y,w in [('logo',154,125,530),('season',704,273.75,130),('katu',646.9,130.3,53)]:
 pos=html.index('data-layer="'+key+'"');part=svg_at(html,html.rfind('<svg',0,pos))
 for attr in ['class','data-layer','data-source']:part.attrib.pop(attr,None)
 view=list(map(float,part.get('viewBox').split()));part.set('x',str(x));part.set('y',str(y));part.set('width',str(w));part.set('height',str(w*view[3]/view[2]));part.set('overflow','visible');svg.append(part)
pos=html.index('class="banner-frame"');frame=svg_at(html,html.rfind('<svg',0,pos));frame.attrib.pop('class',None);frame.set('width','1000');frame.set('height','500');svg.append(frame)
E.ElementTree(svg).write(root.parents[2]/'public/branding/oclr-s11-winter-banner.svg',encoding='utf-8',xml_declaration=True)
