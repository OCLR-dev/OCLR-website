"""Refresh inline, independently selectable vectors from the split SVG assets."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent
for html in [root/'index.html',root/'centered/index.html']:
 s=html.read_text();center=html.parent.name=='centered'
 for key,kind in [('logo','oclr'),('season','season'),('katu','katu')]:
  filename=f'{kind}-'+('cropped.svg' if center or key=='katu' else 'layer.svg')
  svg=(root/'assets'/filename).read_text();svg=re.sub(r'<\?xml.*?\?>\s*','',svg)
  for ident in re.findall(r'\bid="([^"]+)"',svg):
   svg=svg.replace(f'id="{ident}"',f'id="{key}-{ident}"').replace(f'url(#{ident})',f'url(#{key}-{ident})')
  svg=svg.replace('aria-labelledby="title desc"',f'aria-labelledby="{key}-title {key}-desc"')
  svg=svg.replace('<svg ',f'<svg class="layer vector-layer" data-layer="{key}" data-source="'+('../' if center else '')+'assets/'+filename+f'" aria-label="{kind}" ',1)
  start=s.rfind('<svg',0,s.index(f'data-layer="{key}"'));depth=0
  for tag in re.finditer(r'</?svg\b[^>]*>',s[start:]):
   depth+=-1 if tag.group().startswith('</') else 1
   if depth==0:end=start+tag.end();break
  s=s[:start]+svg+s[end:]
 html.write_text(s)
