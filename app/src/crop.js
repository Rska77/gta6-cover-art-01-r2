// Per-panel photo placement. A panel shows one photo, cover-fitted, then
// zoomed, rotated and panned by that panel's own transform.

export function defaultTransform() {
  return { panX: 0, panY: 0, zoom: 1, rotation: 0 };
}

export function clampTransform(t) {
  t.zoom = Math.min(3.5, Math.max(1, t.zoom || 1));
  t.rotation = Math.min(45, Math.max(-45, t.rotation || 0));
  t.panX = Math.min(2, Math.max(-2, t.panX || 0));
  t.panY = Math.min(2, Math.max(-2, t.panY || 0));
  return t;
}

export function drawPanelPhoto(ctx, image, rect, transform) {
  var t = clampTransform(transform);
  var scale = Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight) * t.zoom;
  ctx.save();
  ctx.translate(
    rect.x + rect.w / 2 + t.panX * rect.w,
    rect.y + rect.h / 2 + t.panY * rect.h
  );
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
}

// A soft dark field for a panel with no photo, so the grid still reads.
export function paintEmptyPanel(ctx, rect, index) {
  var gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  var shift = (index % 4) * 8;
  gradient.addColorStop(0, 'rgb(' + (30 + shift) + ', 22, 30)');
  gradient.addColorStop(1, 'rgb(' + (16 + shift) + ', 12, 20)');
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}
