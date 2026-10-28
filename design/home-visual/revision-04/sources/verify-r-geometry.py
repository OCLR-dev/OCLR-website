#!/usr/bin/env python3
"""Check R04 reference outline in selected unobscured scanline regions.

Dependencies: numpy, Pillow, scipy. Run from any directory. Reports actual pixel
measurements, not a blanket whole-image similarity score. Exact pure-color
regions reduce interference from background, white control polygons, and rings.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

ROOT=Path(__file__).resolve().parents[1]
meta=json.loads((ROOT/'r-control-points.json').read_text())
im=np.array(Image.open(ROOT/'sources/r-reference.png').convert('RGB'))
gold=np.all(im==[255,204,34],axis=2)
white=np.all(im==[255,255,255],axis=2)

def groups(mask,y):
    result=[]
    for x in np.flatnonzero(mask[y]):
        if not result or x>result[-1][-1]+1: result.append([int(x)])
        else: result[-1].append(int(x))
    return result

def stats(errors):
    v=np.abs(errors)
    return {'count':len(v),'medianPx':float(np.median(v)),
            'p95Px':float(np.percentile(v,95)), 'maxPx':float(max(v))}

c=np.array(meta['segments'][1]['center'])
r=meta['segments'][1]['radius']
outer=[];inner=[];outer_white=[];inner_white=[];stem=[]
first=meta['segments'][0]
for y in range(75,405):
    if 341 <= y <= 346: continue  # Another editor overlay occludes the gold stem edge.
    gs=[g for g in groups(gold,y) if 45<g[0]<200]
    if gs:
        g=gs[0]
        stem.append(np.linalg.norm(np.array([g[0]-.5,y])-first['center'])-(first['radius']+75.5))
for y in range(35,370):
    gs=groups(gold,y)
    if not gs:continue
    g=gs[-1]
    outer.append(np.linalg.norm(np.array([g[-1]+.5,y])-c)-(r+75.5))
    # White band immediately on the body side of the outer gold border.
    ws=[w for w in groups(white,y) if 0<=g[0]-w[-1]<=3 and len(w)>=2]
    if ws:
        w=ws[-1]
        outer_white.append(np.linalg.norm(np.array([w[0]-.5,y])-c)-(r+62.5))
for y in range(150,245):
    if 212 <= y <= 222: continue  # White editor control polygon crosses this border.
    gs=[g for g in groups(gold,y) if g[0]>280 and g[-1]<370]
    if not gs:continue
    g=gs[-1]
    inner.append(np.linalg.norm(np.array([g[0]-.5,y])-c)-(r-75.5))
    ws=[w for w in groups(white,y) if 0<=w[0]-g[-1]<=3 and len(w)>=2]
    if ws:
        w=ws[0]
        inner_white.append(np.linalg.norm(np.array([w[-1]+.5,y])-c)-(r-62.5))

# Fit the gold terminal circle, constraining its center to the last linear
# segment; excludes the yellow control marker and external partial ring.
points=[]
for y in range(442,546):
    for g in groups(gold,y):
        if g[0]>430 and g[-1]<467:
            points.extend([[g[0]-.5,y,-1],[g[-1]+.5,y,1]])
p=np.array(points);start=np.array([178.5,283.5]);delta=np.array([247.,239.])
def residual(v):
    return np.linalg.norm(p[:,:2]-(start+delta*v[0]),axis=1)-(v[1]+p[:,2]*v[2])
fit=least_squares(residual,[.85,71,4],loss='soft_l1')
result={
 'stemOuterGoldEdge':stats(stem),
 'upperOuterGoldEdge':stats(outer),
 'counterInnerGoldEdge':stats(inner),
 'upperOuterWhiteBodyEdge':stats(outer_white),
 'counterWhiteBodyEdge':stats(inner_white),
 'tailCircleFit':{'fraction':float(fit.x[0]),'center':list(start+delta*fit.x[0]),
                  'goldMidlineRadius':float(fit.x[1]),'goldHalfWidth':float(fit.x[2]),
                  **stats(fit.fun)},
 'scope':'Selected unobscured reference regions only. This is not a full-image IoU or a claim to recover original .osu metadata.'}
print(json.dumps(result,indent=2))
