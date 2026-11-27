export const radarCenter = { x: 160, y: 120 };
export const radarRadius = 91;
export const broadcastRadarMaximum = 10;

export type RadarFrame = {
  radii: number[];
  visibility: number[];
  fill: number;
};

export function radarFrame(values: (number | null)[]): RadarFrame {
  return {
    radii: values.map((value) => value ?? 0),
    visibility: values.map((value) => (value === null ? 0 : 1)),
    fill: values.every((value) => value !== null) ? 1 : 0,
  };
}

export function radarGeometry({ radii, visibility }: RadarFrame) {
  const points = radii.map((value, index) => {
    const angle = (index / radii.length) * 2 * Math.PI - Math.PI / 2;
    const distance = value * radarRadius;
    return {
      x: radarCenter.x + Math.cos(angle) * distance,
      y: radarCenter.y + Math.sin(angle) * distance,
    };
  });
  return {
    points,
    polygon: points.map(({ x, y }) => `${x},${y}`).join(" "),
    segments: points
      .map((point, index) => {
        const next = (index + 1) % points.length;
        return visibility[index] > 0 && visibility[next] > 0
          ? `M ${point.x} ${point.y} L ${points[next].x} ${points[next].y}`
          : "";
      })
      .join(" "),
  };
}

export function paintRadar(plot: SVGGElement) {
  const area = plot.querySelector("polygon");
  const outline = plot.querySelector("path");
  const dots = plot.querySelectorAll("circle");
  return (frame: RadarFrame) => {
    const { points, polygon, segments } = radarGeometry(frame);
    area?.setAttribute("points", polygon);
    area?.setAttribute("opacity", String(frame.fill));
    outline?.setAttribute("d", segments);
    outline?.setAttribute(
      "opacity",
      String((1 - frame.fill) * Math.max(...frame.visibility)),
    );
    dots.forEach((dot, index) => {
      dot.setAttribute("cx", String(points[index].x));
      dot.setAttribute("cy", String(points[index].y));
      dot.setAttribute("opacity", String(frame.visibility[index]));
    });
  };
}
