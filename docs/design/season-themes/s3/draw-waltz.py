"""Original static vector artwork: three-beat snowflake choreography, no rings."""
from pathlib import Path
from math import cos, sin, pi

out = Path(__file__).resolve().parent
# Three phrases, each a strong lead followed by two lighter answering flakes.
phrases = [(705, 226, 108, -18), (1010, 83, 127, 12), (1270, 216, 145, 40)]
background = [(90, -18, 126, 10), (325, 310, 133, -10),
              (500, -45, 128, 24), (1370, -25, 101, 15)]
for theme in ['light', 'dark']:
    ink, aqua, light = ('#388db5', '#49b7c9', '#fff') if theme == 'light' else ('#b3e8f4', '#79d8de', '#e5faff')
    svg = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="320" viewBox="0 0 1400 320">
<defs><linearGradient id="sweep"><stop stop-color="{aqua}" stop-opacity="0"/><stop offset=".52" stop-color="{aqua}" stop-opacity=".15"/><stop offset="1" stop-color="{light}" stop-opacity=".07"/></linearGradient>
<linearGradient id="fade"><stop stop-color="white" stop-opacity=".18"/><stop offset=".45" stop-color="white" stop-opacity=".45"/><stop offset=".74" stop-color="white"/></linearGradient><mask id="field"><path fill="url(#fade)" d="M0 0h1400v320H0z"/></mask></defs>
<g mask="url(#field)">
<!-- Open, flowing ribbons: a lifted phrase, a turn, a soft landing. -->
<path d="M-100 340 C230 120 430 410 690 246 S985 -30 1195 120 S1420 340 1560 90 L1560 126 C1410 360 1330 230 1185 155 S910 80 695 278 S210 150 -100 365Z" fill="url(#sweep)"/>
''']
    for offset, opacity in [(-13, .13), (0, .22), (15, .09)]:
        svg.append(f'<path d="M-70 {330+offset} C230 {120+offset} 430 {410+offset} 690 {246+offset} S985 {-30+offset} 1195 {120+offset} S1420 {340+offset} 1560 {90+offset}" fill="none" stroke="{aqua}" stroke-width=".9" opacity="{opacity}"/>')

    def flake(x, y, r, rotation, opacity, kind=0):
        colour = aqua if kind == 1 else ink
        svg.append(f'<g transform="translate({x} {y}) rotate({rotation})" stroke="{colour}" stroke-opacity="{opacity}" stroke-width="{1.35 if r>70 else 1}" stroke-linecap="round" stroke-linejoin="round" fill="none">')
        for angle in range(0, 360, 60):
            svg.append(f'<g transform="rotate({angle})"><path d="M0 0V-{r} M0 -{r*.3}L-{r*.16} -{r*.45} M0 -{r*.3}L{r*.16} -{r*.45} M0 -{r*.57}L-{r*.24} -{r*.78} M0 -{r*.57}L{r*.24} -{r*.78} M0 -{r*.82}L-{r*.12} -{r*.96} M0 -{r*.82}L{r*.12} -{r*.96}"/>')
            # Translucent tapered crystal petal gives leading flakes delicate mass.
            if kind == 0:
                svg.append(f'<path d="M0 -{r*.16}L{r*.065} -{r*.4}L0 -{r*.69}L-{r*.065} -{r*.4}Z" fill="{light}" fill-opacity=".07" stroke-opacity=".45"/>')
            svg.append('</g>')
        points = ' '.join(f'{r*.13*cos(a*pi/3):.2f},{r*.13*sin(a*pi/3):.2f}' for a in range(6))
        svg.append(f'<polygon points="{points}" stroke-opacity=".5"/></g>')

    for x,y,r,rotation in background:
        flake(x,y,r,rotation,.24,1)
    for i,(x,y,r,rotation) in enumerate(phrases):
        flake(x,y,r,rotation,.62)
        flake(x-115,y-83,46,rotation+22,.4,1)
        flake(x+115,y+56,26,rotation+44,.48,2)
    for x,y,r,rotation in [(180,170,28,22),(410,175,38,8),(560,292,22,30),
                            (860,300,45,45),(1170,8,33,18),(1395,150,48,38)]:
        flake(x,y,r,rotation,.28,1)
    # Fine glints follow a rising and falling trajectory instead of uniform noise.
    for i in range(85):
        x = 180+i*15
        y = 178+89*sin((x-220)/160)+18*sin(i*2.4)
        size = .7+(i%3)*.35
        svg.append(f'<path d="M{x-size:.1f} {y:.1f}h{size*2:.1f} M{x:.1f} {y-size:.1f}v{size*2:.1f}" stroke="{light if theme=="dark" else ink}" stroke-width=".8" opacity="{.12+(i%3)*.06}"/>')
    svg.append('</g></svg>')
    (out/f'frost-field-{theme}.svg').write_text('\n'.join(svg)+'\n')
