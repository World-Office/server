import { GlobalWorkerOptions, getDocument, TextLayer } from "pdfjs-dist"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useCallback, useEffect, useRef, useState } from "react"

import { pdfStore } from "../stores/PdfStore"
import type { AnnotationTool } from "../types/pdf"

const ANNOTATION_COLORS: Record<AnnotationTool, string> = {
  highlight: "#FFEB3B",
  strikeout: "#F44336",
  underline: "#2196F3",
  "text-comment": "#FF9800",
  stamp: "#9C27B0",
  "shape-comment": "#4CAF50",
}

const KEYBOARD_SHORTCUTS: Record<string, AnnotationTool> = {
  h: "highlight",
  s: "strikeout",
  u: "underline",
  t: "text-comment",
  m: "stamp",
  g: "shape-comment",
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const pageElRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "Escape") {
        pdfStore.setAnnotationTool(null)
        return
      }
      const tool = KEYBOARD_SHORTCUTS[e.key.toLowerCase()]
      if (tool) {
        pdfStore.setAnnotationTool(tool === pdfStore.activeAnnotationTool ? null : tool)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])
  const textLayerInstancesRef = useRef<Map<number, TextLayer>>(new Map())
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

  const getTextLayerRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) {
        textLayerRefs.current.set(pageNum, el)
      } else {
        textLayerRefs.current.delete(pageNum)
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

  const handleAnnotLayerClick = useCallback(
    (pageNum: number) => (e: React.MouseEvent<HTMLDivElement>) => {
      const tool = pdfStore.activeAnnotationTool
      if (!tool) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const color = ANNOTATION_COLORS[tool] ?? "#FF9800"
      pdfStore.addAnnotation({
        page: pageNum,
        x,
        y,
        width: 150,
        height: 40,
        color,
        text: tool === "text-comment" ? "" : undefined,
      })
      if (tool !== "highlight" && tool !== "strikeout" && tool !== "underline") {
        pdfStore.setAnnotationTool(null)
      }
    },
    [],
  )

  useEffect(() => {
    if (!pdfData) {
      setDoc(null)
      pdfStore.setPageCount(0)
      pdfStore.setCurrentPage(0)
      pdfStore.setPdfDocProxy(null)
      setLoading(false)
      setError(null)
      return
    }

    for (const task of renderTasksRef.current.values()) {
      task.cancel()
    }
    renderTasksRef.current.clear()
    renderedPagesRef.current.clear()
    for (const tl of textLayerInstancesRef.current.values()) {
      tl.cancel()
    }
    textLayerInstancesRef.current.clear()
    canvasRefs.current.clear()
    textLayerRefs.current.clear()
    pageElRefs.current.clear()

    setLoading(true)
    setError(null)

    const loadingTask = getDocument({ data: pdfData })

    loadingTask.promise
      .then((pdf) => {
        setDoc(pdf)
        pdfStore.setPageCount(pdf.numPages)
        pdfStore.setPdfDocProxy(pdf)
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
      const textLayerDiv = textLayerRefs.current.get(pageNum)
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

        // Size the text layer container to match canvas
        if (textLayerDiv) {
          textLayerDiv.style.width = `${viewport.width}px`
          textLayerDiv.style.height = `${viewport.height}px`
          textLayerDiv.replaceChildren()
        }

        const renderTask = pdfPage.render({
          canvas,
          viewport,
        })

        renderTasksRef.current.set(pageNum, renderTask)

        await renderTask.promise

        renderTasksRef.current.delete(pageNum)

        // Render text layer for text selection
        if (textLayerDiv) {
          try {
            const textContent = await pdfPage.getTextContent()
            const textLayer = new TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
            })
            textLayerInstancesRef.current.set(pageNum, textLayer)
            await textLayer.render()
          } catch {
            // Text layer failure is non-critical
          }
        }

        renderedPagesRef.current.set(pageNum, { pageNum, zoom: currentZoom })
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "RenderingCancelledException") {
          console.error(`Failed to render page ${pageNum}:`, err)
        }
      }
    },
    [],
  )

  // Re-render visible pages when zoom changes
  useEffect(() => {
    if (!doc) return

    const currentZoom = pdfStore.zoomLevel

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
  }, [pdfStore.zoomLevel, doc, renderPage])

  // IntersectionObserver: lazy render + track current page
  useEffect(() => {
    if (!doc || !containerRef.current) return

    const currentDoc = doc

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageEl = entry.target as HTMLElement
          const pageNum = Number.parseInt(pageEl.dataset.pageNum ?? "0", 10)
          if (entry.isIntersecting) {
            const rendered = renderedPagesRef.current.get(pageNum)
            if (!rendered || rendered.zoom !== pdfStore.zoomLevel) {
              void renderPage(pageNum, currentDoc, pdfStore.zoomLevel)
            }
            pdfStore.setCurrentPage(pageNum - 1)
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
  }, [doc, renderPage])

  // Handle fitToPage / fitToWidth from PdfStore
  useEffect(() => {
    if (!doc || !containerRef.current) return

    if (pdfStore.fitToPage) {
      void doc.getPage(1).then((page) => {
        const vp = page.getViewport({ scale: 1 })
        const container = containerRef.current
        if (!container) return
        const scaleX = (container.clientWidth - 40) / vp.width
        const scaleY = (container.clientHeight - 40) / vp.height
        const fitScale = Math.max(50, Math.round(Math.min(scaleX, scaleY) * 100)) as 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500
        pdfStore.setZoomLevel(fitScale)
      })
    } else if (pdfStore.fitToWidth) {
      void doc.getPage(1).then((page) => {
        const vp = page.getViewport({ scale: 1 })
        const container = containerRef.current
        if (!container) return
        const fitScale = Math.max(50, Math.round(((container.clientWidth - 40) / vp.width) * 100)) as 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500
        pdfStore.setZoomLevel(fitScale)
      })
    }
  }, [doc, pdfStore.fitToPage, pdfStore.fitToWidth])

  // Scroll to current page when changed from toolbar
  useEffect(() => {
    const pageEl = pageElRefs.current.get(pdfStore.currentPage + 1)
    if (pageEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const elRect = pageEl.getBoundingClientRect()
    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }, [pdfStore.currentPage])

  const numPages = pdfStore.pageCount

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
        className="pdf-viewer-pages"
        ref={containerRef}
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
              position: "relative",
            }}
          >
            <canvas ref={getCanvasRef(pageNum)} />
            <div
              ref={getTextLayerRef(pageNum)}
              className="pdf-text-layer"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                overflow: "hidden",
                lineHeight: "1",
                fontSize: "1px",
              }}
            />
            <div
              className="pdf-annot-layer"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: pdfStore.activeAnnotationTool ? "auto" : "none",
                cursor: pdfStore.activeAnnotationTool ? "crosshair" : "default",
              }}
              onClick={handleAnnotLayerClick(pageNum)}
            >
              {pdfStore.annotations.filter((a) => a.page === pageNum).map((annot) => (
                <div
                  key={annot.id}
                  style={{
                    position: "absolute",
                    left: annot.x,
                    top: annot.y,
                    width: annot.width,
                    height: annot.height,
                    backgroundColor: annot.color + "40",
                    border: `2px solid ${annot.color}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#333",
                    overflow: "hidden",
                  }}
                  title={annot.text ?? ""}
                  onClick={() => pdfStore.removeAnnotation(annot.id)}
                >
                  {annot.text ? <span style={{ padding: 2, wordBreak: "break-all" }}>{annot.text}</span> : <span style={{ fontSize: 16 }}>📌</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
