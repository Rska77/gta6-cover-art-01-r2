// Five colour grades. Each one is a photo filter plus a gradient wash painted
// with a canvas blend mode, and a vignette strength applied to the full cover.

export const GRADES = [
  {
    id: 'vice-sunset',
    name: 'Vice Sunset',
    angle: 118,
    stops: ['#ff9a3c', '#ff4d6d', '#8c2bb8'],
    blend: 'overlay',
    alpha: 0.62,
    filter: 'saturate(1.35) contrast(1.08) brightness(1.02)',
    vignette: 0.34
  },
  {
    id: 'neon-night',
    name: 'Neon Night',
    angle: 34,
    stops: ['#ff2bd6', '#6a3cff', '#21e6ff'],
    blend: 'overlay',
    alpha: 0.58,
    filter: 'saturate(1.5) contrast(1.18) brightness(0.92)',
    vignette: 0.46
  },
  {
    id: 'ocean-drive',
    name: 'Ocean Drive',
    angle: 162,
    stops: ['#2fd9c4', '#7ff0e4', '#c8f7ff'],
    blend: 'soft-light',
    alpha: 0.8,
    filter: 'saturate(1.15) contrast(1.02) brightness(1.06)',
    vignette: 0.22
  },
  {
    id: 'palm-dusk',
    name: 'Palm Dusk',
    angle: 126,
    stops: ['#5b2a8a', '#b34b8a', '#ffb45c'],
    blend: 'overlay',
    alpha: 0.6,
    filter: 'saturate(1.2) contrast(1.06) brightness(0.98)',
    vignette: 0.4
  },
  {
    id: 'monochrome-noir',
    name: 'Monochrome Noir',
    angle: 90,
    stops: ['#050507', '#f3efe6'],
    blend: 'soft-light',
    alpha: 0.55,
    filter: 'grayscale(1) contrast(1.5) brightness(0.96)',
    vignette: 0.55
  }
];

export function gradeById(id) {
  return GRADES.find(function (grade) { return grade.id === id; }) || GRADES[0];
}

export function gradeCss(grade) {
  return 'linear-gradient(' + grade.angle + 'deg, ' + grade.stops.join(', ') + ')';
}

// Paint the wash inside a panel canvas. The gradient is measured against the
// whole cover (frame) so separate panels read as one continuous grade.
export function paintGrade(ctx, panelW, panelH, grade, frame) {
  frame = frame || { x: 0, y: 0, fullW: panelW, fullH: panelH };
  var angle = (grade.angle * Math.PI) / 180;
  var dx = Math.cos(angle);
  var dy = Math.sin(angle);
  var length = Math.abs(dx) * frame.fullW + Math.abs(dy) * frame.fullH;
  var cx = frame.fullW / 2 - frame.x;
  var cy = frame.fullH / 2 - frame.y;
  var gradient = ctx.createLinearGradient(
    cx - (dx * length) / 2,
    cy - (dy * length) / 2,
    cx + (dx * length) / 2,
    cy + (dy * length) / 2
  );
  for (var i = 0; i < grade.stops.length; i++) {
    gradient.addColorStop(i / (grade.stops.length - 1), grade.stops[i]);
  }
  ctx.save();
  ctx.globalCompositeOperation = grade.blend;
  ctx.globalAlpha = grade.alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, panelW, panelH);
  ctx.restore();
}

// One vignette over the finished panel wall, not one per tile.
export function paintVignette(ctx, width, height, grade) {
  if (!grade.vignette) return;
  var radius = Math.max(width, height) * 0.72;
  var gradient = ctx.createRadialGradient(
    width / 2, height * 0.46, radius * 0.24,
    width / 2, height * 0.5, radius
  );
  gradient.addColorStop(0, 'rgba(8, 6, 10, 0)');
  gradient.addColorStop(0.7, 'rgba(8, 6, 10, ' + grade.vignette * 0.35 + ')');
  gradient.addColorStop(1, 'rgba(8, 6, 10, ' + grade.vignette + ')');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
