"""Original vector construction based on the supplied composition and osu! objects.
Glyph outlines: Noto Serif CJK Black (SIL OFL), not raster tracing.
"""
from pathlib import Path
import math
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT=Path(__file__).resolve().parent
font=TTFont('/usr/share/fonts/noto-cjk/NotoSerifCJK-Black.ttc',fontNumber=2)
glyphs=font.getGlyphSet(); cmap=font.getBestCmap()
def glyph(c,x,y,size):
    pen=SVGPathPen(glyphs); glyphs[cmap[ord(c)]].draw(pen)
    return f'<path d="{pen.getCommands()}" transform="translate({x} {y}) scale({size/1000} {-size/1000})"/>'
def arc(cx,cy,r,a,b):
    p=lambda t:(cx+r*math.cos(math.radians(t)),cy+r*math.sin(math.radians(t)))
    x,y=p(a);xx,yy=p(b)
    return f'M{x:.2f} {y:.2f}A{r} {r} 0 {int(b-a>180)} 1 {xx:.2f} {yy:.2f}'
def ring(cx,cy,outer,inner):
    return f'M{cx+outer} {cy}a{outer} {outer} 0 1 0 {-2*outer} 0a{outer} {outer} 0 1 0 {2*outer} 0ZM{cx+inner} {cy}a{inner} {inner} 0 1 1 {-2*inner} 0a{inner} {inner} 0 1 1 {2*inner} 0Z'

svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 470" role="img" aria-labelledby="title desc">
<title id="title">OCLR S11 — osu! 节奏构成</title>
<desc id="desc">巨大打击圈 O、弯曲滑条 C、直角滑条 L、圆弧和斜腿构成 R；激与喝判定牌、光标拖尾、follow points 和下挂的 S11 斜框。全部为矢量路径。</desc>
<defs>
  <linearGradient id="violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9f65e8"/><stop offset=".6" stop-color="#7434b7"/><stop offset="1" stop-color="#552588"/></linearGradient>
  <linearGradient id="pink" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f290d1"/><stop offset="1" stop-color="#d93a9c"/></linearGradient>
  <linearGradient id="c-track" gradientUnits="userSpaceOnUse" x1="384" y1="160" x2="448" y2="349"><stop stop-color="#9756db"/><stop offset=".48" stop-color="#773cbd"/><stop offset="1" stop-color="#ec67b4"/></linearGradient>
  <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="15" y1="389" x2="731" y2="163"><stop stop-color="#f8f2e7" stop-opacity="0"/><stop offset=".3" stop-color="#bd72e6" stop-opacity=".38"/><stop offset=".73" stop-color="#f8f2e7" stop-opacity=".85"/><stop offset="1" stop-color="#fff6ec"/></linearGradient>
  <linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="124" y1="401" x2="982" y2="22"><stop stop-color="#ad63da" stop-opacity="0"/><stop offset=".5" stop-color="#d958b0" stop-opacity=".75"/><stop offset="1" stop-color="#fdf0f1"/></linearGradient>
  <linearGradient id="plate"><stop stop-color="#2a173d"/><stop offset="1" stop-color="#843a9c"/></linearGradient>
  <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#f8efe4"/></pattern>
  <pattern id="dark-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#763ab8"/></pattern>
  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)"><path d="M0 0V6" stroke="#f9eaf3" stroke-width="1"/></pattern>
  <clipPath id="o-ring"><path d="ORING" fill-rule="evenodd"/></clipPath>
  <clipPath id="o-inner"><path d="OINNER" fill-rule="evenodd"/></clipPath>
  <clipPath id="r-leg"><path d="M713 155L753 137L892 259L837 276Z"/></clipPath>
  <clipPath id="c-lower"><path d="M340 294L536 265V389H340Z"/></clipPath>
</defs>
'''.replace('ORING',ring(202,279,132,103)).replace('OINNER',ring(202,279,103,68))
# Background accents are geometrically tied to objects, not scattered decoration.
svg+='''<g id="construction-planes" opacity=".75">
  <path d="M885 66L922 52V245L885 256Z" fill="#251636"/>
  <path d="M893 153L916 145M893 165L916 157M893 177L916 169M893 189L916 181M893 201L916 193M893 213L916 205M893 225L916 217" stroke="#ce5eae" stroke-width="2"/>
  <path d="M526 68L535 64V212L526 216Z" fill="url(#dots)" opacity=".6"/>
  <path d="M324 139L367 122V191L324 208Z" fill="url(#dots)" opacity=".36"/>
</g>
<g id="cursor-sweep">
  <path d="M113 422C207 321 312 243 438 193S732 96 979 23" fill="none" stroke="url(#sweep)" stroke-width="2.5"/>
  <path d="M648 105L936 17" stroke="#e9b8df" stroke-width="2.5"/>
</g>
'''
# O: hit circle ring and approach circle, segmented as in the reference.
svg+='<g id="O-hitcircle">'
svg+=f'<circle cx="202" cy="279" r="152" fill="none" stroke="#eadce9" stroke-width="2.2"/>'
svg+=f'<path d="{arc(202,279,152,205,293)}" fill="none" stroke="#ac52da" stroke-width="5"/>'
svg+=f'<path d="{arc(202,279,152,1,72)}" fill="none" stroke="#e56ab9" stroke-width="4"/>'
svg+=f'<path d="{ring(202,279,132,68)}" fill="#f6efe3" fill-rule="evenodd"/>'
svg+='<g clip-path="url(#o-ring)"><path d="M197 127L344 172L351 252L199 279Z" fill="url(#pink)"/><path d="M202 279L351 247V426H202Z" fill="url(#pink)"/><path d="M202 279L58 235V326Z" fill="url(#pink)"/><path d="M200 136L335 170L352 238L206 279Z" fill="url(#dots)" opacity=".65"/><path d="M67 337L141 315L198 411H65Z" fill="url(#dark-dots)" opacity=".5"/></g>'
svg+=f'<path d="{ring(202,279,103,68)}" fill="url(#violet)" fill-rule="evenodd"/>'
svg+='<g clip-path="url(#o-inner)"><path d="M199 279L320 242L318 381L201 395Z" fill="url(#pink)"/><path d="M200 279V400L100 346Z" fill="#f6efe3"/><path d="M262 172L330 189V390H252Z" fill="url(#dots)" opacity=".38"/></g>'
svg+='<circle cx="202" cy="279" r="117" fill="none" stroke="#f6efe3" stroke-width="1.3" opacity=".86"/><circle cx="202" cy="279" r="87" fill="none" stroke="#e8c2f1" stroke-width="1.6"/><circle cx="202" cy="279" r="63" fill="#151322" stroke="#f7eede" stroke-width="2.4"/>'
svg+='<path d="M192 127L197 213M204 344L207 429M52 327L141 296M261 256L345 223" stroke="#f9f1e8" stroke-width="2.2"/>'
svg+='''<g id="judgement-geki" transform="rotate(-20 202 279)"><path d="M159 236H245V322H159Z" fill="url(#plate)" stroke="#e46ac3" stroke-width="2.4"/><path d="M165 241H240" stroke="#eaaae4" stroke-width="1"/>'''
svg+='<g fill="#fff3df">'+glyph('激',167,304,70)+'</g></g></g>'
# C is an actual continuous curve with circle endpoints, slider ticks and reverse arrow.
curve='M491 189C440 193 402 223 392 268C380 318 421 352 501 321'
svg+='<g id="C-curved-slider">'
svg+=f'<path d="{curve}" fill="none" stroke="#f7eee2" stroke-width="64" stroke-linecap="round"/>'
svg+=f'<path d="{curve}" fill="none" stroke="url(#c-track)" stroke-width="35" stroke-linecap="round"/>'
svg+=f'<path d="{curve}" fill="none" stroke="#ee8bc6" stroke-width="60" stroke-linecap="round" clip-path="url(#c-lower)"/>'
svg+=f'<path d="{curve}" fill="none" stroke="#f8ecec" stroke-width="1.5" opacity=".82"/>'
for x,y in [(443,202),(409,233),(390,276),(402,314),(442,334)]:svg+=f'<circle cx="{x}" cy="{y}" r="2.5" fill="#f7eee2"/>'
svg+='''<circle cx="491" cy="189" r="31" fill="#ae49cb" stroke="#fff4ec" stroke-width="3"/><circle cx="491" cy="189" r="22" fill="none" stroke="#d596e7" stroke-width="1.4"/><circle cx="491" cy="189" r="16" fill="#fff1e9"/>
<circle cx="501" cy="321" r="25" fill="#e164b3" stroke="#fff3e7" stroke-width="3"/><circle cx="501" cy="321" r="15" fill="#fff0e6"/><path d="M502 313L494 321L502 329M508 313L500 321L508 329" fill="none" stroke="#b443a7" stroke-width="2.5"/>
</g>'''
# L with high split upright, orthogonal track and ticks.
svg+='''<g id="L-linear-slider">
<path d="M546 57L589 42L591 267L697 231V281L547 334Z" fill="#f5eddf"/>
<path d="M547 286L590 270V318L547 334Z" fill="url(#violet)"/>
<path d="M602 84L631 74V254L602 265Z" fill="url(#violet)"/>
<path d="M610 84L619 81V234L610 237Z" fill="url(#dots)" opacity=".56"/>
<path d="M568 75V299L677 261" fill="none" stroke="#bda4cb" stroke-width="1.8"/>
<path d="M549 74L561 70V266L549 270Z" fill="url(#dark-dots)" opacity=".5"/>
<circle cx="568" cy="96" r="4" fill="#fffaf0" stroke="#bda4cb" stroke-width="1.4"/>
<circle cx="568" cy="147" r="2.4" fill="#bda4cb"/><circle cx="568" cy="192" r="2.4" fill="#bda4cb"/><circle cx="568" cy="269" r="2.4" fill="#bda4cb"/>
<path d="M669 256L678 260L673 269M662 258L671 262L666 271" fill="none" stroke="#875b9e" stroke-width="2"/>
</g>'''
# R is the reference's arch + structural cut-through leg, not a typeface R.
svg+='''<g id="R-arc-slider">
<path d="M711 101L755 85V285L712 300Z" fill="#f5eddf"/>
<path d="M735 93L755 85V285L735 292Z" fill="url(#dark-dots)" opacity=".36"/>
<path d="M754 85C801 66 843 75 863 108C884 141 872 174 842 194L802 154C823 145 825 128 808 119C793 109 773 115 755 128Z" fill="url(#violet)" stroke="#f8efe5" stroke-width="3"/>
<path d="M757 108C796 91 826 102 842 125C853 141 850 158 834 172" fill="none" stroke="#e0b1e9" stroke-width="1.7"/>
<path d="M791 78L838 85L869 125L867 162L840 180L816 152L816 119Z" fill="url(#dots)" opacity=".46"/>
<circle cx="842" cy="142" r="20" fill="#fff1e4"/><circle cx="842" cy="142" r="27" fill="none" stroke="#c885e0" stroke-width="1"/>
<path d="M713 155L753 137L892 259L837 276Z" fill="url(#pink)"/>
<path d="M713 155L753 137L765 148L726 167Z" fill="#f5eddf"/>
<path d="M759 157L863 250" stroke="#ffa7da" stroke-width="1.5"/>
<path d="M810 207L884 240L909 279L853 291Z" fill="url(#hatch)" clip-path="url(#r-leg)" opacity=".45"/>
<path d="M716 294L733 288V172L716 159Z" fill="url(#violet)" opacity=".82"/>
</g>'''
svg+='<g id="judgement-katu" transform="rotate(-19 910 103)"><path d="M880 67H940L946 113L925 140H880Z" fill="url(#plate)" stroke="#dc60b9" stroke-width="2.5"/><g fill="#fff2de">'+glyph('喝',883,124,54)+'</g></g>'
# Lower construction rail ties the letters to the season plate.
svg+='''<g id="season-rail">
<path d="M226 447L981 237" stroke="#f6eddf" stroke-width="6"/>
<path d="M226 455L975 247" stroke="#b859bc" stroke-width="1.4" opacity=".84"/>
<g transform="matrix(1 -.295 0 1 0 0)">
<path d="M710 536H959V663H710Z" fill="#171323" stroke="#e9d8e1" stroke-width="1.8"/>
<path d="M721 546H815V652H721Z" fill="#f3eadd"/>
<path d="M806 557H751C740 557 731 566 731 577V607H776V619H731V641H791C803 641 807 634 807 622V589H760V579H806Z" fill="#241832"/>
<path d="M824 568L845 549H873V652H846V580L824 594Z" fill="#f5eddf"/>
<path d="M885 568L907 549H938V652H909V580L885 595Z" fill="url(#pink)"/>
<path d="M828 605H842V648H828Z" fill="url(#hatch)" opacity=".66"/>
<path d="M946 546H953V652H946Z" fill="url(#dots)" opacity=".56"/>
<path d="M708 671H960" stroke="#d867b7" stroke-width="2"/>
</g>
</g>'''
# Cursor trail: a tapered, continuous path; follow points are a separate layer.
svg+='''<g id="cursor-trail">
<path d="M286 341C343 319 390 299 438 279C520 247 621 208 716 167L718 171C621 211 521 250 439 282C390 301 343 321 286 341Z" fill="url(#trail)" opacity=".9"/>
<path d="M17 394L74 365" fill="none" stroke="#f4eee8" stroke-width="1.4" opacity=".6"/>
<circle cx="68" cy="368" r="5" fill="#f7efe7"/>
</g>
<g id="follow-points" fill="#f9eee9" stroke="#aa4ec5" stroke-width="1.5">
'''
for i,(x,y) in enumerate([(438,279),(466,268),(495,256),(526,245),(556,233),(586,220),(624,207),(654,194),(685,182),(716,169)]):
    svg+=f'<circle cx="{x}" cy="{y}" r="{4.8+i*.22:.2f}" opacity="{.65+i*.035:.2f}"/>'
svg+='</g><g id="cursor-head"><circle cx="716" cy="169" r="12" fill="none" stroke="#dba1e7" stroke-width="1" opacity=".7"/><circle cx="716" cy="169" r="6" fill="#fff7ef"/></g>'
# Small timing blocks sit on the same axis; no decorative random noise.
svg+='<g id="timing-blocks" transform="matrix(1 -.295 0 1 0 0)">'
for i,color in enumerate(['#d966b4','#f18dcc','#a04cbe','#f5eddf']):svg+=f'<path d="M{312+i*17} 494h9v11h-9Z" fill="{color}"/>'
svg+='</g></svg>'
(ROOT/'oclr-s11-rhythm.svg').write_text(svg)
# Standalone art board with no font dependency in the actual logo.
board=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="850" viewBox="0 0 1600 850"><rect width="1600" height="850" fill="#151320"/><path d="M80 95H1520" stroke="#65556f" stroke-width="1"/><text x="80" y="67" fill="#c9b9d8" font-family="sans-serif" font-size="19" letter-spacing="3">osu! Chinese League Rookie</text><svg x="70" y="127" width="1460" height="660" viewBox="0 0 1040 470">{svg[svg.index('<defs>'):svg.rindex('</svg>')]}</svg></svg>'
(ROOT/'wordmark-board.svg').write_text(board)
subprocess.run(['rsvg-convert',str(ROOT/'wordmark-board.svg'),'-o',str(ROOT/'wordmark-board.png')],check=True)
print('Created native path wordmark and 1600x850 art board.')
