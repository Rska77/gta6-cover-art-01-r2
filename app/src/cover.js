// The renderer. Everything here is synchronous: give it a canvas, the editor
// state and loaded images, and it paints a finished cover at canvas size.

import { layoutById } from './layouts.js';
import { gradeById, paintGrade, paintVignette } from './grades.js';
import { drawPanelPhoto, paintEmptyPanel } from './crop.js';
import { drawCaption } from './caption.js';
import { drawDecor } from './decor.js';

function resolveImage(state, images, panelIndex) {
  var slots = state.panelImages || [];
  var key = slots[panelIndex] || state.activePhotoId || null;
  return key && images[key] ? images[key] : null;
}

export function renderCover(canvas, state, images) {
  var ctx = canvas.getContext('2d');
  var width = canvas.width;
  var height = canvas.height;
  var layout = layoutById(state.layoutId);
  var grade = gradeById(state.gradeId);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0c0710';
  ctx.fillRect(0, 0, width, height);

  // Panel wall.
  for (var i = 0; i < layout.panels.length; i++) {
    var p = layout.panels[i];
    var rect = { x: p.x * width, y: p.y * height, w: p.w * width, h: p.h * height };
    var image = resolveImage(state, images, i);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (image && image.naturalWidth) {
      var transform = (state.transforms && state.transforms[i]) || { panX: 0, panY: 0, zoom: 1, rotation: 0 };
      ctx.filter = grade.filter;
      drawPanelPhoto(ctx, image, rect, transform);
      ctx.filter = 'none';
    } else {
      paintEmptyPanel(ctx, rect, i);
    }

    paintGrade(ctx, width, height, grade, { x: rect.x, y: rect.y, fullW: width, fullH: height });
    ctx.restore();
  }

  // Print treatment over the whole wall.
  var wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, 'rgba(8, 4, 10, 0.28)');
  wall.addColorStop(0.34, 'rgba(8, 4, 10, 0.02)');
  wall.addColorStop(1, 'rgba(8, 4, 10, 0.2)');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'soft-light';
  paintVignette(ctx, width, height, grade);
  ctx.globalCompositeOperation = 'source-over';

  drawDecor(ctx, width, height, layout);
  drawCaption(ctx, width, height, state, layout);

  // Paper grain: a deterministic, low-opacity stipple that keeps the flat
  // canvas looking printed rather than clinical.
  drawGrain(ctx, width, height);

  ctx.restore();
}

function drawGrain(ctx, width, height) {
  var tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  var tctx = tile.getContext('2d');
  var data = tctx.createImageData(160, 160);
  var seed = 20260101;
  for (var i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    var v = seed % 255;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 16;
  }
  tctx.putImageData(data, 0, 0);
  var pattern = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
