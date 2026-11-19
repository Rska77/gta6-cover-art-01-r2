// Editor state and wiring. Every control ends in render(), which repaints the
// preview canvas from the same renderer the exporter uses.

import { LAYOUTS, layoutById, panelAtPoint } from './layouts.js';
import { GRADES, gradeById, gradeCss } from './grades.js';
import { defaultTransform, clampTransform } from './crop.js';
import { renderCover } from './cover.js';
import { EXPORT_SIZES, exportCover } from './export.js';

var PREVIEW_W = 1080;
var PREVIEW_H = 1350;

var state = {
  layoutId: 'hero-stack',
  gradeId: 'vice-sunset',
  headline: 'VICE SUNSET',
  subline: 'EVERY STREET HAS A PRICE',
  kicker: 'THE CITY THAT NEVER SLEEPS IN',
  headlineSize: 0.125,
  headlineColor: '#f6ead6',
  noteOn: false,
  noteText: 'meet me at the pier, golden hour',
  activePhotoId: null,
  targetPanel: -1,
  panelImages: [],
  transforms: []
};

var images = {};
var photoStore = [];
var selectedPhotoId = null;
var loaded = false;
var toastTimer = null;

for (var t = 0; t < 8; t++) state.transforms.push(defaultTransform());

var canvas = document.getElementById('cover-canvas');
var stage = document.getElementById('stage');
var thumbsEl = document.getElementById('photo-thumbs');
var targetsEl = document.getElementById('panel-targets');
var layoutGrid = document.getElementById('layout-grid');
var gradeGrid = document.getElementById('grade-grid');
var noteField = document.getElementById('note-field');
var toastEl = document.getElementById('toast');

canvas.width = PREVIEW_W;
canvas.height = PREVIEW_H;

function currentLayout() {
  return layoutById(state.layoutId);
}

function clampTarget() {
  var count = currentLayout().panels.length;
  if (state.targetPanel >= count) state.targetPanel = -1;
}

function panelLabel(index) {
  return index === currentLayout().hero ? 'Hero' : 'Panel ' + (index + 1);
}

var stageCaption = document.getElementById('stage-caption');
var LAYOUT_NAMES = {};
LAYOUTS.forEach(function (layout) { LAYOUT_NAMES[layout.id] = layout.name; });
var GRADE_NAMES = {};
GRADES.forEach(function (grade) { GRADE_NAMES[grade.id] = grade.name; });

function render() {
  clampTarget();
  renderCover(canvas, state, images);
  if (stageCaption) {
    stageCaption.textContent = '1080 × 1350 · ' + LAYOUT_NAMES[state.layoutId] + ' · ' + GRADE_NAMES[state.gradeId];
  }
}

function scheduleRender() {
  if (!loaded) return;
  render();
}

/* ---------- photos ---------- */

function addPhoto(source, name) {
  var id = 'photo-' + (photoStore.length + 1);
  var image = new Image();
  image.decoding = 'async';
  image.src = source;
  image.onload = function () {
    render();
    updateStatus();
  };
  image.onerror = function () {
    showToast('That file could not be read as an image.');
  };
  images[id] = image;
  photoStore.push({ id: id, name: name, image: image });
  return id;
}

function choosePhoto(id) {
  if (!images[id]) return;
  selectedPhotoId = id;
  if (state.targetPanel >= 0) {
    state.panelImages[state.targetPanel] = id;
  } else {
    state.activePhotoId = id;
    state.panelImages = [];
  }
  renderPhotoThumbs();
  scheduleRender();
}

function renderPhotoThumbs() {
  thumbsEl.textContent = '';
  photoStore.forEach(function (photo) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb' + (photo.id === selectedPhotoId ? ' is-selected' : '');
    button.title = 'Use ' + photo.name;
    button.setAttribute('aria-pressed', photo.id === selectedPhotoId ? 'true' : 'false');

    var img = document.createElement('img');
    img.src = photo.image.src;
    img.alt = '';
    img.draggable = false;
    button.appendChild(img);

    var label = document.createElement('span');
    label.className = 'thumb-label';
    label.textContent = photo.name;
    button.appendChild(label);

    button.addEventListener('click', function () { choosePhoto(photo.id); });
    thumbsEl.appendChild(button);
  });
}

function renderTargets() {
  var layout = currentLayout();
  targetsEl.textContent = '';

  var all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (state.targetPanel === -1 ? ' is-selected' : '');
  all.textContent = 'All panels';
  all.addEventListener('click', function () {
    state.targetPanel = -1;
    renderTargets();
    highlightPanel();
  });
  targetsEl.appendChild(all);

  layout.panels.forEach(function (panel, index) {
    var chip = document.createElement('button');
    chip.type = 'button';
    var isHero = index === layout.hero;
    chip.className = 'chip' + (state.targetPanel === index ? ' is-selected' : '') + (isHero ? ' is-hero' : '');
    chip.textContent = isHero ? 'Hero' : String(index + 1);
    chip.title = panelLabel(index) + ' — click to crop this panel';
    chip.addEventListener('click', function () {
      state.targetPanel = index;
      renderTargets();
      highlightPanel();
    });
    targetsEl.appendChild(chip);
  });
}

function highlightPanel() {
  stage.classList.toggle('has-panel-target', state.targetPanel >= 0);
}

/* ---------- layout + grade buttons ---------- */

function layoutIcon(layout) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('layout-icon');
  layout.panels.forEach(function (p, index) {
    var rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(p.x * 40));
    rect.setAttribute('y', String(p.y * 40));
    rect.setAttribute('width', String(p.w * 40));
    rect.setAttribute('height', String(p.h * 40));
    rect.setAttribute('rx', '1.2');
    rect.setAttribute('class', index === layout.hero ? 'hero-cell' : 'cell');
    svg.appendChild(rect);
  });
  return svg;
}

function buildLayoutButtons() {
  LAYOUTS.forEach(function (layout) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile';
    button.dataset.id = layout.id;
    button.appendChild(layoutIcon(layout));
    var label = document.createElement('span');
    label.textContent = layout.name;
    button.appendChild(label);
    button.addEventListener('click', function () {
      state.layoutId = layout.id;
      state.targetPanel = -1;
      clampTarget();
      renderLayoutButtons();
      renderTargets();
      highlightPanel();
      scheduleRender();
    });
    layoutGrid.appendChild(button);
  });
  renderLayoutButtons();
}

function renderLayoutButtons() {
  Array.prototype.forEach.call(layoutGrid.children, function (button) {
    var on = button.dataset.id === state.layoutId;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function buildGradeButtons() {
  GRADES.forEach(function (grade) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile grade-tile';
    button.dataset.id = grade.id;

    var swatch = document.createElement('span');
    swatch.className = 'grade-swatch';
    swatch.style.background = gradeCss(grade);
    button.appendChild(swatch);

    var label = document.createElement('span');
    label.textContent = grade.name;
    button.appendChild(label);

    button.addEventListener('click', function () {
      state.gradeId = grade.id;
      renderGradeButtons();
      scheduleRender();
    });
    gradeGrid.appendChild(button);
  });
  renderGradeButtons();
}

function renderGradeButtons() {
  Array.prototype.forEach.call(gradeGrid.children, function (button) {
    var on = button.dataset.id === state.gradeId;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* ---------- caption controls ---------- */

function bindCaption() {
  var headline = document.getElementById('headline');
  var subline = document.getElementById('subline');
  var kicker = document.getElementById('kicker');
  var size = document.getElementById('headline-size');
  var sizeValue = document.getElementById('headline-size-value');
  var colour = document.getElementById('headline-color');
  var noteToggle = document.getElementById('note-toggle');
  var noteText = document.getElementById('note-text');

  headline.value = state.headline;
  subline.value = state.subline;
  kicker.value = state.kicker;
  size.value = String(state.headlineSize);
  colour.value = state.headlineColor;
  noteToggle.checked = state.noteOn;
  noteText.value = state.noteText;

  headline.addEventListener('input', function () {
    state.headline = headline.value;
    scheduleRender();
  });
  subline.addEventListener('input', function () {
    state.subline = subline.value;
    scheduleRender();
  });
  kicker.addEventListener('input', function () {
    state.kicker = kicker.value;
    scheduleRender();
  });
  size.addEventListener('input', function () {
    state.headlineSize = Number(size.value);
    sizeValue.textContent = Math.round(state.headlineSize * 100) + '%';
    scheduleRender();
  });
  colour.addEventListener('input', function () {
    state.headlineColor = colour.value;
    renderSwatches();
    scheduleRender();
  });
  noteToggle.addEventListener('change', function () {
    state.noteOn = noteToggle.checked;
    noteField.classList.toggle('is-off', !state.noteOn);
    scheduleRender();
  });
  noteText.addEventListener('input', function () {
    state.noteText = noteText.value;
    scheduleRender();
  });

  sizeValue.textContent = Math.round(state.headlineSize * 100) + '%';
  noteField.classList.toggle('is-off', !state.noteOn);

  document.querySelectorAll('.swatch').forEach(function (swatch) {
    swatch.addEventListener('click', function () {
      state.headlineColor = swatch.dataset.color;
      colour.value = state.headlineColor;
      renderSwatches();
      scheduleRender();
    });
  });
  renderSwatches();
}

function renderSwatches() {
  document.querySelectorAll('.swatch').forEach(function (swatch) {
    swatch.classList.toggle('is-selected', swatch.dataset.color.toLowerCase() === state.headlineColor.toLowerCase());
  });
}

/* ---------- crop controls ---------- */

function activeTransforms() {
  if (state.targetPanel >= 0) return [state.targetPanel];
  return currentLayout().panels.map(function (_, index) { return index; });
}

function readCropControls() {
  var panel = state.transforms[activeTransforms()[0]] || defaultTransform();
  document.getElementById('crop-zoom').value = String(panel.zoom);
  document.getElementById('crop-rotate').value = String(panel.rotation);
  document.getElementById('crop-zoom-value').textContent = Number(panel.zoom).toFixed(2) + 'x';
  document.getElementById('crop-rotate-value').textContent = Math.round(panel.rotation) + '°';
}

function bindCrop() {
  var zoom = document.getElementById('crop-zoom');
  var rotate = document.getElementById('crop-rotate');

  zoom.addEventListener('input', function () {
    activeTransforms().forEach(function (index) {
      state.transforms[index].zoom = Number(zoom.value);
    });
    document.getElementById('crop-zoom-value').textContent = Number(zoom.value).toFixed(2) + 'x';
    scheduleRender();
  });
  rotate.addEventListener('input', function () {
    activeTransforms().forEach(function (index) {
      state.transforms[index].rotation = Number(rotate.value);
    });
    document.getElementById('crop-rotate-value').textContent = Math.round(Number(rotate.value)) + '°';
    scheduleRender();
  });

  document.getElementById('crop-reset').addEventListener('click', function () {
    activeTransforms().forEach(function (index) {
      state.transforms[index] = defaultTransform();
    });
    readCropControls();
    scheduleRender();
  });

  readCropControls();
}

/* ---------- pointer interaction ---------- */

function pointerToPoint(event) {
  var bounds = canvas.getBoundingClientRect();
  return {
    nx: (event.clientX - bounds.left) / bounds.width,
    ny: (event.clientY - bounds.top) / bounds.height
  };
}

var drag = null;

canvas.addEventListener('pointerdown', function (event) {
  if (event.button !== 0) return;
  var point = pointerToPoint(event);
  var index = panelAtPoint(currentLayout(), point.nx, point.ny);
  if (index < 0) return;

  state.targetPanel = index;
  renderTargets();
  highlightPanel();
  readCropControls();

  drag = {
    index: index,
    startX: event.clientX,
    startY: event.clientY,
    startPanX: state.transforms[index].panX,
    startPanY: state.transforms[index].panY
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', function (event) {
  var point = pointerToPoint(event);
  var hoverIndex = panelAtPoint(currentLayout(), point.nx, point.ny);
  canvas.classList.toggle('is-panning', hoverIndex >= 0);
  if (!drag) return;

  var panel = currentLayout().panels[drag.index];
  var bounds = canvas.getBoundingClientRect();
  var dx = (event.clientX - drag.startX) / bounds.width / panel.w;
  var dy = (event.clientY - drag.startY) / bounds.height / panel.h;
  var transform = state.transforms[drag.index];
  transform.panX = drag.startPanX + dx;
  transform.panY = drag.startPanY + dy;
  clampTransform(transform);
  scheduleRender();
});

function endDrag() {
  if (!drag) return;
  drag = null;
  canvas.classList.remove('is-dragging');
  readCropControls();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', function () {
  canvas.classList.remove('is-panning');
});

canvas.addEventListener('wheel', function (event) {
  var point = pointerToPoint(event);
  var index = panelAtPoint(currentLayout(), point.nx, point.ny);
  if (index < 0) return;
  event.preventDefault();
  state.targetPanel = index;
  var transform = state.transforms[index];
  var factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
  transform.zoom = transform.zoom * factor;
  clampTransform(transform);
  renderTargets();
  highlightPanel();
  readCropControls();
  scheduleRender();
}, { passive: false });

/* ---------- photo loading ---------- */

function loadFiles(fileList) {
  var files = Array.prototype.filter.call(fileList || [], function (file) {
    return file.type.indexOf('image/') === 0;
  });
  if (!files.length) {
    showToast('Choose image files (JPG, PNG, WebP).');
    return;
  }
  var firstId = null;
  files.forEach(function (file) {
    var url = URL.createObjectURL(file);
    var id = addPhoto(url, file.name.replace(/\.[^.]+$/, ''));
    if (!firstId) firstId = id;
  });
  selectedPhotoId = firstId;
  if (state.targetPanel >= 0) {
    state.panelImages[state.targetPanel] = firstId;
  } else {
    state.activePhotoId = firstId;
    state.panelImages = [];
  }
  renderPhotoThumbs();
  render();
  showToast(files.length + (files.length > 1 ? ' photos added' : ' photo added'));
}

function bindPhotoInput() {
  var input = document.getElementById('photo-input');
  input.addEventListener('change', function () {
    loadFiles(input.files);
    input.value = '';
  });

  var dock = document.getElementById('photo-drop');
  ['dragenter', 'dragover'].forEach(function (type) {
    dock.addEventListener(type, function (event) {
      event.preventDefault();
      dock.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dock.addEventListener(type, function (event) {
      event.preventDefault();
      dock.classList.remove('is-over');
    });
  });
  dock.addEventListener('drop', function (event) {
    loadFiles(event.dataTransfer.files);
  });

  // Dropping anywhere on the editor works too.
  var editor = document.getElementById('editor');
  editor.addEventListener('dragover', function (event) { event.preventDefault(); });
  editor.addEventListener('drop', function (event) {
    if (event.target.closest('#photo-drop')) return;
    event.preventDefault();
    loadFiles(event.dataTransfer.files);
  });
}

/* ---------- export ---------- */

function buildExportButtons() {
  var wrap = document.getElementById('export-buttons');
  EXPORT_SIZES.forEach(function (preset) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-button';
    button.dataset.id = preset.id;

    var label = document.createElement('span');
    label.className = 'export-label';
    label.textContent = preset.label;

    var note = document.createElement('span');
    note.className = 'export-note';
    note.textContent = preset.note;

    button.appendChild(label);
    button.appendChild(note);
    button.addEventListener('click', function () {
      if (button.classList.contains('is-busy')) return;
      button.classList.add('is-busy');
      var original = note.textContent;
      note.textContent = 'Rendering…';
      exportCover(state, images, preset).then(function (blob) {
        note.textContent = original;
        button.classList.remove('is-busy');
        showToast(preset.label + ' PNG saved · ' + Math.round(blob.size / 1024) + ' KB');
      }).catch(function (error) {
        note.textContent = original;
        button.classList.remove('is-busy');
        showToast(error.message || 'Export failed.');
      });
    });
    wrap.appendChild(button);
  });
}

/* ---------- misc ---------- */

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.remove('is-visible');
  }, 2600);
}

function updateStatus() {
  var count = photoStore.length;
  document.getElementById('photo-count').textContent = count + (count === 1 ? ' photo' : ' photos');
}

function bindChrome() {
  document.getElementById('preview-reset').addEventListener('click', function () {
    state.transforms = state.transforms.map(function () { return defaultTransform(); });
    state.targetPanel = -1;
    renderTargets();
    highlightPanel();
    readCropControls();
    scheduleRender();
    showToast('Crops reset');
  });
}

function boot() {
  buildLayoutButtons();
  buildGradeButtons();
  bindCaption();
  bindCrop();
  bindPhotoInput();
  bindChrome();
  buildExportButtons();
  renderTargets();

  addPhoto('samples/boulevard.jpg', 'Boulevard');
  var boulevardId = 'photo-1';
  addPhoto('samples/pier.jpg', 'Pier');
  selectedPhotoId = boulevardId;
  state.activePhotoId = boulevardId;
  renderPhotoThumbs();
  updateStatus();

  function renderWhenFontsReady() {
    loaded = true;
    renderPhotoThumbs();
    render();
    updateStatus();
  }

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('400 48px Anton'),
      document.fonts.load('600 28px Caveat')
    ]).then(renderWhenFontsReady).catch(renderWhenFontsReady);
  } else {
    renderWhenFontsReady();
  }
  loaded = true;
  render();
}

boot();

// Handy for the smoke test and for poking at the editor from the console.
window.ViceSunsetStudio = {
  state: state,
  images: images,
  render: render,
  renderCover: renderCover,
  exportCover: exportCover,
  sizes: EXPORT_SIZES
};
