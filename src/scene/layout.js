export const colors = {
  cream: '#eeebd4',
  ink: '#111111',
  charcoal: '#3e3529',
  muted: '#756c5b',
  terracotta: '#d3481b',
  terracottaSoft: '#e06e49',
  wood: '#6a5138',
  woodDark: '#3e3529',
  woodLight: '#8b6d4a',
  plaster: '#e4dec4',
  sunset: '#c45a32',
  sunsetHi: '#e08a55',
  skyShack: '#c56a42',
  skyMap: '#a4ccdf',
  waterShack: '#23718f',
  waterMap: '#207caa',
  sand: '#c4b48a',
}

export const MAP_Y = -50

export const islands = {
  browser: [-10, MAP_Y, 7],
  server: [0, MAP_Y, -7],
  provider: [10, MAP_Y, 7],
  mcp: [0, MAP_Y, -20],
}

export const sheet = {
  position: [0, -41, 3],
  cam: { position: [0, 5, 55], lookAt: [0, -27, -2] },
}

export const shackCam = {
  title: { position: [0, 1.65, 3.45], lookAt: [0, 1.3, -2.4] },
  table: { position: [0, 2.45, .65], lookAt: [0, .84, -1.15] },
  close: { position: [0.12, 1.48, 2.2], lookAt: [0, 1.2, -2.4] },
  thanks: { position: [0, 1.8, -10], lookAt: [0, 2, -62] },
}

export const mapCam = {
  codeWall: { position: [65, -27, 28], lookAt: [65, -49, -2] },
  halfOverview: { position: [26, -18, 28], lookAt: [-2, -49, -2] },
  halfMcp: { position: [21, -27, 1.5], lookAt: [-1, -50, -11.5] },
  tool: { position: [12.87, -20.74, 3.77], lookAt: [5.57, -50.67, .27] },
  overview: { position: [0, -29, 28], lookAt: [0, -49, -2] },
  server: { position: [-9, -39, 10], lookAt: [-1, -48.5, -4] },
  clientHop: { position: [-10, -35, 21], lookAt: [-5, -49, 0] },
  parallel: { position: [0, -29, 27], lookAt: [0, -49, -2] },
  bridge: { position: [20, -29, 25], lookAt: [4, -48, 0] },
  mcp: { position: [15, -32, 7], lookAt: [0, -49, -13] },
  buoys: { position: [0, -29, 27], lookAt: [0, -49, -2] },
  wide: { position: [0, -32, 24], lookAt: [0, -49.5, -6] },
  takeaway: { position: [0, -24, 33], lookAt: [0, -45, -5] },
  hop: [
    { position: [-22, -30, 16], lookAt: [-5, -50.5, 0] },
    { position: [22, -30, 16], lookAt: [5, -50.5, 0] },
    { position: [30, -10, 40], lookAt: [5, -35, -2] },
    { position: [-30, -10, 40], lookAt: [-5, -35, -2] },
  ],
  ferry: [
    { position: [-13, -26, 17], lookAt: [-5, -48.5, 0] },
    { position: [13, -26, 17], lookAt: [5, -48.5, 0] },
    { position: [15, -25, 18], lookAt: [5, -48.5, 0] },
    { position: [-15, -25, 18], lookAt: [-5, -48.5, 0] },
  ],
}

export const shackSlides = new Set(['title', 'the-map', 'close', 'thank-you'])
export const punchIds = new Set([
  'title',
  'the-map',
  'three-islands',
  'browser-request', 'provider-request', 'provider-response', 'browser-response', 'stream-events', 'transport-swap',
  'server-tool-punch',
  'client-tool-punch',
  'parallel-punch',
  'interrupt-punch',
  'mcp-punch',
  'middleware-punch',
  'close',
])
