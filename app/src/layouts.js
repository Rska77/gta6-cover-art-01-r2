// Panel geometry for the cover. Every rectangle is a fraction of the canvas,
// so one layout works at 1:1, 4:5 and 16:9 without a second set of numbers.

export const LAYOUTS = [
  {
    id: 'quad-grid',
    name: 'Quad Grid',
    hero: 0,
    captionBottom: 0.935,
    panels: [
      { x: 0.022, y: 0.022, w: 0.471, h: 0.471 },
      { x: 0.507, y: 0.022, w: 0.471, h: 0.471 },
      { x: 0.022, y: 0.507, w: 0.471, h: 0.471 },
      { x: 0.507, y: 0.507, w: 0.471, h: 0.471 }
    ]
  },
  {
    id: 'hero-stack',
    name: 'Hero & Stack',
    hero: 0,
    captionBottom: 0.935,
    panels: [
      { x: 0.022, y: 0.022, w: 0.600, h: 0.956 },
      { x: 0.636, y: 0.022, w: 0.342, h: 0.309333 },
      { x: 0.636, y: 0.345333, w: 0.342, h: 0.309333 },
      { x: 0.636, y: 0.668667, w: 0.342, h: 0.309333 }
    ]
  },
  {
    id: 'hero-strip',
    name: 'Hero Over Strip',
    hero: 0,
    captionBottom: 0.655,
    panels: [
      { x: 0.022, y: 0.022, w: 0.956, h: 0.700 },
      { x: 0.022, y: 0.736, w: 0.309333, h: 0.242 },
      { x: 0.345333, y: 0.736, w: 0.309333, h: 0.242 },
      { x: 0.668667, y: 0.736, w: 0.309333, h: 0.242 }
    ]
  },
  {
    id: 'triptych',
    name: 'Triptych',
    hero: 1,
    captionBottom: 0.935,
    panels: [
      { x: 0.022, y: 0.022, w: 0.284, h: 0.956 },
      { x: 0.320, y: 0.022, w: 0.360, h: 0.956 },
      { x: 0.694, y: 0.022, w: 0.284, h: 0.956 }
    ]
  },
  {
    id: 'collage-four',
    name: 'Collage Four',
    hero: 0,
    captionBottom: 0.935,
    panels: [
      { x: 0.022, y: 0.022, w: 0.560, h: 0.600 },
      { x: 0.596, y: 0.022, w: 0.382, h: 0.600 },
      { x: 0.022, y: 0.636, w: 0.560, h: 0.342 },
      { x: 0.596, y: 0.636, w: 0.382, h: 0.342 }
    ]
  },
  {
    id: 'hero-band',
    name: 'Hero Band',
    hero: 0,
    captionBottom: 0.565,
    panels: [
      { x: 0.022, y: 0.022, w: 0.956, h: 0.600 },
      { x: 0.022, y: 0.636, w: 0.471, h: 0.342 },
      { x: 0.507, y: 0.636, w: 0.471, h: 0.342 }
    ]
  }
];

export function layoutById(id) {
  return LAYOUTS.find(function (layout) { return layout.id === id; }) || LAYOUTS[0];
}

// Which panel sits under a normalised canvas point, or -1 for the margin.
export function panelAtPoint(layout, nx, ny) {
  for (var i = layout.panels.length - 1; i >= 0; i--) {
    var p = layout.panels[i];
    if (nx >= p.x && nx <= p.x + p.w && ny >= p.y && ny <= p.y + p.h) return i;
  }
  return -1;
}
