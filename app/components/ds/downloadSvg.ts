// Serialize an on-page SVG to a high-res PNG and trigger a download.
// CSS custom properties (var(--x)) are resolved against :root so the exported
// image matches what's on screen — useful for dropping charts into slide decks.

function resolveCssVars(svg: string): string {
  const root = getComputedStyle(document.documentElement)
  return svg.replace(/var\((--[a-z0-9-]+)\)/gi, (_m, name) => root.getPropertyValue(name).trim() || "#000")
}

export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 3) {
  const w = svg.viewBox.baseVal.width || svg.clientWidth || 360
  const h = svg.viewBox.baseVal.height || svg.clientHeight || 360
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(w))
  clone.setAttribute("height", String(h))
  const str = resolveCssVars(new XMLSerializer().serializeToString(clone))
  const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }))

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })

  const canvas = document.createElement("canvas")
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)

  canvas.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }, "image/png")
}
