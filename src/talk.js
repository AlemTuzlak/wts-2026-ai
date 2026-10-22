import { shackCam, mapCam } from './scene/layout.js'

export const talk = {
  timer: true,
  durationMinutes: 25,
  theme: {
    bg: '#eeebd4',
    ink: '#111111',
    accent: '#d3481b',
    muted: '#3e3529',
  },
}

const browserFetchLines = [
  'const response = await fetch(',
  "  '/api/chat',",
  '  init',
  ')',
  'if (!response.ok || !response.body)',
  "  throw Error('Request failed')",
]

const browserDeltaLines = [
  'if (',
  '  event.type ===',
  "    'response.output_text.delta' &&",
  "  typeof event.delta === 'string'",
  ') {',
  '  setAnswer(t => t + event.delta)',
  '}',
]

const serverRequestLines = [
  'const { messages } =',
  '  await request.json()',
  'const body = JSON.stringify({',
  "  model: 'gpt-5.5',",
  '  input: messages,',
  '  stream: true,',
  '})',
]

const serverFetchLines = [
  'const upstream = await fetch(',
  '  OPENAI_RESPONSES_URL,',
  '  {',
  "    method: 'POST',",
  '    headers: openaiHeaders,',
  '    body,',
  '    signal: request.signal,',
  '  }',
  ')',
]

const serverResponseLines = [
  'if (!upstream.ok || !upstream.body)',
  '  return new Response(null, {',
  '    status: 502,',
  '  })',
  'const { readable, writable } =',
  '  new TransformStream()',
  'const writer = writable.getWriter()',
  'void relay(writer)',
  'return new Response(readable, {',
  '  headers: {',
  "    'Content-Type':",
  "      'text/event-stream',",
  "    'Cache-Control': 'no-cache',",
  '  },',
  '})',
]

const browserResponseLines = [
  'const events = readSse(response.body)',
  'let completed = false',
  'for await (const event of events) {',
  '  switch (event.type) {',
  "    case 'response.output_text.delta':",
  "      if (typeof event.delta === 'string')",
  '        setAnswer(t => t + event.delta)',
  '      break',
  "    case 'response.completed':",
  '      completed = true',
  '      break',
  "    case 'response.failed':",
  "    case 'response.incomplete':",
  "    case 'error':",
  "      throw Error('Provider failed')",
  '  }',
  '  if (completed) break',
  '}',
  'if (!completed)',
  "  throw Error('Stream ended early')",
]

const readerLines = [
  ...[
    'async function* readSse(body) {',
    "  let line = ''",
    '  let data = []',
    '  let cr = false',
    '  const decoded = body.pipeThrough(',
    '    new TextDecoderStream()',
    '  )',
    '  for await (const text of decoded) {',
    '    for (const c of text) {',
    "      const skip = cr && c === '\\n'",
    "      cr = c === '\\r'",
    '      if (skip) continue',
    "      if (!cr && c !== '\\n') {",
    '        line += c',
    '        continue',
    '      }',
    "      if (line === '') {",
  ],
  ...[
    '        if (data.length) {',
    '          const json =',
    "            data.join('\\n')",
    '          yield JSON.parse(json)',
    '          data = []',
    '        }',
    '      } else if (',
    "        line.startsWith('data:')",
    '      ) {',
    '        data.push(line.slice(5))',
    "      } else if (line === 'data') {",
    "        data.push('')",
    '      }',
    "      line = ''",
    '    }',
    '  }',
    '}',
  ],
]

const scenes = [
  {
    id: 'title',
    camera: shackCam.title,
    form: 'title',
    kicker: 'WhatTheStack 2026',
    title: 'How TanStack AI made the hidden complexity of AI simple',
    steps: 1,
  },
  {
    id: 'the-map',
    camera: shackCam.table,
    form: 'statement',
    title: 'The whole agent loop fits on one treasure map.',
    steps: 1,
  },
  {
    id: 'three-islands',
    camera: mapCam.overview,
    form: 'punch',
    title: 'Every request visits Browser, Server, and Provider.',
    steps: 1,
  },
  {
    id: 'browser-request',
    camera: mapCam.hop[0],
    splitSide: 'left',
    form: 'punch',
    title: 'Browser sends a request to your server.',
    leg: 0,
    steps: 3,
    hopCode: {
      form: 'code',
      halfPanel: true,
      lang: 'jsx',
      titlesSteps: [
        'React form + answer',
        'Inside send: setup',
        'Inside send: fetch',
      ],
      linesSteps: [
        [
          'function ChatForm() {',
          '  const [answer, setAnswer] =',
          "    useState('')",
          '  // send is defined here, next.',
          '  return (',
          '    <form onSubmit={send}>',
          '      <input',
          '        name="prompt"',
          '        required',
          '      />',
          '      <button type="submit">',
          '        Send',
          '      </button>',
          '      <p>{answer}</p>',
          '    </form>',
          '  )',
          '}',
        ],
        [
          'async function send(event) {',
          '  event.preventDefault()',
          '  const data = new FormData(',
          '    event.currentTarget',
          '  )',
          "  setAnswer('')",
          '  const content = String(',
          "    data.get('prompt')",
          '  )',
          '  const init = {',
          "    method: 'POST',",
          '    headers: {',
          "      'Content-Type':",
          "        'application/json',",
          '    },',
          '    body: JSON.stringify({',
          '      messages: [',
          "        { role: 'user', content },",
          '      ],',
          '    }),',
          '  }',
        ],
        [
          'async function send(event) {',
          '  //... previous slide code',
          ...browserFetchLines.map((line) => `  ${line}`),
          '  const events = readSse(response.body)',
          '  for await (const event of events) {',
          ...browserDeltaLines.map((line) => `    ${line}`),
          '  }',
          '}',
        ],
      ],
      notesSteps: [
        'send belongs inside ChatForm. Next →',
        'Same send function continues next →',
        'readSse and terminal checks follow.',
      ],
    },
  },
  {
    id: 'provider-request',
    camera: mapCam.hop[1],
    splitSide: 'right',
    form: 'punch',
    title: 'Server sends a request to the LLM provider.',
    leg: 1,
    steps: 2,
    hopCode: {
      form: 'code',
      halfPanel: true,
      lang: 'jsx',
      titlesSteps: ['Read the request body', 'Forward to OpenAI'],
      linesSteps: [
        [
          'export async function POST(',
          '  request',
          ') {',
          ...serverRequestLines.map((line) => `  ${line}`),
          '}',
        ],
        [
          'export async function POST(',
          '  request',
          ') {',
          '  //... previous slide code',
          ...serverFetchLines.map((line) => `  ${line}`),
          '}',
        ],
      ],
      notesSteps: [
        'Auth and text-input validation omitted.',
        'Server-only URL and auth headers. Host links disconnect to request.signal.',
      ],
    },
  },
  {
    id: 'provider-response',
    camera: mapCam.hop[1],
    splitSide: 'right',
    form: 'punch',
    title: 'Provider responds with an SSE stream.',
    leg: 2,
    steps: 2,
    hopCode: {
      form: 'code',
      halfPanel: true,
      lang: 'jsx',
      titlesSteps: ['Return the SSE stream', 'Relay each byte chunk'],
      linesSteps: [
        [
          'export async function POST(',
          '  request',
          ') {',
          '  //... previous slide code',
          ...serverResponseLines.map((line) => `  ${line}`),
          '}',
        ],
        [
          'async function relay(writer) {',
          '  try {',
          '    for await (',
          '      const bytes of upstream.body',
          '    ) {',
          '      await writer.write(bytes)',
          '    }',
          '    await writer.close()',
          '  } catch (error) {',
          '    await writer.abort(error)',
          '  } finally {',
          '    writer.releaseLock()',
          '  }',
          '}',
        ],
      ],
      notesSteps: [
        'Return now, not after relay.',
        'Inner relay. write waits for capacity. Bytes already contain SSE frames.',
      ],
    },
  },
  {
    id: 'browser-response',
    camera: mapCam.hop[0],
    splitSide: 'left',
    form: 'punch',
    title: 'Server responds with an SSE stream.',
    leg: 3,
    steps: 2,
    hopCode: {
      form: 'code',
      halfPanel: true,
      lang: 'jsx',
      titlesSteps: ['Handle each response event', 'Read OpenAI JSON events'],
      linesSteps: [
        [
          'async function send(event) {',
          '  // ... previous frontend code',
          ...browserResponseLines.map((line) => `  ${line}`),
          '}',
        ],
        readerLines,
      ],
      notesSteps: [
        'Complete stops the loop. Failures throw.',
        'Keep partial frames. Drop unfinished data.',
      ],
    },
  },
  {
    id: 'stream-events',
    camera: mapCam.overview,
    form: 'punch',
    title: 'The full loop',
    steps: 1,
  },
  {
    id: 'tools-overview',
    camera: mapCam.overview,
    form: 'punch',
    title: 'What if we add tools?',
    steps: 1,
  },
  {
    id: 'client-tool-request',
    camera: {
      position: [-23.2012, -31.8785, 17.1306],
      lookAt: [-6.2012, -52.3785, 1.1306],
    },
    splitSide: 'left',
    form: 'code',
    halfPanel: true,
    lang: 'js',
    leg: 0,
    steps: 1,
    title: 'Send client tool definitions',
    lines: [
      'async function send(event) {',
      '  //... previous slide code',
      '  const clientTools = [{',
      "    type: 'function',",
      "    name: 'get_browser_time_zone',",
      "    description: 'Read the browser time zone.',",
      '    strict: true,',
      '    parameters: {',
      "      type: 'object',",
      '      properties: {},',
      '      required: [],',
      '      additionalProperties: false,',
      '    },',
      '  }]',
      '  init.body = JSON.stringify({',
      "    messages: [{ role: 'user', content }],",
      '    clientTools,',
      '  })',
      '  // Existing fetch and SSE reader follow.',
      '}',
    ],
    note: 'Setup only. Schemas travel; handlers stay in Browser.',
  },
  {
    id: 'server-tool-request',
    camera: mapCam.hop[1],
    splitSide: 'right',
    form: 'code',
    halfPanel: true,
    lang: 'js',
    leg: 1,
    steps: 1,
    title: 'Forward both tool definitions',
    lines: [
      'export async function POST(',
      '  request',
      ') {',
      '  const { messages, clientTools = [] } =',
      '    await request.json()',
      '  const serverTools = [{',
      "    type: 'function',",
      "    name: 'get_server_time',",
      "    description: 'Read the server time in UTC.',",
      '    strict: true,',
      '    parameters: {',
      "      type: 'object',",
      '      properties: {},',
      '      required: [],',
      '      additionalProperties: false,',
      '    },',
      '  }]',
      '  const body = JSON.stringify({',
      "    model: 'gpt-5.5',",
      '    input: messages,',
      '    tools: [...clientTools, ...serverTools],',
      '    stream: true,',
      '  })',
      '  //... previous slide code',
      '}',
    ],
    note: 'Setup only. Validate client names/schemas. Local dispatch follows.',
  },
  {
    id: 'server-tool-flow',
    camera: mapCam.overview,
    form: 'punch',
    title: 'A server tool flow',
    steps: 1,
    notesSteps: [
      'Wait for a complete function_call in response.completed. Dispatch only the known get_server_time name with validated arguments. Return function_call_output with the same call_id in a NEW Responses request, using previous_response_id and the same tools. This is a conceptual flow, not an added dispatcher in the earlier text-only code.',
    ],
  },
  {
    id: 'client-tool-flow',
    camera: mapCam.overview,
    form: 'punch',
    title: 'A client tool flow',
    steps: 1,
    notesSteps: [
      'Server forwards the complete get_browser_time_zone call to Browser. Browser runs its known local handler and returns the result through the app endpoint. Server matches the pending call_id and sends function_call_output in a NEW Responses request with previous_response_id and the same tools. Handle every call; failures and early EOF are not success. Repeat tool turns until a final answer.',
    ],
  },
  {
    id: 'mcp-punch',
    camera: mapCam.overview,
    form: 'punch',
    title: 'What if we added MCP?',
    steps: 1,
  },
  {
    id: 'middleware-lifecycle-overview',
    camera: mapCam.overview,
    form: 'punch',
    title: 'What if we need middleware?',
    steps: 1,
    notes:
      'The harbor master follows the run lifecycle. The ledger shows real ChatMiddleware hooks in run order: onConfig, onStart, onChunk, onBeforeToolCall, onAfterToolCall and onFinish. onConfig runs once at the start and again before each model call. onChunk runs for every chunk. Exactly one of onFinish, onAbort or onError ends a run. The list is not complete: onUsage, onIteration and more also exist.',
  },
  {
    id: 'middleware-cache',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if we need caching?',
    lines: [
      'import { toolCacheMiddleware }',
      "  from '@tanstack/ai/middlewares'",
      '',
      'const cache = toolCacheMiddleware({',
      '  ttl: 60_000,',
      "  toolNames: ['docs_search'],",
      '})',
      '',
      'chat({ ...options,',
      '  middleware: [',
      '    cache,',
      '  ],',
      '})',
    ],
    highlight: [10],
    note: 'Module scope. Cache a stable read-only tool.',
    notes:
      'This is an addition to the existing Server. options means its existing chat options. All middleware instances are created outside POST and reused across requests. docs_search is illustrative: the docs MCP server must expose a stable public read-only search tool. Do not cache the clocks. The default cache is process-local.',
  },
  {
    id: 'middleware-telemetry',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if we need telemetry?',
    lines: [
      'import { otelMiddleware }',
      "  from '@tanstack/ai/middlewares/otel'",
      'import { trace }',
      "  from '@opentelemetry/api'",
      '',
      'const telemetry = otelMiddleware({',
      "  tracer: trace.getTracer('talk'),",
      '})',
      '',
      'chat({ ...options,',
      '  middleware: [',
      '    telemetry,',
      '    cache,',
      '  ],',
      '})',
    ],
    highlight: [11],
    note: 'Use an already configured OTel SDK.',
    notes:
      'Continue the same module-scope Server setup. options and cache come from the earlier example. The OTel SDK and exporter must already be configured. This snippet alone does not export traces. No telemetry package or service is installed in the presentation.',
  },
  {
    id: 'middleware-persistence',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if we need persistence?',
    lines: [
      'import {',
      '  memoryPersistence, withPersistence,',
      "} from '@tanstack/ai-persistence'",
      '',
      'const persistence = withPersistence(',
      '  memoryPersistence(),',
      ')',
      '',
      'chat({ ...options,',
      '  middleware: [',
      '    persistence,',
      '    telemetry,',
      '    cache,',
      '  ],',
      '})',
    ],
    highlight: [10],
    note: 'In-process demo. Restart loses the records.',
    notes:
      'Create the persistence middleware once at module scope. This is the process-local memoryPersistence demo, not durable storage. Previous middleware instances and existing chat options remain in scope. Browser reload restoration and stream replay need separate integration.',
  },
  {
    id: 'middleware-memory',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if we need memory?',
    lines: [
      'import { memoryMiddleware }',
      "  from '@tanstack/ai-memory'",
      'import { inMemory }',
      "  from '@tanstack/ai-memory/in-memory'",
      '',
      'const memory = memoryMiddleware({',
      '  adapter: inMemory(),',
      '  scope: ctx => ({',
      '    threadId: ctx.threadId,',
      '  }),',
      '})',
      '',
      'chat({ ...options,',
      '  middleware: [',
      '    persistence,',
      '    memory,',
      '    telemetry,',
      '    cache,',
      '  ],',
      '})',
    ],
    highlight: [15],
    note: 'Single-user thread memory. Lost on restart.',
    notes:
      'Reuse this module-scope memory instance. The inMemory adapter uses lexical recall and stores raw turns. It requires no embeddings, model call or external service. This is a single-user demo scoped to threadId. Production code must authorize thread ownership and derive user or tenant scope on Server. It does not share memory across different thread IDs. Keep the earlier persistence, telemetry and cache instances.',
  },
  {
    id: 'middleware-compaction',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if the context gets too large?',
    lines: [
      'import { withCompaction }',
      "  from '@tanstack/ai-compaction'",
      '',
      'const compaction = withCompaction({',
      '  maxTokens: 100_000,',
      '})',
      '',
      'chat({ ...options,',
      '  middleware: [',
      '    persistence,',
      '    memory,',
      '    compaction,',
      '    telemetry,',
      '    cache,',
      '  ],',
      '})',
    ],
    highlight: [11],
    note: 'Evict old messages. Keep the stored transcript.',
    notes:
      'Create compaction once at module scope. The default evictOldest strategy makes no extra model call. It changes the provider message context, not the stored transcript. System prompts, including recalled memory, are outside this message budget. The snippet continues the same existing chat options and middleware instances.',
  },
  {
    id: 'computer-use',
    worldId: 'middleware-cache',
    camera: mapCam.codeWall,
    form: 'code',
    halfPanel: true,
    splitSide: 'center',
    lang: 'ts',
    steps: 1,
    title: 'What if we want the agent to run our computer?',
    lines: [
      'import { createComputerUse }',
      "  from '@tanstack/ai-computer-use'",
      'import { localComputer }',
      "  from '@tanstack/ai-computer-local'",
      '',
      'const computerUse = createComputerUse({',
      '  driver: localComputer(),',
      '})',
      '',
      'chat({ ...options,',
      '  tools: [',
      '    ...options.tools,',
      '    ...computerUse.tools,',
      '  ],',
      '  middleware: [',
      '    persistence,',
      '    memory,',
      '    compaction,',
      '    telemetry,',
      '    cache,',
      '    computerUse.middleware,',
      '  ],',
      '  interrupts: [computerUse.interrupt],',
      '})',
    ],
    highlight: [12, 20, 22],
    note: 'Real mouse and keys. Watch it work.',
    notes:
      'Continue the same module-scope Server setup. localComputer comes from @tanstack/ai-computer-local and uses @jitsi/robotjs. On macOS, give the terminal the Accessibility and Screen Recording permissions. The model moves the real mouse, presses real keys and reads the main screen, so watch it. For a safer machine, swap the driver for sandboxComputer or playwrightComputer. One computer serves one conversation at a time. The middleware stops the rest of a turn after a failed action and runs the OpenAI safety checks. The interrupt asks a person to approve a flagged action, so the client adds computerSafetyCheck to its useChat interrupts. gpt-5.5 supports the computer tool. Pass a stable threadId.',
  },
  {
    id: 'close',
    camera: shackCam.close,
    form: 'title',
    kicker: 'TanStack AI',
    title: 'Build the agent. Do not build the ferry company.',
    steps: 1,
  },
  {
    id: 'thank-you',
    camera: shackCam.thanks,
    form: 'title',
    title: 'Thank you',
    kicker: 'Alem Tuzlak',
    steps: 1,
    notes:
      'The camera travels through the open cabin window toward the sunset. Thank you.',
  },
]

const codeSlideIds = {
  'browser-request': [
    'browser-request',
    'browser-request-send',
    'browser-request-fetch',
  ],
  'provider-request': ['provider-request', 'diy-server-code'],
  'provider-response': ['provider-response', 'diy-server-relay'],
  'browser-response': ['browser-response', 'diy-browser-code'],
}

// Code changes are real slides. World identity keeps the ferry and cloud in place.
const sequence = scenes.flatMap((scene) => {
  const ids = codeSlideIds[scene.id]
  if (!ids) return [scene]
  return ids.map((id, variant) => {
    const source = scene.hopCode || scene
    const note = source.notesSteps?.[variant] || source.note || ''
    const content = {
      ...source,
      title: source.titlesSteps?.[variant] || source.title,
      titlesSteps: undefined,
      lines: source.linesSteps?.[variant] || source.lines,
      linesSteps: undefined,
      columnsSteps: source.columnsSteps?.[variant]
        ? [source.columnsSteps[variant]]
        : undefined,
      highlight: source.highlightSteps?.[variant] || source.highlight,
      highlightSteps: undefined,
      note,
      notesSteps: [note],
    }
    return {
      ...scene,
      ...(scene.hopCode ? { hopCode: content } : content),
      id,
      worldId: scene.id,
      worldStep: variant,
      steps: 1,
      camera: scene.cameras?.[variant] || scene.camera,
      cameras: undefined,
      splitSide: scene.splitSides?.[variant] || scene.splitSide,
      splitSides: undefined,
      focus: scene.focusSteps?.[variant] || scene.focus,
      focusSteps: undefined,
    }
  })
})

// The code wall uses the same displayed fragments as the readable walkthrough.
const roundTripCode = Object.fromEntries(
  sequence
    .filter((slide) => slide.hopCode)
    .map((slide) => [slide.id, slide.hopCode.lines.join('\n')]),
)
const completeSend = [
  roundTripCode['browser-request-send'],
  browserFetchLines.map((line) => `  ${line}`).join('\n'),
  browserResponseLines.map((line) => `  ${line}`).join('\n'),
  '}',
].join('\n')
const clientCode =
  roundTripCode['browser-request'].replace(
    '  // send is defined here, next.',
    completeSend
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  ) +
  '\n\n' +
  roundTripCode['diy-browser-code']
const serverCode =
  'async function POST(request) {\n' +
  [
    serverRequestLines.join('\n'),
    serverFetchLines.join('\n'),
    serverResponseLines.join('\n'),
    roundTripCode['diy-server-relay'],
  ]
    .map((code) =>
      code
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n'),
    )
    .join('\n') +
  '\n}'
const wallIndex =
  sequence.findIndex((slide) => slide.id === 'diy-browser-code') + 1
const toolCommon = String.raw`const emptyInput = {
  type: 'object', properties: {},
  required: [], additionalProperties: false,
}

function checkCalls(items) {
  if (!Array.isArray(items)) throw Error('Invalid calls')
  const ids = new Set()
  return items.map(item => {
    if (
      !item || item.type !== 'function_call' ||
      typeof item.call_id !== 'string' || !item.call_id ||
      ids.has(item.call_id) ||
      !['get_browser_time_zone', 'get_server_time']
        .includes(item.name) ||
      typeof item.arguments !== 'string'
    ) throw Error('Invalid or duplicate tool call')
    const args = JSON.parse(item.arguments)
    if (
      args === null || typeof args !== 'object' ||
      Array.isArray(args) || Object.keys(args).length
    ) throw Error('Expected an empty object')
    ids.add(item.call_id)
    return {
      type: 'function_call', call_id: item.call_id,
      name: item.name, arguments: '{}',
    }
  })
}

function readOutputs(items) {
  if (!Array.isArray(items)) throw Error('Invalid outputs')
  const ids = new Set()
  for (const item of items) {
    if (
      !item || item.type !== 'function_call_output' ||
      typeof item.call_id !== 'string' || !item.call_id ||
      ids.has(item.call_id) || typeof item.output !== 'string'
    ) throw Error('Invalid or duplicate tool output')
    ids.add(item.call_id)
  }
  return items
}

function readCache(items) {
  if (!Array.isArray(items)) throw Error('Invalid cache')
  const calls = checkCalls(items.map(item => item?.call))
  return new Map(calls.map((call, index) => {
    const output = items[index].output
    if (typeof output !== 'string') throw Error('Invalid cache')
    return [call.call_id, { call, output }]
  }))
}

function sameCall(a, b) {
  return a.name === b.name && a.arguments === b.arguments
}

function toolOutput(cache, call, run) {
  let saved = cache.get(call.call_id)
  if (saved && !sameCall(saved.call, call))
    throw Error('Tool call ID changed')
  if (!saved) {
    saved = { call, output: JSON.stringify(run()) }
    cache.set(call.call_id, saved)
  }
  return {
    type: 'function_call_output',
    call_id: call.call_id, output: saved.output,
  }
}

function checkPause(pause, cache) {
  if (
    !pause || pause.type !== 'app.tools' ||
    typeof pause.previous_response_id !== 'string' ||
    !pause.previous_response_id ||
    !Number.isInteger(pause.round) ||
    pause.round < 1 || pause.round > 10
  ) throw Error('Invalid tool pause')
  const calls = checkCalls(pause.calls)
  if (!calls.length || calls.some(call =>
    call.name !== 'get_browser_time_zone'
  )) throw Error('Invalid browser tool batch')
  const serverOutputs = readOutputs(pause.serverOutputs)
  const ids = new Set(calls.map(call => call.call_id))
  for (const output of serverOutputs) {
    const saved = cache.get(output.call_id)
    if (
      ids.has(output.call_id) || !saved ||
      saved.call.name !== 'get_server_time' ||
      saved.output !== output.output
    ) throw Error('Invalid server tool result')
    ids.add(output.call_id)
  }
  for (const call of calls) {
    const saved = cache.get(call.call_id)
    if (saved && !sameCall(saved.call, call))
      throw Error('Tool call ID changed')
  }
  return { calls, serverOutputs, ids }
}`

const toolClientMain = String.raw`import { useRef, useState } from 'react'

const clientTools = [{
  type: 'function',
  name: 'get_browser_time_zone',
  description: 'Read the browser time zone.',
  strict: true, parameters: emptyInput,
}]

function ChatForm() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  async function send(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (busy.current) return
    busy.current = true
    setPending(true)
    setAnswer('')
    setError('')
    const cache = new Map()
    let resume
    try {
      const content = String(data.get('prompt'))
      if (!content.trim()) throw Error('Enter a prompt')
      const messages = [{ role: 'user', content }]
      for (;;) {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, clientTools, resume }),
        })
        if (!response.ok || !response.body)
          throw Error('Request failed')
        let terminal
        for await (const event of readSse(response.body)) {
          if (!event || typeof event.type !== 'string')
            throw Error('Invalid stream event')
          if (event.type === 'response.output_text.delta') {
            if (typeof event.delta !== 'string')
              throw Error('Invalid text chunk')
            setAnswer(text => text + event.delta)
          } else if (event.type === 'app.error') {
            throw Error(event.message || 'Turn failed')
          } else if (
            event.type === 'app.tools' || event.type === 'app.done'
          ) {
            terminal = event
            break
          }
        }
        if (!terminal) throw Error('Stream ended early')
        if (terminal.type === 'app.done') return

        const incoming = readCache(terminal.cache)
        for (const [id, saved] of cache) {
          const copy = incoming.get(id)
          if (
            !copy || !sameCall(copy.call, saved.call) ||
            copy.output !== saved.output
          ) throw Error('Tool history changed')
        }
        for (const [id, saved] of incoming) {
          if (
            saved.call.name === 'get_browser_time_zone' &&
            !cache.has(id)
          ) throw Error('Server ran a browser tool')
        }
        const batch = checkPause(terminal, incoming)
        for (const [id, saved] of incoming) cache.set(id, saved)
        const outputs = [...batch.serverOutputs]
        for (const call of batch.calls) {
          outputs.push(toolOutput(cache, call, () => ({
            timeZone: Intl.DateTimeFormat()
              .resolvedOptions().timeZone,
          })))
        }
        resume = {
          ...terminal, outputs,
          cache: [...cache.values()],
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Turn failed')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <form onSubmit={send}>
      <input name="prompt" required />
      <button type="submit" disabled={pending}>Send</button>
      <p>{answer}</p>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}`

const toolServerMain = String.raw`const tools = [{
  type: 'function',
  name: 'get_browser_time_zone',
  description: 'Read the browser time zone.',
  strict: true, parameters: emptyInput,
}, {
  type: 'function',
  name: 'get_server_time',
  description: 'Read the server time in UTC.',
  strict: true, parameters: emptyInput,
}]

export async function POST(request) {
  let input, previous_response_id, round = 0
  let cache = new Map()
  try {
    const body = await request.json()
    if (
      !Array.isArray(body.clientTools) ||
      body.clientTools.length !== 1 ||
      body.clientTools[0]?.name !== 'get_browser_time_zone'
    ) throw Error('Unknown client tools')
    // Use the fixed schemas above, not client-supplied schemas.
    if (body.resume !== undefined) {
      const pause = body.resume
      cache = readCache(pause?.cache)
      const batch = checkPause(pause, cache)
      input = readOutputs(pause.outputs)
      if (
        input.length !== batch.ids.size ||
        input.some(output => !batch.ids.has(output.call_id))
      ) throw Error('Incomplete tool batch')
      for (const output of input) {
        const saved = cache.get(output.call_id)
        if (!saved || saved.output !== output.output)
          throw Error('Tool output changed')
      }
      previous_response_id = pause.previous_response_id
      round = pause.round
    } else {
      const messages = body.messages
      if (
        !Array.isArray(messages) || messages.length !== 1 ||
        messages[0]?.role !== 'user' ||
        typeof messages[0].content !== 'string' ||
        !messages[0].content.trim()
      ) throw Error('Invalid prompt')
      input = [{
        role: 'user', content: messages[0].content,
      }]
    }
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const emit = event => writer.write(encoder.encode(
    'data: ' + JSON.stringify(event) + '\n\n'
  ))
  void run()
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })

  async function run() {
    try {
      for (;;) {
        if (++round > 10) throw Error('Tool round limit reached')
        const upstream = await fetch(OPENAI_RESPONSES_URL, {
          method: 'POST', headers: openaiHeaders,
          signal: request.signal,
          body: JSON.stringify({
            model: 'gpt-5.5', input, previous_response_id,
            tools, stream: true,
          }),
        })
        if (!upstream.ok || !upstream.body)
          throw Error('Provider request failed')
        let completed
        for await (const event of readSse(upstream.body)) {
          if (!event || typeof event.type !== 'string')
            throw Error('Invalid provider event')
          if (event.type === 'response.output_text.delta') {
            if (typeof event.delta !== 'string')
              throw Error('Invalid text chunk')
            await emit(event)
          } else if (event.type === 'response.completed') {
            completed = event.response
            break
          } else if ([
            'response.failed', 'response.incomplete', 'error',
          ].includes(event.type)) {
            throw Error('Provider failed')
          }
        }
        if (
          !completed || completed.status !== 'completed' ||
          typeof completed.id !== 'string' || !completed.id ||
          !Array.isArray(completed.output)
        ) throw Error('Provider stream ended early')

        const calls = checkCalls(completed.output.filter(
          item => item?.type === 'function_call'
        ))
        if (!calls.length) {
          await emit({ type: 'app.done' })
          break
        }
        if (round === 10) throw Error('Tool round limit reached')
        for (const call of calls) {
          const saved = cache.get(call.call_id)
          if (saved && !sameCall(saved.call, call))
            throw Error('Tool call ID changed')
        }
        const serverOutputs = []
        const clientCalls = []
        for (const call of calls) {
          if (call.name === 'get_server_time') {
            serverOutputs.push(toolOutput(cache, call, () => ({
              utc: new Date().toISOString(),
            })))
          } else {
            clientCalls.push(call)
          }
        }
        previous_response_id = completed.id
        if (clientCalls.length) {
          await emit({
            type: 'app.tools', previous_response_id,
            calls: clientCalls, serverOutputs,
            cache: [...cache.values()], round,
          })
          break
        }
        input = serverOutputs
      }
      await writer.close()
    } catch (cause) {
      try {
        await emit({
          type: 'app.error',
          message: cause instanceof Error
            ? cause.message : 'Turn failed',
        })
        await writer.close()
      } catch {
        await writer.abort(cause).catch(() => {})
      }
    } finally {
      writer.releaseLock()
    }
  }
}`

const tanstackToolClient = String.raw`import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { browserTimeZone, serverTime } from './tools'

function ChatForm() {
  const {
    messages, sendMessage, isLoading, error,
  } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [
      browserTimeZone.client(() => ({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })),
      serverTime,
    ],
  })
  return (
    <form onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      sendMessage(String(data.get('prompt')))
    }}>
      <input name="prompt" required />
      <button type="submit" disabled={isLoading}>
        Send
      </button>
      {messages.map(message => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text')
              return <p key={index}>{part.content}</p>
            if (part.type === 'tool-call')
              return (
                <p key={part.id}>
                  {part.name}: {part.state}{' '}
                  {part.output !== undefined && (
                    <code>{JSON.stringify(part.output)}</code>
                  )}
                </p>
              )
            return null
          })}
        </div>
      ))}
      {error && <p role="alert">{error.message}</p>}
    </form>
  )
}`

const tanstackToolLessonClient = String.raw`import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { browserTimeZone, serverTime } from './tools'

function ChatForm() {
  const { messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [
      browserTimeZone.client(() => ({
        timeZone: Intl.DateTimeFormat()
          .resolvedOptions().timeZone,
      })),
      serverTime,
    ],
  })
  // Earlier form, text, and error UI omitted.
  return messages.map(message => (
    <div key={message.id}>
      {message.parts.map(part =>
        part.type === 'tool-call' && (
          <p key={part.id}>
            {part.name}: {part.state}{' '}
            {part.output !== undefined && (
              <code>{JSON.stringify(part.output)}</code>
            )}
          </p>
        ))}
    </div>
  ))
}`

const tanstackToolServer = String.raw`import {
  chat, toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { browserTimeZone, serverTime } from './tools'

export async function POST(request) {
  const {
    messages, threadId, runId, parentRunId, resume,
  } = await request.json()
  const abortController = new AbortController()
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages, threadId, runId, parentRunId, resume,
    tools: [
      browserTimeZone,
      serverTime.server(() => ({ utc: new Date().toISOString() })),
    ],
    abortController,
  })
  return toServerSentEventsResponse(
    stream, { abortController }
  )
}`

const diyToolClient =
  "import { useRef, useState } from 'react'\n\n" +
  toolCommon +
  '\n\n' +
  toolClientMain.split('\n').slice(2).join('\n') +
  '\n\n' +
  roundTripCode['diy-browser-code']
const diyToolServer =
  toolCommon +
  '\n\n' +
  toolServerMain +
  '\n\n' +
  roundTripCode['diy-browser-code']

// Approval walls retain the full reader and tool helpers from the tools wall.
const approvalCommon =
  toolCommon.slice(0, toolCommon.indexOf('function checkPause')) +
  String.raw`const deniedOutput = JSON.stringify({ error: 'Tool call denied' })

function checkPause(pause, cache) {
  if (
    !pause || !['app.approvals', 'app.tools'].includes(pause.type) ||
    typeof pause.previous_response_id !== 'string' ||
    !pause.previous_response_id ||
    !Number.isInteger(pause.round) ||
    pause.round < 1 || pause.round >= 10
  ) throw Error('Invalid tool pause')
  const calls = checkCalls(pause.calls)
  if (!calls.length) throw Error('Empty tool batch')
  for (const call of calls) {
    const saved = cache.get(call.call_id)
    if (saved && !sameCall(saved.call, call))
      throw Error('Tool call ID changed')
  }
  return calls
}

function checkDecisions(items, calls) {
  if (!Array.isArray(items) || items.length !== calls.length)
    throw Error('Incomplete approval batch')
  const ids = new Set(calls.map(call => call.call_id))
  const decisions = new Map()
  for (const item of items) {
    if (
      !item || !ids.has(item.call_id) ||
      decisions.has(item.call_id) ||
      typeof item.approved !== 'boolean'
    ) throw Error('Invalid or duplicate approval')
    decisions.set(item.call_id, item.approved)
  }
  return decisions
}

function checkResults(items, calls, cache) {
  const outputs = readOutputs(items)
  const ids = new Set(calls.map(call => call.call_id))
  if (outputs.length !== ids.size || outputs.some(output =>
    !ids.has(output.call_id)
  )) throw Error('Incomplete tool results')
  for (const output of outputs) {
    const saved = cache.get(output.call_id)
    if (!saved || saved.output !== output.output)
      throw Error('Tool output changed')
  }
  return outputs
}

function checkDenied(calls, decisions, cache) {
  for (const call of calls) {
    if (!decisions.get(call.call_id)) {
      const saved = cache.get(call.call_id)
      if (saved && saved.output !== deniedOutput)
        throw Error('Denied tool has a success result')
    }
  }
}`

const approvalClientMain = String.raw`const clientTools = [{
  type: 'function',
  name: 'get_browser_time_zone',
  description: 'Read the browser time zone.',
  strict: true, parameters: emptyInput,
}]

function ChatForm() {
  const busy = useRef(false)
  const approvalWait = useRef(null)
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [approvals, setApprovals] = useState([])

  useEffect(() => () => {
    approvalWait.current?.reject(Error('Chat closed'))
    approvalWait.current = null
  }, [])

  function askApproval(calls) {
    return new Promise((resolve, reject) => {
      approvalWait.current = {
        calls, decisions: new Map(), resolve, reject,
      }
      setApprovals(calls.map(call => ({ ...call, status: 'pending' })))
    })
  }

  function decide(callId, approved) {
    const wait = approvalWait.current
    if (!wait || wait.decisions.has(callId)) return
    if (!wait.calls.some(call => call.call_id === callId)) return
    wait.decisions.set(callId, approved)
    setApprovals(rows => rows.map(row => row.call_id === callId
      ? { ...row, status: approved ? 'approved' : 'denied' } : row))
    if (wait.decisions.size !== wait.calls.length) return
    approvalWait.current = null
    wait.resolve(wait.calls.map(call => ({
      call_id: call.call_id,
      approved: wait.decisions.get(call.call_id),
    })))
  }

  async function send(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (busy.current) return
    busy.current = true
    setPending(true)
    setAnswer('')
    setError('')
    const cache = new Map()
    let resume
    try {
      const content = String(data.get('prompt'))
      if (!content.trim()) throw Error('Enter a prompt')
      const messages = [{ role: 'user', content }]
      for (;;) {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, clientTools, resume }),
        })
        if (!response.ok || !response.body)
          throw Error('Request failed')
        let terminal
        for await (const event of readSse(response.body)) {
          if (!event || typeof event.type !== 'string')
            throw Error('Invalid stream event')
          if (event.type === 'response.output_text.delta') {
            if (typeof event.delta !== 'string')
              throw Error('Invalid text chunk')
            setAnswer(text => text + event.delta)
          } else if (event.type === 'app.error') {
            throw Error(event.message || 'Turn failed')
          } else if ([
            'app.approvals', 'app.tools', 'app.done',
          ].includes(event.type)) {
            terminal = event
            break
          }
        }
        if (!terminal) throw Error('Stream ended early')
        if (terminal.type === 'app.done') return

        const incoming = readCache(terminal.cache)
        for (const [id, saved] of cache) {
          const copy = incoming.get(id)
          if (
            !copy || !sameCall(copy.call, saved.call) ||
            copy.output !== saved.output
          ) throw Error('Tool history changed')
        }
        const calls = checkPause(terminal, incoming)
        if (terminal.type === 'app.approvals') {
          if (incoming.size !== cache.size)
            throw Error('Tool ran before approval')
          const decisions = await askApproval(calls)
          resume = { ...terminal, decisions }
          setApprovals([])
          continue
        }

        if (!resume || resume.type !== 'app.approvals')
          throw Error('Unexpected execution request')
        if (
          terminal.previous_response_id !== resume.previous_response_id ||
          terminal.round !== resume.round ||
          JSON.stringify(calls) !== JSON.stringify(resume.calls)
        ) throw Error('Approval batch changed')
        const decisions = checkDecisions(terminal.decisions, calls)
        const sent = checkDecisions(resume.decisions, calls)
        if (calls.some(call => decisions.get(call.call_id) !==
          sent.get(call.call_id))) throw Error('Approval changed')
        checkDenied(calls, decisions, incoming)
        const clientCalls = calls.filter(call =>
          decisions.get(call.call_id) &&
          call.name === 'get_browser_time_zone'
        )
        const serverCalls = calls.filter(call => !clientCalls.includes(call))
        const outputs = [...checkResults(
          terminal.serverOutputs, serverCalls, incoming,
        )]
        for (const [id, saved] of incoming) {
          if (!cache.has(id) && !serverCalls.some(call => call.call_id === id))
            throw Error('Unexpected tool result')
          cache.set(id, saved)
        }
        for (const call of clientCalls) {
          outputs.push(toolOutput(cache, call, () => ({
            timeZone: Intl.DateTimeFormat()
              .resolvedOptions().timeZone,
          })))
        }
        resume = {
          ...terminal, outputs,
          cache: [...cache.values()],
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Turn failed')
    } finally {
      approvalWait.current = null
      busy.current = false
      setPending(false)
      setApprovals([])
    }
  }

  return (
    <form onSubmit={send}>
      <input name="prompt" required />
      <button type="submit" disabled={pending}>Send</button>
      <p>{answer}</p>
      {approvals.map(call => (
        <fieldset key={call.call_id} disabled={call.status !== 'pending'}>
          <legend>{call.name}: {call.call_id}</legend>
          <code>{call.arguments}</code>
          <p>{call.status}</p>
          <button type="button" onClick={() => decide(call.call_id, true)}>
            Approve
          </button>
          <button type="button" onClick={() => decide(call.call_id, false)}>
            Deny
          </button>
        </fieldset>
      ))}
      {approvals.length > 0 && <p>Choose for every tool before continuing.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}`

const approvalServerMain = toolServerMain
  .replace('let cache = new Map()', 'let cache = new Map()\n  let execution')
  .replace(
    String.raw`      const batch = checkPause(pause, cache)
      input = readOutputs(pause.outputs)
      if (
        input.length !== batch.ids.size ||
        input.some(output => !batch.ids.has(output.call_id))
      ) throw Error('Incomplete tool batch')
      for (const output of input) {
        const saved = cache.get(output.call_id)
        if (!saved || saved.output !== output.output)
          throw Error('Tool output changed')
      }`,
    String.raw`      const calls = checkPause(pause, cache)
      const decisions = checkDecisions(pause.decisions, calls)
      checkDenied(calls, decisions, cache)
      if (pause.type === 'app.approvals') {
        // Validate the whole batch before any handler runs.
        execution = { pause, calls, decisions }
      } else {
        const serverCalls = calls.filter(call =>
          !decisions.get(call.call_id) || call.name === 'get_server_time'
        )
        checkResults(pause.serverOutputs, serverCalls, cache)
        input = checkResults(pause.outputs, calls, cache)
      }`,
  )
  .replace(
    '      for (;;) {',
    String.raw`      if (execution) {
        const { pause, calls, decisions } = execution
        const serverOutputs = []
        for (const call of calls) {
          if (!decisions.get(call.call_id)) {
            serverOutputs.push(toolOutput(cache, call, () => ({
              error: 'Tool call denied',
            })))
          } else if (call.name === 'get_server_time') {
            serverOutputs.push(toolOutput(cache, call, () => ({
              utc: new Date().toISOString(),
            })))
          }
        }
        await emit({
          ...pause, type: 'app.tools', serverOutputs,
          cache: [...cache.values()],
        })
        await writer.close()
        return
      }
      for (;;) {`,
  )
  .replace(
    toolServerMain.slice(
      toolServerMain.indexOf('        const serverOutputs = []'),
      toolServerMain.indexOf('\n      }\n      await writer.close()'),
    ),
    String.raw`        // Every tool waits. The browser supplies the decisions.
        await emit({
          type: 'app.approvals',
          previous_response_id: completed.id,
          calls, cache: [...cache.values()], round,
        })
        break`,
  )

const diyApprovalClient =
  "import { useEffect, useRef, useState } from 'react'\n\n" +
  approvalCommon +
  '\n\n' +
  approvalClientMain +
  '\n\n' +
  roundTripCode['diy-browser-code']
const diyApprovalServer =
  approvalCommon +
  '\n\n' +
  approvalServerMain +
  '\n\n' +
  roundTripCode['diy-browser-code']

const tanstackApprovalDefinitions = String.raw`import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const browserTimeZone = toolDefinition({
  name: 'get_browser_time_zone',
  description: 'Read the browser time zone.',
  inputSchema: z.object({}),
})

export const serverTime = toolDefinition({
  name: 'get_server_time',
  description: 'Read the server time in UTC.',
  inputSchema: z.object({}),
  needsApproval: true,
})`

const tanstackApprovalClient = tanstackToolClient
  .replace(
    '    messages, sendMessage, isLoading, error,',
    '    messages, sendMessage, isLoading, error,\n    interrupts, resuming,',
  )
  .replace(
    '  return (',
    String.raw`  const approval = interrupts.find(
    interrupt => interrupt.kind === 'tool-approval'
  )
  return (`,
  )
  .replace(
    'disabled={isLoading}',
    'disabled={isLoading || resuming || interrupts.length > 0}',
  )
  .replace(
    '      {error &&',
    String.raw`      {approval && (
        <button type="button" disabled={resuming}
          onClick={() => approval.resolveInterrupt(true)}>
          Approve {approval.toolName}
        </button>
      )}
      {error &&`,
  )
const tanstackApprovalServer = tanstackToolServer

const mcpServerHelpers = String.raw`function checkRemoteCalls(items, routes) {
  if (!Array.isArray(items)) throw Error('Invalid MCP calls')
  const ids = new Set()
  return items.map(item => {
    if (
      !item || item.type !== 'function_call' ||
      typeof item.call_id !== 'string' || !item.call_id ||
      ids.has(item.call_id) || !routes.has(item.name) ||
      typeof item.arguments !== 'string'
    ) throw Error('Invalid or duplicate MCP call')
    const args = JSON.parse(item.arguments)
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw Error('Expected MCP object arguments')
    ids.add(item.call_id)
    return {
      type: 'function_call', call_id: item.call_id,
      name: item.name, arguments: JSON.stringify(args),
    }
  })
}

function readRemoteHistory(items, routes, cache) {
  if (!Array.isArray(items)) throw Error('Invalid MCP history')
  const calls = checkRemoteCalls(items.map(item => item?.call), routes)
  return new Map(calls.map((call, index) => {
    const output = items[index].output
    if (cache.has(call.call_id) || typeof output !== 'string')
      throw Error('Invalid MCP history')
    const result = JSON.parse(output)
    if (!result || !Array.isArray(result.content) || result.isError)
      throw Error('Invalid MCP result')
    return [call.call_id, { call, output }]
  }))
}

function checkCombinedCalls(items, routes, cache, remoteHistory) {
  if (!Array.isArray(items)) throw Error('Invalid combined calls')
  const ids = new Set()
  const local = [], remote = []
  for (const item of items) {
    if (!item || typeof item.call_id !== 'string' ||
        !item.call_id || ids.has(item.call_id))
      throw Error('Duplicate combined call ID')
    ids.add(item.call_id)
    if (routes.has(item.name)) remote.push(item)
    else local.push(item)
  }
  const calls = checkCalls(local)
  const mcpCalls = checkRemoteCalls(remote, routes)
  for (const call of [...calls, ...mcpCalls]) {
    const isRemote = routes.has(call.name)
    const own = isRemote ? remoteHistory : cache
    const other = isRemote ? cache : remoteHistory
    const saved = own.get(call.call_id)
    if (other.has(call.call_id) || (saved && !sameCall(saved.call, call)))
      throw Error('Tool call ID changed')
  }
  return { calls, mcpCalls }
}

function remoteOutputs(calls, history) {
  return calls.map(call => {
    const saved = history.get(call.call_id)
    if (!saved || !sameCall(saved.call, call))
      throw Error('Missing or changed MCP result')
    return {
      type: 'function_call_output',
      call_id: call.call_id, output: saved.output,
    }
  })
}`

const diyMultipleMcpServer =
  "import { Client } from '@modelcontextprotocol/sdk/client/index.js'\nimport { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'\n\n" +
  diyApprovalServer
    .replace(
      'const tools = [{',
      mcpServerHelpers +
        '\n\n' +
        String.raw`const remotes = [
  { prefix: 'docs', url: 'https://docs.example.com/mcp' },
  { prefix: 'reference', url: 'https://reference.example.com/mcp' },
  { prefix: 'catalog', url: 'https://catalog.example.com/mcp' },
]

const tools = [{`,
    )
    .replace('  let execution', '  let execution, resumePause')
    .replace(
      '      const pause = body.resume',
      '      const pause = body.resume\n      resumePause = pause',
    )
    .replace(
      '  async function run() {\n    try {',
      String.raw`  async function run() {
    const clients = []
    const routes = new Map()
    const providerTools = [...tools]
    let remoteHistory = new Map()
    try {
      // Trusted read-only servers expose one small page of tools.
      for (const remote of remotes) {
        const client = new Client({ name: 'talk-server', version: '1.0.0' })
        clients.push(client)
        await client.connect(
          new StreamableHTTPClientTransport(new URL(remote.url)),
          { signal: request.signal },
        )
        const discovered = await client.listTools(
          undefined, { signal: request.signal },
        )
        if (discovered.nextCursor) throw Error('Expected one tool page')
        for (const tool of discovered.tools) {
          const name = remote.prefix + '_' + tool.name
          if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) ||
              providerTools.some(item => item.name === name))
            throw Error('Invalid or duplicate MCP tool name')
          routes.set(name, { client, nativeName: tool.name })
          providerTools.push({
            type: 'function', name,
            description: tool.description || name,
            parameters: tool.inputSchema, strict: false,
          })
        }
      }
      if (resumePause) {
        remoteHistory = readRemoteHistory(
          resumePause.mcpHistory, routes, cache,
        )
        const batch = checkCombinedCalls(
          [...resumePause.calls, ...checkRemoteCalls(resumePause.mcpCalls, routes)],
          routes, cache, remoteHistory,
        )
        const outputs = remoteOutputs(batch.mcpCalls, remoteHistory)
        if (!execution) input = [...input, ...outputs]
      }
      request.signal.throwIfAborted()`,
    )
    .replace(
      '            tools, stream: true,',
      '            tools: providerTools, stream: true,',
    )
    .replace(
      String.raw`        const calls = checkCalls(completed.output.filter(
          item => item?.type === 'function_call'
        ))
        if (!calls.length) {`,
      String.raw`        const { calls, mcpCalls } = checkCombinedCalls(
          completed.output.filter(item => item?.type === 'function_call'),
          routes, cache, remoteHistory,
        )
        if (!calls.length && !mcpCalls.length) {`,
    )
    .replace(
      '        // Every tool waits. The browser supplies the decisions.',
      String.raw`        // Await remote calls on Server. Never put them in the local cache.
        for (const call of mcpCalls) {
          if (remoteHistory.has(call.call_id)) continue
          const route = routes.get(call.name)
          const result = await route.client.callTool({
            name: route.nativeName, arguments: JSON.parse(call.arguments),
          }, undefined, { signal: request.signal })
          if (result.isError) throw Error('MCP tool failed: ' + call.name)
          remoteHistory.set(call.call_id, {
            call, output: JSON.stringify(result),
          })
        }
        if (!calls.length) {
          input = remoteOutputs(mcpCalls, remoteHistory)
          previous_response_id = completed.id
          continue
        }
        // Only local clocks wait for Browser approval.`,
    )
    .replace(
      '          calls, cache: [...cache.values()], round,',
      String.raw`          calls, cache: [...cache.values()], round,
          mcpCalls, mcpHistory: [...remoteHistory.values()],`,
    )
    .replace(
      '    } finally {\n      writer.releaseLock()',
      String.raw`    } finally {
      await Promise.allSettled(clients.map(client => client.close()))
      writer.releaseLock()`,
    )

const diyMcpServer = diyMultipleMcpServer
  .replace(
    diyMultipleMcpServer.slice(
      diyMultipleMcpServer.indexOf('const remotes = ['),
      diyMultipleMcpServer.indexOf('const tools = [{'),
    ),
    '',
  )
  .replace('    const clients = []', '    let client')
  .replace(
    diyMultipleMcpServer.slice(
      diyMultipleMcpServer.indexOf('      // Trusted read-only servers'),
      diyMultipleMcpServer.indexOf('      if (resumePause) {'),
    ),
    String.raw`      // The trusted read-only server exposes one small page of tools.
      client = new Client({ name: 'talk-server', version: '1.0.0' })
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL('https://docs.example.com/mcp'),
        ),
        { signal: request.signal },
      )
      const discovered = await client.listTools(
        undefined, { signal: request.signal },
      )
      if (discovered.nextCursor) throw Error('Expected one tool page')
      for (const tool of discovered.tools) {
        const name = 'docs_' + tool.name
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) ||
            providerTools.some(item => item.name === name))
          throw Error('Invalid or duplicate MCP tool name')
        routes.set(name, tool.name)
        providerTools.push({
          type: 'function', name,
          description: tool.description || name,
          parameters: tool.inputSchema, strict: false,
        })
      }
`,
  )
  .replace(
    '          const route = routes.get(call.name)\n          const result = await route.client.callTool({\n            name: route.nativeName, arguments: JSON.parse(call.arguments),',
    '          const result = await client.callTool({\n            name: routes.get(call.name), arguments: JSON.parse(call.arguments),',
  )
  .replace(
    '      await Promise.allSettled(clients.map(client => client.close()))',
    '      await client?.close().catch(() => {})',
  )

const tanstackMcpServer = tanstackApprovalServer
  .replace(
    'import { browserTimeZone',
    "import { createMCPClient } from '@tanstack/ai-mcp'\nimport { browserTimeZone",
  )
  .replace(
    '  const abortController',
    String.raw`  const mcp = await createMCPClient({
    transport: { type: 'http', url: 'https://docs.example.com/mcp' },
    prefix: 'docs',
  })
  const abortController`,
  )
  .replace(
    '    abortController,',
    '    mcp: { clients: [mcp] },\n    abortController,',
  )

const tanstackMultipleMcpServer = tanstackMcpServer
  .replace('import { createMCPClient }', 'import { createMCPClients }')
  .replace(
    String.raw`  const mcp = await createMCPClient({
    transport: { type: 'http', url: 'https://docs.example.com/mcp' },
    prefix: 'docs',
  })`,
    String.raw`  const pool = await createMCPClients({
    docs: {
      transport: { type: 'http', url: 'https://docs.example.com/mcp' },
    },
    reference: {
      transport: { type: 'http', url: 'https://reference.example.com/mcp' },
    },
    catalog: {
      transport: { type: 'http', url: 'https://catalog.example.com/mcp' },
    },
  })`,
  )
  .replace('mcp: { clients: [mcp] }', 'mcp: { clients: [pool] }')

// Leg counts of the boat flows in MapWorld.
const flowLegs = {
  'stream-events': 4,
  'server-tool-flow': 4,
  'client-tool-flow': 6,
  'tool-approvals-overview': 6,
}

export const slides = [
  ...sequence.slice(0, wallIndex),
  {
    id: 'diy-code-wall',
    worldId: 'diy-code-wall',
    camera: mapCam.codeWall,
    form: 'code',
    codeWall: true,
    title: 'Client and Server',
    lang: 'jsx',
    steps: 1,
    wallColumns: [
      {
        title: 'Client',
        lines: clientCode.split('\n'),
        flowColumns: 2,
        note: 'React useState import omitted.',
      },
      {
        title: 'Server',
        lines: serverCode.split('\n'),
        note: 'Server-only URL/auth and validation omitted.',
      },
    ],
  },
  {
    id: 'tanstack-code-wall',
    worldId: 'diy-code-wall',
    camera: mapCam.codeWall,
    form: 'code',
    codeWall: true,
    title: 'TanStack Client and Server',
    lang: 'jsx',
    steps: 1,
    wallColumns: [
      {
        title: 'Client · TanStack',
        lines: [
          "import { useChat } from '@tanstack/ai-react'",
          'import { fetchServerSentEvents }',
          "  from '@tanstack/ai-client'",
          '',
          'function ChatForm() {',
          '  const { messages, sendMessage } = useChat({',
          '    connection:',
          "      fetchServerSentEvents('/api/chat'),",
          '  })',
          '  return (',
          '    <form onSubmit={event => {',
          '      event.preventDefault()',
          '      const data = new FormData(',
          '        event.currentTarget',
          '      )',
          "      sendMessage(String(data.get('prompt')))",
          '    }}>',
          '      <input name="prompt" required />',
          '      <button type="submit">Send</button>',
          '      {messages.map(message => (',
          '        <p key={message.id}>',
          '          {message.parts.map(part =>',
          "            part.type === 'text'",
          "              ? part.content : ''",
          "          ).join('')}",
          '        </p>',
          '      ))}',
          '    </form>',
          '  )',
          '}',
        ],
        note: 'useChat owns streamed messages and React state.',
      },
      {
        title: 'Server · TanStack',
        lines: [
          'import {',
          '  chat, toServerSentEventsResponse,',
          "} from '@tanstack/ai'",
          "import { openaiText } from '@tanstack/ai-openai'",
          '',
          'export async function POST(request) {',
          '  const { messages, threadId, runId } =',
          '    await request.json()',
          '  const abortController =',
          '    new AbortController()',
          '  const stream = chat({',
          "    adapter: openaiText('gpt-5.5'),",
          '    messages, threadId, runId,',
          '    abortController,',
          '  })',
          '  return toServerSentEventsResponse(',
          '    stream, { abortController }',
          '  )',
          '}',
        ],
        note: 'Key/auth/validation and disconnect bridge omitted.',
      },
    ],
  },
  ...sequence.slice(wallIndex),
]
  .flatMap((slide) =>
    slide.id === 'tanstack-code-wall'
      ? [
          slide,
          {
            ...slide,
            id: 'tanstack-http-wall',
            title: 'TanStack over HTTP streams',
            wallColumns: slide.wallColumns.map((column, index) => ({
              ...column,
              title:
                index === 0 ? 'Client · HTTP stream' : 'Server · HTTP stream',
              lines: column.lines.map((line) =>
                line
                  .replaceAll('fetchServerSentEvents', 'fetchHttpStream')
                  .replaceAll('toServerSentEventsResponse', 'toHttpResponse'),
              ),
            })),
          },
          {
            ...slide,
            id: 'tanstack-websocket-wall',
            title: 'TanStack over WebSocket',
            wallColumns: [
              {
                title: 'Client · WebSocket',
                lines: [
                  "import { useChat } from '@tanstack/ai-react'",
                  'import { webSocket }',
                  "  from '@tanstack/ai-client'",
                  '',
                  'function ChatForm() {',
                  '  const { messages, sendMessage } = useChat({',
                  '    connection:',
                  "      webSocket('/api/chat'),",
                  '  })',
                  '  return (',
                  '    <form onSubmit={event => {',
                  '      event.preventDefault()',
                  '      const data = new FormData(',
                  '        event.currentTarget',
                  '      )',
                  "      sendMessage(String(data.get('prompt')))",
                  '    }}>',
                  '      <input name="prompt" required />',
                  '      <button type="submit">Send</button>',
                  '      {messages.map(message => (',
                  '        <p key={message.id}>',
                  '          {message.parts.map(part =>',
                  "            part.type === 'text'",
                  "              ? part.content : ''",
                  "          ).join('')}",
                  '        </p>',
                  '      ))}',
                  '    </form>',
                  '  )',
                  '}',
                ],
                note: 'TanStack owns run frames and UI state.',
              },
              {
                title: 'Server · WebSocket',
                lines: [
                  'import {',
                  '  chat, toWebSocketStream,',
                  "} from '@tanstack/ai'",
                  "import { openaiText } from '@tanstack/ai-openai'",
                  '',
                  'export function handleSocket(socket, request) {',
                  '  toWebSocketStream(socket, request, {',
                  '    onRun({ messages, threadId, runId }) {',
                  '      const abortController =',
                  '        new AbortController()',
                  '      const stream = chat({',
                  "        adapter: openaiText('gpt-5.5'),",
                  '        messages, threadId, runId,',
                  '        abortController,',
                  '      })',
                  '      return stream',
                  '    },',
                  '  })',
                  '}',
                ],
                note: 'Host socket upgrade and upstream cancel wiring omitted.',
              },
            ],
          },
          {
            ...slide,
            id: 'python-code-wall',
            title: 'A Python server speaks the same AG-UI events',
            wallColumns: [
              {
                ...slide.wallColumns[0],
                title: 'Client · TanStack SSE',
                note: 'Back to SSE. The same /api/chat route.',
              },
              {
                title: 'Server · Python',
                lang: 'python',
                lines: [
                  'from fastapi import FastAPI',
                  'from starlette.requests import Request',
                  'from starlette.responses import Response',
                  'from pydantic_ai import Agent',
                  'from pydantic_ai.ui.ag_ui import AGUIAdapter',
                  '',
                  'app = FastAPI()',
                  "agent = Agent('openai:gpt-5.5')",
                  '',
                  "@app.post('/api/chat')",
                  'async def run_agent(',
                  '    request: Request,',
                  ') -> Response:',
                  '    return await AGUIAdapter.dispatch_request(',
                  '        request,',
                  '        agent=agent,',
                  '    )',
                ],
                note: 'Pydantic AI · AG-UI. Key/auth/host setup omitted.',
              },
            ],
          },
        ]
      : [slide],
  )
  .flatMap((slide, index, walls) =>
    slide.id === 'tanstack-websocket-wall'
      ? [
          slide,
          ...[
            [
              'openrouter',
              'OpenRouter',
              'openRouterText',
              'ai-openrouter',
              'openai/gpt-5.5',
            ],
            [
              'anthropic',
              'Anthropic',
              'anthropicText',
              'ai-anthropic',
              'claude-fable-5-1',
            ],
            ['xai', 'xAI', 'grokText', 'ai-grok', 'grok-4.6'],
          ].map(([id, provider, factory, packageName, model]) => ({
            ...slide,
            id: `tanstack-${id}-wall`,
            title: `SSE with ${provider}`,
            wallColumns: [
              walls.find((wall) => wall.id === 'tanstack-code-wall')
                .wallColumns[0],
              {
                ...walls.find((wall) => wall.id === 'tanstack-code-wall')
                  .wallColumns[1],
                title: `Server · ${provider}`,
                lines: walls
                  .find((wall) => wall.id === 'tanstack-code-wall')
                  .wallColumns[1].lines.map((line) =>
                    line
                      .replace(
                        "import { openaiText } from '@tanstack/ai-openai'",
                        `import { ${factory} } from '@tanstack/${packageName}'`,
                      )
                      .replace(
                        "openaiText('gpt-5.5')",
                        `${factory}('${model}')`,
                      ),
                  ),
                note: 'Key/auth/validation and disconnect bridge omitted.',
              },
            ],
          })),
        ]
      : [slide],
  )
  .flatMap((slide) => {
    const title =
      slide.id === 'tanstack-code-wall'
        ? 'Transports'
        : slide.id === 'tanstack-openrouter-wall'
          ? 'LLM Providers'
          : slide.id === 'python-code-wall'
            ? 'Custom servers?'
            : null
    return title
      ? [
          {
            id:
              title === 'Transports'
                ? 'protocols'
                : title === 'LLM Providers'
                  ? 'llm-providers'
                  : 'custom-servers',
            camera: mapCam.codeWall,
            form: 'punch',
            title: title === 'LLM Providers' ? 'LLM Providers?' : title,
            steps: 1,
          },
          slide,
        ]
      : [slide]
  })
  .map((slide, index, walls) => {
    const providerIds = [
      'tanstack-code-wall',
      'tanstack-openrouter-wall',
      'tanstack-anthropic-wall',
      'tanstack-xai-wall',
    ]
    const transportIds = [
      'tanstack-code-wall',
      'tanstack-http-wall',
      'tanstack-websocket-wall',
    ]
    const fitIds = transportIds.includes(slide.id)
      ? [...providerIds, ...transportIds]
      : providerIds
    if (!fitIds.includes(slide.id)) return slide
    return {
      ...slide,
      wallColumns: slide.wallColumns.map((column, side) => ({
        ...column,
        fitSources: walls
          .filter((wall) => fitIds.includes(wall.id))
          .map((wall) => wall.wallColumns[side].lines),
      })),
    }
  })
  .map((slide, index, walls) =>
    slide.id === 'python-code-wall'
      ? {
          ...slide,
          wallColumns: [
            walls.find((wall) => wall.id === 'tanstack-xai-wall')
              .wallColumns[0],
            slide.wallColumns[1],
          ],
        }
      : slide,
  )
  .flatMap((slide) =>
    slide.id === 'python-code-wall'
      ? [
          slide,
          {
            ...slide,
            id: 'php-code-wall',
            title: 'A PHP server streams AG-UI events',
            wallColumns: [
              slide.wallColumns[0],
              {
                title: 'Server · PHP',
                lang: 'php',
                lines: String.raw`<?php
require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/toAGUIEvents.php';

$input = json_decode(
    file_get_contents('php://input'), true
);
$client = OpenAI::factory()
    ->withApiKey(getenv('OPENAI_API_KEY'))
    ->withHttpClient(new GuzzleHttp\Client())
    ->make();
$messages = array_map(
    fn(array $message) => [
        'role' => $message['role'],
        'content' => $message['content'],
    ],
    $input['messages']
);
$stream = $client->chat()->createStreamed([
    'model' => 'gpt-5.5',
    'messages' => $messages,
]);
return toAGUIEvents(
    $stream,
    $input['threadId'],
    $input['runId']
);`.split('\n'),
                note: 'Local utility emits AG-UI SSE. Implementation omitted.',
              },
            ],
          },
        ]
      : [slide],
  )
  .flatMap((slide, index, walls) => {
    if (slide.id !== 'client-tool-flow') return [slide]
    const baseline = walls.find((wall) => wall.id === 'diy-code-wall')
    return [
      slide,
      {
        ...baseline,
        id: 'diy-tools-baseline',
        title: 'Roll your own: before tools',
      },
      {
        ...baseline,
        id: 'diy-tools-wall',
        title: 'Roll your own: client and server tools',
        wallColumns: [
          {
            title: 'Client · DIY tools',
            lines: diyToolClient.split('\n'),
            flowColumns: 3,
            note: 'One active turn. No retry or reload recovery.',
          },
          {
            title: 'Server · DIY tools',
            lines: diyToolServer.split('\n'),
            flowColumns: 3,
            note: 'Read-only demo. Auth/replay binding and key setup omitted.',
          },
        ],
        notesSteps: [
          'All helper code is shown. app.tools, app.done, app.error and resume/cache are this demo’s protocol, not OpenAI APIs. Browser carries unsigned pause/cache state. No durable exactly-once execution or automatic retry. Context uses previous_response_id with stored responses. Host links disconnect to request.signal. Fixed allowlists ignore client schema changes. Ten provider responses per turn.',
        ],
      },
      {
        id: 'tanstack-tool-definitions',
        camera: mapCam.codeWall,
        form: 'code',
        halfPanel: true,
        splitSide: 'center',
        lang: 'ts',
        steps: 1,
        title: 'tools.ts',
        lines: tanstackApprovalDefinitions
          .replace('  needsApproval: true,\n', '')
          .split('\n'),
        note: 'Shared definitions. Each host adds its handler.',
      },
      {
        ...baseline,
        id: 'tanstack-tools-wall',
        title: 'The TanStack way: client and server tools',
        wallColumns: [
          {
            title: 'Client · TanStack tools',
            lines: tanstackToolLessonClient.split('\n'),
            note: 'TanStack runs client tools and returns results.',
          },
          {
            title: 'Server · TanStack tools',
            lines: tanstackToolServer.split('\n'),
            note: 'TanStack runs server tools and resumes the model.',
          },
        ],
        notesSteps: [
          'Zod defines the input schemas. TanStack runs client and server tools and resumes the model. Server registers both tools but runs only serverTime. Client resume passes parentRunId and resume. Provider credentials and app authentication remain host setup. These are displayed programs, not installed backends.',
        ],
      },
    ]
  })
  .flatMap((slide) =>
    slide.id === 'tanstack-tools-wall'
      ? [
          slide,
          {
            ...slide,
            id: 'tanstack-tools-focus',
            title: 'The tool integration stays small',
            wallColumns: slide.wallColumns.map((column, side) => ({
              ...column,
              decorations: (side === 0
                ? [
                    [3, 3],
                    [8, 14],
                    [19, 27],
                  ]
                : [
                    [5, 5],
                    [15, 18],
                  ]
              ).map((lines) => ({
                lines,
                className: 'th-line--focused',
              })),
            })),
          },
        ]
      : [slide],
  )
  .flatMap((slide) => {
    if (slide.id !== 'tanstack-tools-focus') return [slide]
    const approvalLines = tanstackApprovalClient.split('\n')
    const messageStart = approvalLines.indexOf(
      '      {messages.map(message => (',
    )
    const approvalStart = approvalLines.indexOf('      {approval && (')
    const clientLines = [
      ...approvalLines.slice(0, messageStart),
      ...approvalLines.slice(approvalStart),
    ].flatMap((line) =>
      line.includes('<button type="submit"')
        ? [
            '      <button type="submit"',
            '        disabled={isLoading || resuming ||',
            '          interrupts.length > 0}>',
          ]
        : [
            line.replace(
              'messages, sendMessage, isLoading, error,',
              'sendMessage, isLoading, error,',
            ),
          ],
    )
    const approvalWall = {
      ...slide,
      id: 'tanstack-approvals-wall',
      title: 'The TanStack way: tool approvals',
      wallColumns: [
        {
          title: 'Client: TanStack approvals',
          lines: clientLines,
          note: 'Your button approves the server tool.',
        },
        {
          title: 'Server: TanStack approvals',
          lines: tanstackApprovalServer.split('\n'),
          note: 'The server clock waits for approval before execution.',
        },
      ],
      notesSteps: [
        'Both sides import the same tool definitions from tools.ts. Only serverTime requires approval. Browser attaches the browser clock handler and registers the server definition. Server attaches the server clock handler and registers the browser definition. The browser clock uses normal client execution. The client finds one tool approval and renders one Approve button. This is a single-approval example. Multi-call batch UI is omitted: a staged first approval can hide a later one. Provider keys, app authentication and disconnect wiring remain host setup.',
      ],
    }
    return [
      slide,
      {
        id: 'tool-approvals-overview',
        camera: mapCam.overview,
        form: 'punch',
        steps: 1,
        title: 'What if we add tool approvals?',
        notesSteps: [
          'Automatic server-tool story: Provider sends a tool call. Server requests approval from Browser. The gate rises after arrival. Browser approves and returns the decision with the payload to Server. Server runs the tool and sends its result to Provider. For a client tool, approval returns to Server first, then Server requests execution on Browser. The provider receives a tool result, not the approval.',
        ],
      },
      {
        ...approvalWall,
        id: 'diy-approvals-wall',
        title: 'Roll your own: tool approvals',
        wallColumns: [
          {
            title: 'Client: DIY approvals',
            lines: diyApprovalClient.split('\n'),
            flowColumns: 3,
            note: 'Complete approval UI, tool loop and SSE reader.',
          },
          {
            title: 'Server: DIY approvals',
            lines: diyApprovalServer.split('\n'),
            flowColumns: 3,
            note: 'Read-only demo. Auth/replay binding and key setup omitted.',
          },
        ],
        notesSteps: [
          'All helper code is shown. app.approvals, app.tools, app.done and app.error are this demo protocol. Both tools wait before execution. Decisions cover the whole batch. Denial produces an error result without running a handler. Approval returns to Server before Browser receives an execution request. Browser carries unsigned pause/cache state. No authentication, replay binding, durable recovery or automatic retries. These read-only clocks do not demonstrate a production security boundary. Ten provider responses per turn. The host supplies the server-only provider URL/headers and links disconnect to request.signal.',
        ],
      },
      {
        id: 'tanstack-approval-definitions',
        camera: mapCam.codeWall,
        form: 'code',
        halfPanel: true,
        lang: 'ts',
        steps: 1,
        title: 'tools.ts',
        lines: tanstackApprovalDefinitions.split('\n'),
        highlight: [13],
        note: 'Only the server clock needs approval.',
      },
      approvalWall,
      {
        ...approvalWall,
        id: 'tanstack-approvals-focus',
        title: 'The approval code stays small',
        wallColumns: approvalWall.wallColumns.map((column, side) => {
          const lines = column.lines
          const focused = lines.flatMap((line, index) =>
            side !== 0
              ? []
              : line.includes('interrupts, resuming,')
                ? [index + 1]
                : line.includes('disabled={isLoading ||')
                  ? [[index + 1, index + 2]]
                  : [],
          )
          if (side === 0) {
            const selectionStart = lines.indexOf(
              '  const approval = interrupts.find(',
            )
            const uiStart = lines.indexOf('      {approval && (')
            const uiEnd = lines.indexOf(
              '      {error && <p role="alert">{error.message}</p>}',
            )
            focused.push(
              [selectionStart + 1, selectionStart + 3],
              [uiStart + 1, uiEnd],
            )
          }
          return {
            ...column,
            lines,
            decorations: focused.map((lines) => ({
              lines,
              className: 'th-line--focused',
            })),
          }
        }),
      },
    ]
  })
  .flatMap((slide) =>
    slide.id === 'mcp-punch'
      ? [
          {
            ...slide,
            notes:
              'Server connects to the trusted read-only MCP server. Browser and Provider do not connect to it. The fourth island appears after the title.',
          },
          {
            id: 'diy-mcp-wall',
            camera: mapCam.codeWall,
            form: 'code',
            codeWall: true,
            title: 'MCP with DIY',
            steps: 1,
            notes:
              'Trusted read-only MCP servers with one small tool page. Remote servers validate their tool schemas. Server checks routes, IDs and object arguments. The demo uses unsigned resume state. Auth, replay binding and durable recovery are omitted.',
            wallColumns: [
              {
                title: 'Server',
                lang: 'js',
                lines: diyMcpServer.split('\n'),
                flowColumns: 3,
                note: 'Unsigned demo. Trusted read-only MCP.',
              },
            ],
          },
          {
            id: 'tanstack-mcp-wall',
            camera: mapCam.codeWall,
            form: 'code',
            codeWall: true,
            title: 'MCP with TanStack AI',
            steps: 1,
            wallColumns: [
              {
                title: 'Server',
                lang: 'ts',
                lines: tanstackMcpServer.split('\n'),
                decorations: [
                  { lines: [5, 5], className: 'th-line--focused' },
                  { lines: [12, 15], className: 'th-line--focused' },
                  { lines: [24, 24], className: 'th-line--focused' },
                ],
                note: 'chat discovers remote tools and owns MCP cleanup.',
              },
            ],
          },
          {
            id: 'mcp-multiple-punch',
            camera: mapCam.overview,
            form: 'punch',
            title: 'What if we had multiple MCP servers?',
            steps: 1,
            notes:
              'Two more trusted read-only MCP servers appear. Each connects only to Server. The three names match docs, reference and catalog in the code.',
          },
          {
            id: 'diy-multiple-mcp-wall',
            camera: mapCam.codeWall,
            form: 'code',
            codeWall: true,
            title: 'Multiple MCP servers with DIY',
            steps: 1,
            notes:
              'The same unsigned resume demo connects to docs, reference and catalog. Each trusted server exposes one small page of read-only tools. Auth, replay binding and durable recovery are omitted.',
            wallColumns: [
              {
                title: 'Server',
                lang: 'js',
                lines: diyMultipleMcpServer.split('\n'),
                flowColumns: 3,
                note: 'One route map. Three owned MCP clients.',
              },
            ],
          },
          {
            id: 'tanstack-multiple-mcp-wall',
            camera: mapCam.codeWall,
            form: 'code',
            codeWall: true,
            title: 'An MCP pool with TanStack AI',
            steps: 1,
            wallColumns: [
              {
                title: 'Server',
                lang: 'ts',
                lines: tanstackMultipleMcpServer.split('\n'),
                decorations: [
                  { lines: [5, 5], className: 'th-line--focused' },
                  { lines: [12, 22], className: 'th-line--focused' },
                  { lines: [31, 31], className: 'th-line--focused' },
                ],
                note: 'Config keys prefix tool names. chat owns the pool.',
              },
            ],
          },
        ]
      : [slide],
  )
  .map((slide) => {
    const ranges = {
      'tanstack-anthropic-wall': [
        [],
        [
          [4, 4],
          [12, 12],
        ],
      ],
      'tanstack-xai-wall': [
        [],
        [
          [4, 4],
          [12, 12],
        ],
      ],
    }[slide.id]
    if (!ranges) return slide

    return {
      ...slide,
      wallColumns: slide.wallColumns.map((column, side) =>
        ranges[side].length
          ? {
              ...column,
              decorations: ranges[side].map((lines) => ({
                lines,
                className: 'th-line--focused',
              })),
            }
          : column,
      ),
    }
  })
  // Each boat jump is its own slide, so arrow keys step the trip. The first
  // slide keeps the old ID for deep links.
  .flatMap((slide) =>
    flowLegs[slide.id]
      ? Array.from({ length: flowLegs[slide.id] }, (_, leg) => ({
          ...slide,
          id: leg ? `${slide.id}-${leg + 1}` : slide.id,
          worldId: slide.id,
          worldStep: leg,
        }))
      : [slide],
  )
