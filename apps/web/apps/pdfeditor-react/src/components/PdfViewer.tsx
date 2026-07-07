import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useCallback, useEffect, useRef, useState } from "react"

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PageRenderState {
  pageNum: number
  zoom: number
}

interface PdfViewerProps {
  pdfData: ArrayBuffer | null
}

export const PdfViewer = ({ pdfData }: PdfViewerProps) => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [numPages, setNumPages] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const pageElRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  const renderedPagesRef = useRef<Map<number, PageRenderState>>(new Map())
  const docRef = useRef<PDFDocumentProxy | null>(null)

  const getCanvasRef = useCallback(
    (pageNum: number) => (el: HTMLCanvasElement | null) => {
      if (el) {
        canvasRefs.current.set(pageNum, el)
      } else {
        canvasRefs.current.delete(pageNum)
      }
    },
    [],
  )

  const getPageRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) {
        pageElRefs.current.set(pageNum, el)
      } else {
        pageElRefs.current.delete(pageNum)
      }
    },
    [],
  )

  useEffect(() => {
    if (!pdfData) {
      setDoc(null)
      setNumPages(0)
      setLoading(false)
      setError(null)
      return
    }

    for (const task of renderTasksRef.current.values()) {
      task.cancel()
    }
    renderTasksRef.current.clear()
    renderedPagesRef.current.clear()
    canvasRefs.current.clear()
    pageElRefs.current.clear()

    setLoading(true)
    setError(null)

    const loadingTask = getDocument({ data: pdfData })

    loadingTask.promise
      .then((pdf) => {
        setDoc(pdf)
        setNumPages(pdf.numPages)
        docRef.current = pdf
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })

    return () => {
      loadingTask.destroy()
      docRef.current = null
    }
  }, [pdfData])

  const renderPage = useCallback(
    async (pageNum: number, currentDoc: PDFDocumentProxy, currentZoom: number) => {
      const canvas = canvasRefs.current.get(pageNum)
      if (!canvas) return

      const existingTask = renderTasksRef.current.get(pageNum)
      if (existingTask) {
        existingTask.cancel()
      }

      try {
        const pdfPage = await currentDoc.getPage(pageNum)
        const viewport = pdfPage.getViewport({ scale: currentZoom / 100 })
        canvas.width = viewport.width
        canvas.height = viewport.height

        const renderTask = pdfPage.render({
          canvas,
          viewport,
        })

        renderTasksRef.current.set(pageNum, renderTask)

        await renderTask.promise

        renderTasksRef.current.delete(pageNum)
        renderedPagesRef.current.set(pageNum, { pageNum, zoom: currentZoom })
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "RenderingCancelledException") {
          console.error(`Failed to render page ${pageNum}:`, err)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!doc) return

    const currentZoom = zoom

    const visiblePages: number[] = []
    for (const [pageNum] of renderedPagesRef.current) {
      visiblePages.push(pageNum)
    }

    for (const task of renderTasksRef.current.values()) {
      task.cancel()
    }
    renderTasksRef.current.clear()
    renderedPagesRef.current.clear()

    for (const pageNum of visiblePages) {
      void renderPage(pageNum, doc, currentZoom)
    }
  }, [zoom, doc, renderPage])

  useEffect(() => {
    if (!doc || !containerRef.current) return

    const currentDoc = doc
    const currentZoom = zoom

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageEl = entry.target as HTMLElement
          const pageNum = Number.parseInt(pageEl.dataset.pageNum ?? "0", 10)
          if (entry.isIntersecting) {
            const rendered = renderedPagesRef.current.get(pageNum)
            if (!rendered || rendered.zoom !== currentZoom) {
              void renderPage(pageNum, currentDoc, currentZoom)
            }
          }
        }
      },
      { root: containerRef.current, rootMargin: "200px" },
    )

    for (const el of pageElRefs.current.values()) {
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
    }
  }, [doc, zoom, renderPage])

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(500, z + 25))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(10, z - 25))
  }, [])

  const fitWidth = useCallback(() => {
    const currentDoc = docRef.current
    const container = containerRef.current
    if (!currentDoc || !container) return
    void currentDoc.getPage(1).then((page) => {
      const vp = page.getViewport({ scale: 1 })
      const containerWidth = container.clientWidth
      const fitScale = Math.max(10, Math.round(((containerWidth - 40) / vp.width) * 100))
      setZoom(fitScale)
    })
  }, [])

  const fitPage = useCallback(() => {
    const currentDoc = docRef.current
    const container = containerRef.current
    if (!currentDoc || !container) return
    void currentDoc.getPage(1).then((page) => {
      const vp = page.getViewport({ scale: 1 })
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      const scaleX = (containerWidth - 40) / vp.width
      const scaleY = (containerHeight - 40) / vp.height
      const fitScale = Math.max(10, Math.round(Math.min(scaleX, scaleY) * 100))
      setZoom(fitScale)
    })
  }, [])

  if (!pdfData) {
    return (
      <div className="pdf-viewer pdf-viewer--empty">
        <p>No PDF loaded</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pdf-viewer pdf-viewer--loading">
        <p>Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pdf-viewer pdf-viewer--error">
        <p>Error: {error}</p>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="pdf-viewer pdf-viewer--empty">
        <p>No PDF loaded</p>
      </div>
    )
  }

  return (
    <div
      className="pdf-viewer"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div
        className="pdf-viewer-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "#f5f5f5",
          borderBottom: "1px solid #ddd",
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={zoomOut} title="Zoom Out">
          −
        </button>
        <span style={{ minWidth: 48, textAlign: "center", fontWeight: 600 }}>{zoom}%</span>
        <button type="button" onClick={zoomIn} title="Zoom In">
          +
        </button>
        <span style={{ color: "#999" }}>|</span>
        <button type="button" onClick={fitWidth} title="Fit Width">
          Fit Width
        </button>
        <button type="button" onClick={fitPage} title="Fit Page">
          Fit Page
        </button>
        <span style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
          Page{" "}
          {renderedPagesRef.current.size > 0
            ? [...renderedPagesRef.current.keys()].sort((a, b) => a - b)[0]
            : "—"}{" "}
          of {numPages}
        </span>
      </div>

      <div
        ref={containerRef}
        className="pdf-viewer-pages"
        style={{
          flex: 1,
          overflow: "auto",
          background: "#e8e8e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 20,
          gap: 16,
        }}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            ref={getPageRef(pageNum)}
            data-page-num={pageNum}
            style={{
              background: "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              lineHeight: 0,
            }}
          >
            <canvas ref={getCanvasRef(pageNum)} />
          </div>
        ))}
      </div>
    </div>
  )
}
