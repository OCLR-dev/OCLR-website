"""Potrace color-layer smoothing, adapted from WallpaperDemo's vector-methods.
Uses cumulative color masks to avoid holes between separately smoothed regions.
The original raster is only an input: output contains real Bezier paths and no image/filter.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import subprocess,re,json,gzip
root=Path(__file__).resolve().parent
source=root/'assets/liru-refined-v2.png'
subprocess.run(['magick',str(source),'-resize','768x1152','/tmp/oclr-liru-trace-smooth.png'],check=True)
source=Path('/tmp/oclr-liru-trace-smooth.png')
im=Image.open(source).convert('RGBA');w,h=im.size
rgba=np.asarray(im);alpha=rgba[:,:,3]>=128

def trace(mask,tolerance=.35,speckle=2):
 bits=np.packbits(mask,axis=1).tobytes();pbm=f'P4\n{w} {h}\n'.encode()+bits
 s=subprocess.run(['potrace','--svg','--flat','--alphamax','1.2','--opttolerance',str(tolerance),'--turdsize',str(speckle),'--unit','1','--output','-','-'],input=pbm,capture_output=True,check=True).stdout.decode()
 return re.search(r'<path\s+d="([\s\S]*?)"\s*/>',s)[1].replace('\n',' ')
outline=trace(alpha,.15,1)
reports=[]
for colors in [64]:
 raw=subprocess.run(['magick',str(source),'-alpha','off','+dither','-colors',str(colors),'-depth','8','RGB:-'],capture_output=True,check=True).stdout
 rgb=np.frombuffer(raw,dtype=np.uint8).reshape(h,w,3)
 keys=rgb[:,:,0].astype(np.uint32)*65536+rgb[:,:,1].astype(np.uint32)*256+rgb[:,:,2]
 palette,counts=np.unique(keys[alpha],return_counts=True)
 # Light-to-dark cumulative layers preserve fine dark contours without seams.
 lum=((palette>>16)*.2126+((palette>>8)&255)*.7152+(palette&255)*.0722);order=np.argsort(lum)[::-1];paths=[]
 ranks=np.full((h,w),65535,dtype=np.uint16)
 for j,i in enumerate(order):ranks[(keys==palette[i])&alpha]=j
 for j,i in enumerate(order):
  key=palette[i];mask=(ranks>=j)&alpha
  if counts[i]<3:continue
  d=trace(mask,.55,2)
  color=f'#{key:06x}'
  paths.append(f'<path fill="{color}" d="{d}"/>')
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>Liru — smooth Potrace vector</title><defs><clipPath id="silhouette"><path d="{outline}" transform="translate(0 {h}) scale(1 -1)"/></clipPath></defs><g clip-path="url(#silhouette)"><g transform="translate(0 {h}) scale(1 -1)"><path fill="#b4a1c6" d="{outline}"/>{"".join(paths)}</g></g></svg>'
 svg=re.sub(r'\s+',' ',svg);out=root/f'assets/liru-potrace-smooth-{colors}.svg';out.write_text(svg)
 report={'colors':colors,'paths':len(paths)+1,'bytes':len(svg.encode()),'gzipBytes':len(gzip.compress(svg.encode())),'embeddedImages':0};reports.append(report);print(report,flush=True)
 subprocess.run(['rsvg-convert','-w','1024','-h','1536',str(out),'-o',f'/tmp/liru-potrace-smooth-{colors}.png'],check=True)
(root/'liru-smoothing-report.json').write_text(json.dumps(reports,indent=2)+'\n')
