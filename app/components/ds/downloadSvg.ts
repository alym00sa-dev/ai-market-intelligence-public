// Serialize an on-page SVG to a high-res PNG and trigger a download.
// CSS custom properties (var(--x)) are resolved against :root so the exported
// image matches what's on screen — useful for dropping charts into slide decks.

function xmlAttrEscape(v: string): string {
  // Resolved values land inside double-quoted XML attributes. Next.js font vars
  // resolve to a list containing double quotes (e.g. "__IBM_Plex_Sans_xxx"), which
  // would break the attribute and make the SVG fail to parse — so escape them.
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function resolveCssVars(svg: string, rootEl: Element): string {
  const root = getComputedStyle(rootEl)
  // Handle both var(--x) and var(--x, fallback).
  return svg.replace(/var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/gi, (_m, name) => {
    return xmlAttrEscape(root.getPropertyValue(name).trim() || "#000")
  })
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function serializeSvg(svg: SVGSVGElement): { str: string; w: number; h: number } {
  const vb = svg.viewBox?.baseVal
  const w = (vb && vb.width) || svg.clientWidth || parseFloat(svg.getAttribute("width") || "") || 320
  const h = (vb && vb.height) || svg.clientHeight || parseFloat(svg.getAttribute("height") || "") || 320
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(w))
  clone.setAttribute("height", String(h))
  let str = new XMLSerializer().serializeToString(clone)
  str = resolveCssVars(str, svg.ownerDocument.documentElement)
  return { str, w, h }
}

/** Download the SVG as a PNG. Falls back to a raw .svg download if rasterization fails. */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 3) {
  const { str, w, h } = serializeSvg(svg)
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str)

  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("SVG failed to load as image"))
      img.src = dataUrl
    })

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d context")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"))
    if (!blob) throw new Error("toBlob returned null")
    const url = URL.createObjectURL(blob)
    triggerDownload(url, filename)
    URL.revokeObjectURL(url)
  } catch (err) {
    // Fallback: hand back the vector SVG (PowerPoint/Keynote import it fine).
    console.warn("[downloadSvg] PNG export failed, falling back to .svg:", err)
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str)
    triggerDownload(svgUrl, filename.replace(/\.png$/i, ".svg"))
  }
}
