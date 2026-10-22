import { parseMarkdown } from '@tanstack/markdown/parser'
import { createHighlighter, renderTokens } from '@tanstack/highlight/core'
import { js } from '@tanstack/highlight/languages/js'
import { ts } from '@tanstack/highlight/languages/ts'
import { jsx } from '@tanstack/highlight/languages/jsx'
import { python } from '@tanstack/highlight/languages/python'
import { php } from '@tanstack/highlight/languages/php'
import { githubLightTheme } from '@tanstack/highlight/themes/github-light'

const W = 1920
const H = 1080
const highlighter = createHighlighter({ languages: [js, ts, jsx, python, php] })
const codeCache = new Map()
const mutedCodeColors = Object.fromEntries(
  Object.entries(githubLightTheme.tokens).map(([name, color]) => {
    const channels = [1, 3, 5].map((offset, index) =>
      Math.round(
        parseInt(color.slice(offset, offset + 2), 16) * 0.72 +
          [50, 60, 68][index] * 0.28,
      ),
    )
    return [name, `rgb(${channels.join(',')})`]
  }),
)

function highlightedLines(lines, language, decorations = []) {
  const source = lines.join('\n')
  const lang =
    language === 'php'
      ? 'php'
      : language === 'python'
        ? 'python'
        : language === 'jsx'
          ? 'jsx'
          : language === 'ts'
            ? 'ts'
            : 'js'
  const key = `${lang}:${source}:${JSON.stringify(decorations)}`
  if (codeCache.has(key)) return codeCache.get(key)
  const document = parseMarkdown(`~~~${lang}\n${source}\n~~~`)
  const block = document.children.find((node) => node.type === 'code')
  const tokens = highlighter.tokenize(block.value, { lang: block.lang }).tokens
  const rows = [[]]
  for (const token of tokens) {
    token.value.split('\n').forEach((value, index) => {
      if (index > 0) rows.push([])
      if (value)
        rows[rows.length - 1].push({ value, className: token.className })
    })
  }
  if (decorations.length) {
    renderTokens(tokens, { decorations })
      .filter(
        (node) =>
          node.type === 'element' && node.classNames.includes('th-line'),
      )
      .forEach((node, index) => {
        rows[index].focused = node.classNames.includes('th-line--focused')
      })
  }
  codeCache.set(key, rows)
  return rows
}

let fontsReady = false
const waiters = []

function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) {
    fontsReady = true
    return
  }
  const faces = [
    new FontFace(
      'Bricolage Grotesque',
      'url(./fonts/BricolageGrotesque-Bold.ttf)',
      {
        weight: '700',
      },
    ),
    new FontFace('Inter', 'url(./fonts/Inter-Regular.ttf)', { weight: '400' }),
  ]
  Promise.all(faces.map((face) => face.load()))
    .then((loaded) => {
      loaded.forEach((face) => document.fonts.add(face))
      fontsReady = true
      waiters.splice(0).forEach((cb) => cb())
    })
    .catch(() => {
      fontsReady = true
      waiters.splice(0).forEach((cb) => cb())
    })
}

loadFonts()

export function whenFontsReady(cb) {
  if (fontsReady) cb()
  else waiters.push(cb)
}

function fill(ctx, theme) {
  if (
    ctx.surfaceAppearance === 'floating' ||
    ctx.surfaceAppearance === 'cloud-ink'
  )
    return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(130, 845)
  ctx.bezierCurveTo(5, 830, 0, 635, 87, 573)
  ctx.bezierCurveTo(-12, 416, 56, 195, 220, 197)
  ctx.bezierCurveTo(246, 39, 439, 19, 548, 90)
  ctx.bezierCurveTo(669, -7, 847, 11, 916, 69)
  ctx.bezierCurveTo(1050, -3, 1265, 20, 1320, 93)
  ctx.bezierCurveTo(1488, 8, 1700, 55, 1722, 195)
  ctx.bezierCurveTo(1893, 167, 1950, 353, 1859, 485)
  ctx.bezierCurveTo(1980, 620, 1903, 827, 1804, 851)
  ctx.bezierCurveTo(1833, 984, 1643, 1065, 1507, 994)
  ctx.bezierCurveTo(1370, 1100, 1160, 1031, 1064, 1002)
  ctx.bezierCurveTo(876, 1090, 700, 1040, 610, 998)
  ctx.bezierCurveTo(438, 1081, 268, 1035, 252, 942)
  ctx.bezierCurveTo(169, 959, 102, 914, 130, 845)
  ctx.closePath()
  const cloud = ctx.createLinearGradient(0, 60, 0, 1080)
  cloud.addColorStop(0, '#ffffff')
  cloud.addColorStop(0.6, '#f9fcfc')
  cloud.addColorStop(1, '#dce9ee')
  ctx.shadowColor = 'rgba(191,218,231,.4)'
  ctx.shadowBlur = 32
  ctx.filter = 'blur(12px)'
  ctx.fillStyle = cloud
  ctx.fill()
  ctx.filter = 'none'
  ctx.shadowBlur = 0
  ctx.clip()
  const puffs = [
    [280, 245, 230],
    [555, 142, 220],
    [940, 103, 265],
    [1320, 140, 245],
    [1665, 275, 250],
    [1762, 560, 230],
    [1620, 862, 245],
    [1280, 952, 240],
    [880, 961, 240],
    [520, 943, 240],
    [250, 791, 220],
    [115, 499, 215],
  ]
  puffs.forEach(([x, y, radius]) => {
    const volume = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.38,
      radius * 0.03,
      x,
      y,
      radius,
    )
    volume.addColorStop(0, 'rgba(255,255,255,.95)')
    volume.addColorStop(0.48, 'rgba(249,253,255,.52)')
    volume.addColorStop(0.78, 'rgba(183,204,218,.12)')
    volume.addColorStop(0.88, 'rgba(114,151,174,.18)')
    volume.addColorStop(1, 'rgba(114,151,174,0)')
    ctx.fillStyle = volume
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.scale(1, 0.6)
  const center = ctx.createRadialGradient(0, 0, 250, 0, 0, 850)
  center.addColorStop(0, 'rgba(250,253,253,1)')
  center.addColorStop(0.7, 'rgba(250,253,253,.95)')
  center.addColorStop(1, 'rgba(250,253,253,0)')
  ctx.fillStyle = center
  ctx.fillRect(-W, -H, W * 2, H * 2)
  ctx.restore()
  ctx.restore()
}

function setDisplay(ctx, size) {
  ctx.font = `700 ${size}px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif`
}

function setBody(ctx, size, weight = '400') {
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, sans-serif`
}

function setMono(ctx, size) {
  ctx.font = `400 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
}

function wrap(ctx, text, maxWidth) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function paintTitle(ctx, slide, theme) {
  fill(ctx, theme)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f6edd7'
  setBody(ctx, 36, '400')
  ctx.shadowColor = 'rgba(38,46,48,.55)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 3
  ctx.fillText(slide.kicker || '', W / 2, 260)
  ctx.fillStyle = '#fff9e9'
  setDisplay(ctx, 102)
  const lines = wrap(ctx, slide.title, W - 320)
  const top = 420 - (lines.length - 3) * 48
  lines.forEach((line, i) => ctx.fillText(line, W / 2, top + i * 120))
}

function paintStatement(ctx, slide, theme) {
  fill(ctx, theme)
  ctx.fillStyle = theme.ink
  if (slide.halfPanel) {
    ctx.save()
    if (ctx.surfaceAppearance !== 'cloud-ink') ctx.translate(480, 0)
    setDisplay(ctx, slide.id === 'hops-stay' ? 70 : 58)
    const paragraphs =
      slide.id === 'hops-stay'
        ? slide.title.match(/[^.!?]+[.!?]?/g)
        : slide.title.split('\n')
    const lines = paragraphs.flatMap((line) => wrap(ctx, line.trim(), 760))
    const top = Math.max(190, (H - lines.length * 84) / 2 + 55)
    lines.forEach((line, index) => ctx.fillText(line, 100, top + index * 84))
    ctx.restore()
    return
  }
  if (slide.captionCard) {
    setDisplay(ctx, 90)
    ctx.textAlign = 'center'
    const lines = slide.title
      .split('\n')
      .flatMap((line) => wrap(ctx, line, W - 440))
    const top = (H - lines.length * 140) / 2 + 100
    lines.forEach((line, index) => ctx.fillText(line, W / 2, top + index * 140))
    return
  }
  setDisplay(ctx, slide.id === 'hops-stay' ? 172 : 80)
  const lines =
    slide.id === 'hops-stay'
      ? slide.title.match(/[^.!?]+[.!?]?/g).map((line) => line.trim())
      : wrap(ctx, slide.title, W - 280)
  const leading = slide.id === 'hops-stay' ? 205 : 96
  const top = (H - lines.length * leading) / 2 + leading * 0.55
  lines.forEach((line, i) => ctx.fillText(line, 140, top + i * leading))
}

function paintQuote(ctx, slide, theme) {
  fill(ctx, theme)
  ctx.fillStyle = theme.ink
  setDisplay(ctx, 56)
  const lines = wrap(ctx, `"${slide.quote || ''}"`, W - 320)
  lines.forEach((line, i) => ctx.fillText(line, 160, 360 + i * 78))
  ctx.fillStyle = theme.muted
  setBody(ctx, 32)
  ctx.fillText(slide.attribution || '', 160, 360 + lines.length * 78 + 48)
}

function paintChart(ctx, slide, theme, step) {
  fill(ctx, theme)
  ctx.fillStyle = theme.ink
  setDisplay(ctx, 48)
  ctx.fillText(slide.title || '', 160, 160)
  const bars = slide.bars || []
  const shown = bars.slice(0, step + 1)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const slot = (W - 320) / Math.max(1, bars.length)
  shown.forEach((bar, i) => {
    const h = (bar.value / max) * 620
    const x = 160 + i * slot
    const y = 900 - h
    ctx.fillStyle = theme.accent
    ctx.fillRect(x, y, slot * 0.55, h)
    ctx.fillStyle = theme.muted
    setBody(ctx, 28)
    ctx.fillText(bar.label, x, 960)
  })
}

function paintCode(ctx, slide, theme, step) {
  if (slide.codeWall) {
    const columns = slide.wallColumns || [slide]
    const flat = ctx.surfaceAppearance !== 'cloud-ink'
    const inset = flat ? 180 : 100
    const width = flat ? 600 : 760
    const top = flat ? 250 : 210
    const height = flat ? 680 : 750
    columns.forEach((column, index) => {
      ctx.save()
      ctx.translate(index * 960 + (flat && columns.length === 1 ? 480 : 0), 0)
      ctx.save()
      ctx.scale(0.5, 1)
      fill(ctx, theme)
      ctx.restore()
      ctx.fillStyle = theme.ink
      setDisplay(ctx, 52)
      ctx.fillText(column.title, inset, flat ? 180 : 140)
      const flowCount = column.flowColumns || 1
      const rowCount = Math.ceil(column.lines.length / flowCount)
      const flowWidth = (width - (flowCount - 1) * 40) / flowCount
      const fitSources = column.fitSources || [column.lines]
      const fitRows = Math.max(
        ...fitSources.map((lines) => Math.ceil(lines.length / flowCount)),
      )
      setMono(ctx, 1)
      const widest = Math.max(
        ...fitSources.flatMap((lines) =>
          lines.map((line) => ctx.measureText(line).width),
        ),
        1,
      )
      const fontSize = Math.min(
        flowWidth / widest,
        height / Math.max(1, fitRows - 1) / 1.18,
      )
      if (flowCount > 1) {
        setBody(ctx, 18)
        ctx.fillStyle = theme.muted
        for (let flow = 0; flow < flowCount; flow++) {
          ctx.fillText(
            `${flow * rowCount + 1}–${Math.min(column.lines.length, (flow + 1) * rowCount)}`,
            inset + flow * (flowWidth + 40),
            top - 24,
          )
        }
      }
      setMono(ctx, fontSize)
      highlightedLines(
        column.lines,
        column.lang || slide.lang,
        column.decorations,
      ).forEach((tokens, row) => {
        const flow = Math.floor(row / rowCount)
        const y = top + (row % rowCount) * fontSize * 1.18
        const x = inset + flow * (flowWidth + 40)
        ctx.save()
        if (tokens.focused === false) ctx.globalAlpha *= 0.2
        if (tokens.focused) {
          ctx.fillStyle = theme.accent
          ctx.fillRect(x - 14, y - fontSize * 0.85, 4, fontSize * 1.18)
        }
        let prefix = ''
        tokens.forEach((token) => {
          ctx.fillStyle = githubLightTheme.tokens[token.className] || theme.ink
          ctx.fillText(token.value, x + ctx.measureText(prefix).width, y)
          prefix += token.value
        })
        ctx.restore()
      })
      setBody(ctx, 24)
      ctx.fillStyle = theme.muted
      ctx.fillText(column.note || '', inset, flat ? 970 : 1008)
      ctx.restore()
    })
    return
  }
  fill(ctx, theme)
  if (slide.halfPanel) {
    ctx.save()
    if (ctx.surfaceAppearance !== 'cloud-ink') ctx.translate(480, 0)
    ctx.fillStyle = theme.ink
    setDisplay(ctx, 44)
    const heading = wrap(ctx, slide.titlesSteps?.[step] || slide.title, 760)
    heading.forEach((line, index) => ctx.fillText(line, 100, 140 + index * 52))
    const headerBottom = 140 + (heading.length - 1) * 52
    setBody(ctx, 36)
    const notes = wrap(ctx, slide.notesSteps?.[step] || slide.note || '', 760)
    const noteTop = 980 - Math.max(0, notes.length - 1) * 44
    const codeBottom = noteTop - 64
    const columns = slide.columnsSteps?.[step]
    if (columns) {
      setDisplay(ctx, 38)
      const labels = columns.map((column) => wrap(ctx, column.title, 760))
      const top = headerBottom + 48
      const labelHeight = labels.reduce(
        (height, lines) => height + lines.length * 46 + 18,
        0,
      )
      setMono(ctx, 100)
      const metrics = ctx.measureText('Mg(){}|_')
      const ascent = metrics.actualBoundingBoxAscent / 100
      const descent = metrics.actualBoundingBoxDescent / 100
      const widest = Math.max(
        1,
        ...columns.flatMap((column) =>
          column.lines.map((line) => ctx.measureText(line).width / 100),
        ),
      )
      const rowsHeight = columns.reduce(
        (height, column) =>
          height +
          ascent +
          descent +
          Math.max(0, column.lines.length - 1) * 1.18,
        0,
      )
      const availableHeight =
        codeBottom - top - labelHeight - (columns.length - 1) * 64
      const fontSize = Math.min(760 / widest, availableHeight / rowsHeight)
      if (
        ![widest, availableHeight, fontSize].every(
          (value) => Number.isFinite(value) && value > 0,
        )
      ) {
        throw new Error(
          `Code panel "${slide.id || slide.title}" cannot fit: stacked headings and notes leave ${availableHeight}px for code. Reflow the panel content.`,
        )
      }
      const leading = fontSize * 1.18
      let y = top
      columns.forEach((column, columnIndex) => {
        setDisplay(ctx, 38)
        ctx.fillStyle = theme.accent
        labels[columnIndex].forEach((line, index) =>
          ctx.fillText(line, 100, y + index * 46),
        )
        y += labels[columnIndex].length * 46 + 18 + ascent * fontSize
        setMono(ctx, fontSize)
        highlightedLines(column.lines, column.lang || slide.lang).forEach(
          (tokens, row) => {
            let prefix = ''
            tokens.forEach((token) => {
              ctx.fillStyle =
                githubLightTheme.tokens[token.className] || theme.ink
              ctx.fillText(
                token.value,
                100 + ctx.measureText(prefix).width,
                y + row * leading,
              )
              prefix += token.value
            })
          },
        )
        y +=
          Math.max(0, column.lines.length - 1) * leading +
          descent * fontSize +
          64
      })
      setBody(ctx, 36)
      ctx.fillStyle = theme.muted
      notes.forEach((line, index) =>
        ctx.fillText(line, 100, noteTop + index * 44),
      )
      ctx.restore()
      return
    }
    setBody(ctx, 36)
    const subtitle = wrap(ctx, slide.subtitle || '', 760)
    subtitle.forEach((line, index) =>
      ctx.fillText(line, 100, headerBottom + 70 + index * 44),
    )
    const lines = slide.linesSteps?.[step] || slide.lines || []
    const top = headerBottom + 60 + subtitle.length * 44
    setMono(ctx, 100)
    const metrics = ctx.measureText('Mg(){}|_')
    const ascent = metrics.actualBoundingBoxAscent / 100
    const descent = metrics.actualBoundingBoxDescent / 100
    const widest = Math.max(
      1,
      ...lines.map((line) => ctx.measureText(line).width / 100),
    )
    const availableHeight = codeBottom - top
    const fontSize = Math.min(
      760 / widest,
      availableHeight /
        (ascent + descent + Math.max(0, lines.length - 1) * 1.18),
    )
    if (
      ![widest, availableHeight, fontSize].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new Error(
        `Code panel "${slide.id || slide.title}" cannot fit: heading and notes leave ${availableHeight}px for code. Reflow the panel content.`,
      )
    }
    const codeTop = top + ascent * fontSize
    const leading = fontSize * 1.18
    const highlights = new Set(
      slide.highlightSteps?.[step] || slide.highlight || [],
    )
    setMono(ctx, fontSize)
    highlightedLines(lines, slide.lang).forEach((tokens, row) => {
      let prefix = ''
      const active = !highlights.size || highlights.has(row)
      if (highlights.has(row)) {
        ctx.fillStyle = theme.accent
        ctx.fillRect(
          78,
          codeTop + row * leading - ascent * fontSize,
          4,
          (ascent + descent) * fontSize,
        )
      }
      tokens.forEach((token) => {
        ctx.fillStyle = active
          ? githubLightTheme.tokens[token.className] || theme.ink
          : mutedCodeColors[token.className] || '#424b52'
        ctx.fillText(
          token.value,
          100 + ctx.measureText(prefix).width,
          codeTop + row * leading,
        )
        prefix += token.value
      })
    })
    setBody(ctx, 36)
    ctx.fillStyle = theme.muted
    notes.forEach((line, index) =>
      ctx.fillText(line, 100, noteTop + index * 44),
    )
    ctx.restore()
    return
  }
  ctx.fillStyle = theme.ink
  setDisplay(ctx, slide.sidebar ? 52 : 40)
  ctx.fillText(slide.title || '', 300, 240)
  if (slide.sidebar && slide.subtitle) {
    setBody(ctx, 52)
    ctx.fillText(slide.subtitle, 220, 295)
  }
  const columns = slide.columnsSteps?.[step]
  if (columns) {
    columns.forEach((column, index) => {
      const x = 135 + index * 865
      setDisplay(ctx, 38)
      ctx.fillStyle = theme.accent
      ctx.fillText(column.title, x, 320)
      setMono(ctx, 42)
      highlightedLines(column.lines, slide.lang).forEach((tokens, row) => {
        let prefix = ''
        tokens.forEach((token) => {
          ctx.fillStyle = githubLightTheme.tokens[token.className] || theme.ink
          ctx.fillText(
            token.value,
            x + ctx.measureText(prefix).width,
            390 + row * 44,
          )
          prefix += token.value
        })
      })
    })
    setBody(ctx, 40)
    ctx.fillStyle = theme.muted
    wrap(ctx, slide.notesSteps?.[step] || '', 1440).forEach((line, index) =>
      ctx.fillText(line, 240, 700 + index * 44),
    )
    return
  }
  const lines = (slide.linesSteps?.[step] || slide.lines || []).slice(0, 7)
  const highlightList = slide.highlightSteps?.[step] || slide.highlight || []
  const highlight = new Set(highlightList)
  const rows = highlightedLines(lines, slide.lang)
  setMono(ctx, slide.sidebar ? 64 : 44)
  rows.forEach((tokens, i) => {
    const y = (slide.sidebar ? 365 : 320) + i * (slide.sidebar ? 58 : 52)
    const active = highlight.size === 0 || highlight.has(i)
    if (highlight.has(i)) {
      ctx.fillStyle = theme.accent
      ctx.fillRect(155, y - 36, 5, 44)
    }
    ctx.globalAlpha = 1
    let prefix = ''
    tokens.forEach((token) => {
      ctx.fillStyle = active
        ? githubLightTheme.tokens[token.className] ||
          githubLightTheme.foreground ||
          theme.ink
        : mutedCodeColors[token.className] || '#424b52'
      ctx.fillText(token.value, 180 + ctx.measureText(prefix).width, y)
      prefix += token.value
    })
  })
  ctx.globalAlpha = 1
  const note = slide.notesSteps?.[step] || slide.note
  if (note) {
    setBody(ctx, slide.sidebar ? 60 : 40)
    ctx.fillStyle = theme.muted
    wrap(ctx, note, 1440).forEach((line, index) =>
      ctx.fillText(line, 240, (slide.sidebar ? 730 : 700) + index * 44),
    )
  }
}

function paintImage(ctx, slide, theme) {
  fill(ctx, theme)
  ctx.fillStyle = theme.muted
  setBody(ctx, 32)
  ctx.fillText(slide.caption || 'ASSET NEEDED', 160, 200)
  ctx.strokeStyle = theme.muted
  ctx.strokeRect(160, 240, W - 320, 680)
  ctx.fillStyle = theme.ink
  setDisplay(ctx, 40)
  ctx.fillText(slide.title || '', 180, 300)
  if (slide._image) {
    ctx.drawImage(slide._image, 160, 240, W - 320, 680)
  }
}

function paintPunch(ctx, slide, theme) {
  fill(ctx, theme)
  if (!slide.title) return
  ctx.fillStyle = theme.ink
  setDisplay(ctx, 72)
  const lines = wrap(ctx, slide.title, W - 280)
  const top = (H - lines.length * 90) / 2 + 40
  lines.forEach((line, i) => ctx.fillText(line, 140, top + i * 90))
}

export function paint(canvas, slide, step, theme, appearance) {
  if (!appearance && slide?.hopCode) slide = slide.hopCode
  if (!appearance && (slide.splitSide || slide.splitSides || slide.sidebar)) {
    slide = { ...slide, halfPanel: true }
    if (slide.form === 'punch')
      slide = {
        ...slide,
        form: 'statement',
        title: slide.captionSteps?.[step] || slide.caption || slide.title,
      }
  }
  if (!appearance && slide.id === 'three-islands')
    slide = { ...slide, title: 'Browser     Server     Provider' }
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  const form = slide?.form || 'statement'
  ctx.surfaceAppearance =
    appearance || (form === 'title' ? 'floating' : 'cloud')
  if (!appearance && form === 'title') {
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#244d67')
    sky.addColorStop(1, '#9e7056')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)
  }
  if (form === 'title') paintTitle(ctx, slide, theme)
  else if (form === 'quote') paintQuote(ctx, slide, theme)
  else if (form === 'chart') paintChart(ctx, slide, theme, step)
  else if (form === 'code') paintCode(ctx, slide, theme, step)
  else if (form === 'image') paintImage(ctx, slide, theme)
  else if (form === 'punch') paintPunch(ctx, slide, theme)
  else paintStatement(ctx, slide, theme)
  ctx.restore()
}

export const CANVAS_SIZE = { w: W, h: H }
