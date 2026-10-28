"""Reproduce the actual-path Liru SVG (run with Python 3.12 and vtracer).

The alpha threshold removes nearly transparent rim haze from vector tracing.
This is a lossy color-region approximation, not a lossless vector conversion.
"""
from pathlib import Path
import subprocess
import tempfile
import vtracer

root = Path(__file__).resolve().parent / "assets"
with tempfile.TemporaryDirectory(prefix="oclr-liru-trace-") as tmp:
    trace_input = Path(tmp) / "input.png"
    subprocess.run([
        "magick", str(root / "liru-refined-v2.png"),
        "-channel", "A", "-threshold", "50%", "+channel", str(trace_input),
    ], check=True)
    output = root / "liru-refined-v2.svg"
    vtracer.convert_image_to_svg_py(
        str(trace_input), str(output), colormode="color", hierarchical="stacked",
        mode="spline", filter_speckle=2, color_precision=8, layer_difference=4,
        corner_threshold=90, length_threshold=3, max_iterations=10,
        splice_threshold=45, path_precision=3,
    )
    output.write_text(output.read_text().replace(
        'width="1024" height="1536"',
        'width="1024" height="1536" viewBox="0 0 1024 1536"', 1,
    ))
    subprocess.run([
        "rsvg-convert", "-w", "2048", "-h", "3072", str(output),
        "-o", str(root / "liru-refined-v2-vector-2048.png"),
    ], check=True)
