// Caption engine: tracked kicker, Anton headline with outline and hard shadow,
// a subline, and the optional Caveat sticky note.

var HEADLINE_FONT = '"Anton", "Impact", sans-serif';
var NOTE_FONT = '"Caveat", cursive';
var UI_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

function mixInk(color) {
  // A near-black ink derived from the headline colour's hue keeps the outline
  // and shadow in the same family without looking flat grey.
  var r = 24, g = 10, b = 20;
  if (color && color.charAt(0) === '#' && color.length === 7) {
    r = Math.max(8, Math.round(parseInt(color.slice(1, 3), 16) * 0.16));
    g = Math.max(6, Math.round(parseInt(color.slice(3, 5), 16) * 0.12));
    b = Math.max(8, Math.round(parseInt(color.slice(5, 7), 16) * 0.16));
  }
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export function wrapText(ctx, text, maxWidth) {
  var words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  var lines = [];
  var line = words[0];
  for (var i = 1; i < words.length; i++) {
    var trial = line + ' ' + words[i];
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

function trackedText(ctx, text, x, y, tracking) {
  var chars = Array.from(String(text || ''));
  var total = 0;
  var widths = chars.map(function (ch) {
    var w = ctx.measureText(ch).width;
    total += w;
    return w;
  });
  total += tracking * Math.max(0, chars.length - 1);
  var cursor = x;
  ctx.textAlign = 'left';
  for (var i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + tracking;
  }
  return total;
}

function trackedWidth(ctx, text, tracking) {
  var chars = Array.from(String(text || ''));
  var total = 0;
  for (var i = 0; i < chars.length; i++) total += ctx.measureText(chars[i]).width;
  return total + tracking * Math.max(0, chars.length - 1);
}

export function drawCaption(ctx, width, height, state, layout) {
  var margin = width * 0.048;
  var ink = mixInk(state.headlineColor);
  var cream = state.headlineColor;

  // Bottom scrim so the lettering stays legible over any photo.
  var scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
  scrim.addColorStop(0, 'rgba(10, 5, 12, 0)');
  scrim.addColorStop(0.62, 'rgba(10, 5, 12, 0.34)');
  scrim.addColorStop(1, 'rgba(10, 5, 12, 0.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height * 0.52, width, height * 0.48);

  // Kicker, top-left.
  if (state.kicker) {
    var kickerSize = Math.round(width * 0.0145);
    ctx.save();
    var kickerPlate = ctx.createLinearGradient(0, 0, width * 0.62, 0);
    kickerPlate.addColorStop(0, 'rgba(9, 4, 12, 0.5)');
    kickerPlate.addColorStop(1, 'rgba(9, 4, 12, 0)');
    ctx.fillStyle = kickerPlate;
    ctx.fillRect(0, height * 0.028, width * 0.62, height * 0.062);
    ctx.shadowColor = 'rgba(6, 3, 8, 0.8)';
    ctx.shadowBlur = width * 0.006;
    ctx.font = '600 ' + kickerSize + 'px ' + UI_FONT;
    ctx.fillStyle = cream;
    ctx.globalAlpha = 0.94;
    var tracking = width * 0.0042;
    var kickerY = height * 0.062;
    trackedText(ctx, state.kicker.toUpperCase(), margin, kickerY, tracking);
    ctx.globalAlpha = 0.72;
    ctx.fillRect(margin, kickerY + kickerSize * 0.85, width * 0.085, Math.max(2, width * 0.0015));
    ctx.restore();
  }

  // Headline, bottom-anchored above the subline.
  var size = Math.round(state.headlineSize * width);
  var maxWidth = width - margin * 2;
  ctx.save();
  ctx.font = size + 'px ' + HEADLINE_FONT;
  var lines = wrapText(ctx, (state.headline || '').toUpperCase(), maxWidth);
  var lineHeight = size * 0.94;
  var subSize = Math.round(width * 0.0195);
  var subBaseline = layout.captionBottom * height - height * 0.008;
  var bottomLine = subBaseline - subSize * 1.9;
  var shadowX = size * 0.05;
  var shadowY = size * 0.075;

  for (var i = lines.length - 1; i >= 0; i--) {
    var baseline = bottomLine - (lines.length - 1 - i) * lineHeight;
    var textWidth = ctx.measureText(lines[i]).width;
    var x = (width - textWidth) / 2;

    ctx.font = size + 'px ' + HEADLINE_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.9;
    ctx.fillText(lines[i], x + shadowX, baseline + shadowY);

    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(3, size * 0.058);
    ctx.strokeText(lines[i], x, baseline);

    ctx.fillStyle = cream;
    ctx.fillText(lines[i], x, baseline);
  }
  ctx.restore();

  // Subline, tracked small caps under the headline.
  if (state.subline) {
    ctx.save();
    ctx.font = '700 ' + subSize + 'px ' + UI_FONT;
    ctx.fillStyle = cream;
    ctx.globalAlpha = 0.95;
    var subTracking = width * 0.0033;
    var subText = state.subline.toUpperCase();
    var subWidth = trackedWidth(ctx, subText, subTracking);
    ctx.translate((width - subWidth) / 2, subBaseline);
    trackedText(ctx, subText, 0, 0, subTracking);
    ctx.restore();
  }

  if (state.noteOn && state.noteText) {
    drawNote(ctx, width, height, state, margin);
  }
}

function drawNote(ctx, width, height, state, margin) {
  var noteW = width * 0.245;
  var pad = width * 0.018;
  var fontSize = Math.round(width * 0.024);
  ctx.save();
  ctx.font = '600 ' + fontSize + 'px ' + NOTE_FONT;
  var lines = wrapText(ctx, state.noteText, noteW - pad * 2);
  if (!lines.length) { ctx.restore(); return; }
  var lineHeight = fontSize * 1.06;
  var noteH = Math.min(height * 0.24, pad * 2 + lines.length * lineHeight + width * 0.008);

  ctx.translate(width - margin * 1.6 - noteW, height * 0.115 + noteH / 2);
  ctx.rotate((-4.5 * Math.PI) / 180);
  ctx.translate(0, -noteH / 2);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = width * 0.012;
  ctx.shadowOffsetY = width * 0.006;
  ctx.fillStyle = '#f2e6bc';
  ctx.fillRect(0, 0, noteW, noteH);
  ctx.shadowColor = 'transparent';

  // Folded corner.
  ctx.fillStyle = '#d9c894';
  ctx.beginPath();
  ctx.moveTo(noteW - width * 0.026, 0);
  ctx.lineTo(noteW, 0);
  ctx.lineTo(noteW, width * 0.026);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(62, 40, 30, 0.28)';
  ctx.lineWidth = Math.max(1, width * 0.0012);
  ctx.strokeRect(width * 0.006, width * 0.006, noteW - width * 0.012, noteH - width * 0.012);

  ctx.fillStyle = '#33202b';
  ctx.font = '600 ' + fontSize + 'px ' + NOTE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], pad, pad + i * lineHeight);
  }
  ctx.restore();
}
