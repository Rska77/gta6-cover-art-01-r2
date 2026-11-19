// Export presets and the PNG download path. Rendering happens on an offscreen
// canvas at the exact preset size, independent of the preview's CSS size.

import { renderCover } from './cover.js';

export const EXPORT_SIZES = [
  { id: 'square', label: 'Square', note: '1080 x 1080', width: 1080, height: 1080, filename: 'vice-sunset-cover-square.png' },
  { id: 'portrait', label: 'Portrait', note: '1080 x 1350', width: 1080, height: 1350, filename: 'vice-sunset-cover-portrait.png' },
  { id: 'wide', label: 'Widescreen', note: '1920 x 1080', width: 1920, height: 1080, filename: 'vice-sunset-cover-wide.png' }
];

export function renderExport(state, images, preset) {
  var canvas = document.createElement('canvas');
  canvas.width = preset.width;
  canvas.height = preset.height;
  renderCover(canvas, state, images);
  return canvas;
}

export function exportCover(state, images, preset) {
  var canvas = renderExport(state, images, preset);
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (!blob) { reject(new Error('Could not encode the PNG')); return; }
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = preset.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      resolve(blob);
    }, 'image/png');
  });
}
