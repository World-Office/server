import { useEffect, useRef, useState } from "react"

import type { PDFDocumentProxy } from "pdfjs-dist"
import { pdfStore } from "../../stores/PdfStore"

const THUMB_SCALE = 0.2

interface ThumbnailEntry {
  pageNum: number
  dataUrl: string
}

export function ThumbnailPanel() {
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedRef = useRef<Set<number>>(new Set())

  // biome-ignore lint/correctness/useExhaustiveDependencies: pdfStore.pdfDocProxy is a MobX observable
  useEffect(() => {
    const proxy = pdfStore.pdfDocProxy
    if (!proxy) {
      setThumbnails([])
      renderedRef.current.clear()
      return
    }

    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    void generateThumbnails(proxy, canvas, renderedRef.current).then((result) => {
      if (!cancelled) {
        setThumbnails(result)
      }
    })

    return () => {
      cancelled = true
      renderedRef.current.clear()
    }
  }, [pdfStore.pdfDocProxy])

  function scrollToPage(pageNum: number) {
    pdfStore.setCurrentPage(pageNum - 1)
  }

  return (
    <div className="pdf-thumbnail-panel">
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="pdf-thumbnail-list">
        {thumbnails.map(({ pageNum, dataUrl }) => (
          <button
            key={pageNum}
            type="button"
            className={`pdf-thumbnail-item${pdfStore.currentPage === pageNum - 1 ? " pdf-thumbnail-item--active" : ""}`}
            onClick={() => scrollToPage(pageNum)}
            title={`Page ${pageNum}`}
          >
            <img src={dataUrl} alt={`Page ${pageNum}`} draggable={false} />
            <span className="pdf-thumbnail-label">{pageNum}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

async function generateThumbnails(
  proxy: PDFDocumentProxy,
  offscreenCanvas: HTMLCanvasElement,
  rendered: Set<number>,
): Promise<ThumbnailEntry[]> {
  const results: ThumbnailEntry[] = []

  const batch = 5
  for (let i = 1; i <= proxy.numPages; i += batch) {
    const batchPromises = []
    for (let j = i; j < i + batch && j <= proxy.numPages; j++) {
      if (rendered.has(j)) continue
      batchPromises.push(renderThumbnail(proxy, j, offscreenCanvas))
    }

    const batchResults = await Promise.all(batchPromises)
    for (const result of batchResults) {
      if (result) {
        results.push(result)
        rendered.add(result.pageNum)
      }
    }
  }

  return results
}

async function renderThumbnail(
  proxy: PDFDocumentProxy,
  pageNum: number,
  offscreenCanvas: HTMLCanvasElement,
): Promise<ThumbnailEntry | null> {
  try {
    const page = await proxy.getPage(pageNum)
    const viewport = page.getViewport({ scale: THUMB_SCALE })
    offscreenCanvas.width = viewport.width
    offscreenCanvas.height = viewport.height

    const ctx = offscreenCanvas.getContext("2d")
    if (!ctx) return null

    ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas: offscreenCanvas }).promise

    return {
      pageNum,
      dataUrl: offscreenCanvas.toDataURL("image/jpeg", 0.6),
    }
  } catch {
    return null
  }
}
