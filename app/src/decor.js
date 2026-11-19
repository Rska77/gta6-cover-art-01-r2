// Cover furniture: hairlines around every panel, palm silhouettes, the issue
// credit and a small seal. Drawn after the grade so it sits on the print.

// A leaf blade's half-width along t: narrow at the stem, fullest a third of
// the way along, tapering to a point. Smooth throughout, never serrated.
function bladeProfile(t) {
  var clamped = Math.min(1, Math.max(0, t));
  // Swell quickly off the stem, then a long taper to a fine tip.
  var swell = Math.pow(clamped, 0.42);
  return Math.pow(Math.sin(Math.PI * Math.pow(swell, 0.92)), 1.15) * (1 - clamped * 0.1);
}

function palmFrond(ctx, x, y, angle, length, width, droop) {
  // A blade built around a quadratic spine: sample the spine, offset it by a
  // sin() width profile, and stroke the two sides as one closed outline. The
  // result is a smooth tapered leaf that arcs under its own weight.
  var cpx = length * 0.48;
  var cpy = length * droop;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  var steps = 18;
  var t, px, py, tx, ty, nx, ny, half;
  for (t = 0; t <= 1.0001; t += 1 / steps) {
    px = 2 * (1 - t) * t * cpx + t * t * length;
    py = 2 * (1 - t) * t * cpy;
    tx = 2 * (1 - t) * cpx + 2 * t * (length - cpx);
    ty = 2 * (1 - t) * cpy + 2 * t * (0 - cpy);
    var tl = Math.sqrt(tx * tx + ty * ty) || 1;
    nx = -ty / tl;
    ny = tx / tl;
    half = width * bladeProfile(t);
    if (t === 0) ctx.moveTo(px + nx * half, py + ny * half);
    else ctx.lineTo(px + nx * half, py + ny * half);
  }
  for (t = 1; t >= -0.0001; t -= 1 / steps) {
    px = 2 * (1 - t) * t * cpx + t * t * length;
    py = 2 * (1 - t) * t * cpy;
    tx = 2 * (1 - t) * cpx + 2 * t * (length - cpx);
    ty = 2 * (1 - t) * cpy + 2 * t * (0 - cpy);
    var tl2 = Math.sqrt(tx * tx + ty * ty) || 1;
    nx = -ty / tl2;
    ny = tx / tl2;
    half = width * bladeProfile(t);
    ctx.lineTo(px - nx * half, py - ny * half);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Fronds fan from a crown near the top-right, sweeping left and down-left.
// Angles are radians clockwise from the positive x axis (y points down).
var FRONDS = [
  { angle: -3.02, length: 0.58, droop: 0.36, width: 0.62 },
  { angle: -2.78, length: 0.8, droop: 0.32, width: 0.74 },
  { angle: -2.54, length: 0.98, droop: 0.28, width: 0.86 },
  { angle: -2.3, length: 1.1, droop: 0.24, width: 0.94 },
  { angle: -2.06, length: 1.2, droop: 0.22, width: 0.98 },
  { angle: -1.82, length: 1.26, droop: 0.2, width: 1 },
  { angle: -1.58, length: 1.2, droop: 0.2, width: 0.96 },
  { angle: -1.34, length: 1.08, droop: 0.22, width: 0.9 },
  { angle: 2.96, length: 0.96, droop: 0.26, width: 0.82 },
  { angle: 3.12, length: 0.78, droop: 0.3, width: 0.72 },
  { angle: 3.26, length: 0.6, droop: 0.34, width: 0.62 }
];

export function drawPalms(ctx, width, height) {
  // A palm in the top-right corner: slim curved trunk and a crown of smooth
  // fronds, fully inside the frame so it reads instantly as a palm.
  var crownX = width * 0.87;
  var crownY = height * 0.13;
  var unit = width * 0.15;
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#0b050f';

  // Trunk: a tapered band curving down to the right edge of the panel.
  ctx.beginPath();
  ctx.moveTo(crownX - width * 0.004, crownY + height * 0.004);
  ctx.quadraticCurveTo(width * 0.945, height * 0.34, width * 0.985, height * 0.66);
  ctx.lineTo(width * 1.008, height * 0.64);
  ctx.quadraticCurveTo(width * 0.972, height * 0.33, crownX + width * 0.006, crownY + height * 0.004);
  ctx.closePath();
  ctx.fill();

  for (var i = 0; i < FRONDS.length; i++) {
    var frond = FRONDS[i];
    palmFrond(ctx, crownX, crownY, frond.angle, unit * frond.length, unit * 0.066 * frond.width, frond.droop);
  }

  ctx.beginPath();
  ctx.arc(crownX, crownY, unit * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPanelBorders(ctx, width, height, layout) {
  var inset = width * 0.003;
  ctx.save();
  ctx.strokeStyle = 'rgba(246, 234, 214, 0.62)';
  ctx.lineWidth = Math.max(1.2, width * 0.002);
  for (var i = 0; i < layout.panels.length; i++) {
    var p = layout.panels[i];
    ctx.strokeRect(
      p.x * width + inset,
      p.y * height + inset,
      p.w * width - inset * 2,
      p.h * height - inset * 2
    );
  }
  ctx.restore();
}

export function drawCredit(ctx, width, height) {
  var size = Math.round(width * 0.0115);
  ctx.save();
  ctx.font = '600 ' + size + 'px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(246, 234, 214, 0.88)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  var text = 'COVER No. 01';
  var tracking = width * 0.0032;
  var cursor = width * 0.048;
  for (var i = 0; i < text.length; i++) {
    ctx.fillText(text.charAt(i), cursor, height - height * 0.026);
    cursor += ctx.measureText(text.charAt(i)).width + tracking;
  }
  ctx.restore();
}

export function drawSeal(ctx, width, height) {
  var r = width * 0.035;
  var cx = width - width * 0.048 - r;
  var cy = height - height * 0.03 - r;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(246, 234, 214, 0.9)';
  ctx.lineWidth = Math.max(1.4, width * 0.0022);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([width * 0.003, width * 0.0035]);
  ctx.lineWidth = Math.max(1, width * 0.0012);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(246, 234, 214, 0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 ' + Math.round(r * 0.66) + 'px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('VS', 0, -r * 0.06);
  ctx.font = '600 ' + Math.round(r * 0.24) + 'px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('EST. 2026', 0, r * 0.46);
  ctx.restore();
}

export function drawDecor(ctx, width, height, layout) {
  drawPanelBorders(ctx, width, height, layout);
  drawPalms(ctx, width, height);
  drawCredit(ctx, width, height);
  drawSeal(ctx, width, height);
}
