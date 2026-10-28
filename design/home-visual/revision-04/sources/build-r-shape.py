#!/usr/bin/env python3
"""Rebuild the R04 slider R from measured screenshot-space control points.

Uses two three-point circular arcs and a line. No font and no raster tracing.
The original .osu is unavailable: expected length and track width are measured.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
POINTS = [(122.5, 482.5), (153.5, 279.5), (205.5, 81.5),
          (419.5, 184.5), (178.5, 283.5), (425.5, 522.5)]
TRACK_RADIUS = 75.5
CAP_RADIUS = 76.25
END_FRACTION = 0.850454134735

def circle(a, b, c):
    x1,y1 = a; x2,y2 = b; x3,y3 = c
    d = 2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2))
    s1=x1*x1+y1*y1; s2=x2*x2+y2*y2; s3=x3*x3+y3*y3
    cx=(s1*(y2-y3)+s2*(y3-y1)+s3*(y1-y2))/d
    cy=(s1*(x3-x2)+s2*(x1-x3)+s3*(x2-x1))/d
    r=math.hypot(x1-cx,y1-cy)
    a0=math.atan2(y1-cy,x1-cx)
    a1=math.atan2(y3-cy,x3-cx)
    sweep=(a1-a0)%(2*math.pi)
    return {'center':[cx,cy], 'radius':r, 'startAngle':a0,
            'sweepAngle':sweep, 'length':r*sweep}

arc1=circle(*POINTS[:3])
arc2=circle(*POINTS[2:5])
tail=tuple(POINTS[4][i]+END_FRACTION*(POINTS[5][i]-POINTS[4][i]) for i in range(2))
path_prefix=(f'M122.5 482.5 A{arc1["radius"]:.9f} {arc1["radius"]:.9f} 0 0 1 205.5 81.5 '
             f'A{arc2["radius"]:.9f} {arc2["radius"]:.9f} 0 1 1 178.5 283.5 ')
visible_path=path_prefix+f'L{tail[0]:.9f} {tail[1]:.9f}'
full_path=path_prefix+'L425.5 522.5'
bbox=[POINTS[0][0]-CAP_RADIUS,
      arc2['center'][1]-arc2['radius']-TRACK_RADIUS,
      arc2['center'][0]+arc2['radius']+TRACK_RADIUS,
      tail[1]+CAP_RADIUS]
viewbox=[bbox[0],bbox[1],bbox[2]-bbox[0],bbox[3]-bbox[1]]
shape=f'''<g id="r-slider-shape">
  <path id="r-track" d="{visible_path}" fill="none" stroke="currentColor" stroke-width="{2*TRACK_RADIUS}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle id="r-head-cap" cx="122.5" cy="482.5" r="{CAP_RADIUS}" fill="currentColor"/>
  <circle id="r-tail-cap" cx="{tail[0]:.9f}" cy="{tail[1]:.9f}" r="{CAP_RADIUS}" fill="currentColor"/>
</g>'''
poly=' '.join(f'{x},{y}' for x,y in POINTS)
controls=f'<polyline points="{poly}" fill="none" stroke="#64748b" stroke-width="1.5"/>'
colors=['#6644cc','#ffcc22','#6644cc','#ffcc22','#ed1121','#ffcc22']
for i,((x,y),color) in enumerate(zip(POINTS,colors)):
    controls+=f'\n<circle id="r-control-{i}" cx="{x}" cy="{y}" r="11.5" fill="{color}"/>'
helper=f'''<g id="r-visible-centerline" display="none"><path d="{visible_path}" fill="none" stroke="#ea4a89" stroke-width="2"/></g>
<g id="r-full-control-path" display="none"><path d="{full_path}" fill="none" stroke="#ec4899" stroke-width="1.5" stroke-dasharray="5 4"/></g>
<g id="r-control-points" display="none">{controls}</g>'''
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{' '.join(f'{v:.9f}' for v in viewbox)}" role="img" aria-labelledby="r-title r-desc">
<title id="r-title">R — two circular slider arcs and a linear ending</title>
<desc id="r-desc">Reconstructed in original 497×559 screenshot coordinates. Six measured control points, two perfect-circle arcs, then a line shortened to the visible slider tail. The cropped top and bottom are completed analytically. No editor handles are visible by default.</desc>
{shape}
{helper}
</svg>\n'''
(ROOT/'r-shape.svg').write_text(svg)
review=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 497 559" role="img" aria-labelledby="r-review-title r-review-desc">
<title id="r-review-title">R reference geometry review</title>
<desc id="r-review-desc">Original screenshot coordinates. Purple starts a perfect curve; yellow is an intermediate control point; red starts the final linear segment. The dashed line extends to the final control point past the measured visible tail.</desc>
<rect width="497" height="559" fill="#f6f4ef"/>
<g color="#d8d4df">{shape}</g>
<path d="{visible_path}" fill="none" stroke="#ffcc22" stroke-width="151" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{visible_path}" fill="none" stroke="#fff" stroke-width="133" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{visible_path}" fill="none" stroke="#dedbe4" stroke-width="125" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{visible_path}" fill="none" stroke="#ac2d70" stroke-width="2.5"/>
<path d="M{tail[0]} {tail[1]} L425.5 522.5" fill="none" stroke="#ac2d70" stroke-width="2.5" stroke-dasharray="5 4"/>
{controls}
<circle cx="{tail[0]}" cy="{tail[1]}" r="5" fill="#fff" stroke="#ac2d70" stroke-width="2"/>
</svg>\n'''
(ROOT/'r-geometry-review.svg').write_text(review)
line_length=math.dist(POINTS[4],POINTS[5])
metadata={
    'source':{'file':'sources/r-reference.png','width':497,'height':559,
              'coordinates':'Original screenshot pixels; flat-color marker centers are half-pixel aligned.',
              'status':'Screenshot reconstruction; not recovered original .osu data.'},
    'controlPoints':[
        {'index':i,'x':p[0],'y':p[1],'markerColor':colors[i],
         'segmentType':('PerfectCurve' if i in (0,2) else 'Linear' if i==4 else None)}
        for i,p in enumerate(POINTS)],
    'segments':[{'type':'PerfectCurve','controlPointIndices':[0,1,2],**arc1},
                {'type':'PerfectCurve','controlPointIndices':[2,3,4],**arc2},
                {'type':'Linear','controlPointIndices':[4,5], 'untrimmedLength':line_length,
                 'visibleFraction':END_FRACTION,'visibleTail':list(tail),
                 'visibleLength':END_FRACTION*line_length}],
    'stroke':{'trackRadius':TRACK_RADIUS,'endpointCapRadius':CAP_RADIUS,
              'note':'Widths are measured from the selected golden silhouette, not gameplay hitbox claims.'},
    'visiblePath':visible_path,'untrimmedControlPath':full_path,
    'inferredExpectedDistance':arc1['length']+arc2['length']+END_FRACTION*line_length,
    'visibleBounds':{'xMin':bbox[0],'yMin':bbox[1],'xMax':bbox[2],'yMax':bbox[3]},
    'viewBox':viewbox,
    'limitations':['Original .osu data is unavailable.',
       'Subpixel control-point positions are measured from marker pixels, approximately ±0.5 px.',
       'ExpectedDistance-like shortening is inferred from the visible round tail.',
       'Outline extends beyond the screenshot crop; those small missing portions follow the reconstructed arcs and caps.',
       'The external partial approach ring and editor overlays are omitted from the letter silhouette.']}
(ROOT/'r-control-points.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'viewBox':viewbox,'visibleTail':tail,'path':visible_path},indent=2))
