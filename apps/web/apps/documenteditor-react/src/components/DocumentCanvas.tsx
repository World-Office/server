import { useEffect, useRef, useState } from "react"
import { isCanvasFormat, loadWasmRenderer, renderDocumentToCanvas } from "../lib/wasm-renderer"

interface DocumentCanvasProps {
  blob: Blob
  fileName: string
}

export function DocumentCanvas({ blob, fileName }: DocumentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<"loading" | "rendering" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const lastBlobUrlRef = useRef<string | null>(null)

  const format = fileName.toLowerCase().split(".").pop() ?? ""

  useEffect(() => {
    let cancelled = false

    async function load() {
      await loadWasmRenderer()
      if (cancelled) return
      setStatus("rendering")
    }

    if (isCanvasFormat(fileName)) {
      load()
    } else {
      setStatus("ready")
    }

    return () => {
      cancelled = true
    }
  }, [fileName])

  useEffect(() => {
    if (!isCanvasFormat(fileName) || status !== "rendering" || !canvasRef.current) return

    let cancelled = false

    async function render() {
      try {
        if (lastBlobUrlRef.current) {
          URL.revokeObjectURL(lastBlobUrlRef.current)
          lastBlobUrlRef.current = null
        }

        const buffer = await blob.arrayBuffer()
        if (cancelled) return

        const bytes = new Uint8Array(buffer)
        const canvas = canvasRef.current
        if (!canvas) return
        const rendered = renderDocumentToCanvas(bytes, format, canvas)

        if (!cancelled) {
          setStatus(rendered ? "ready" : "error")
          if (!rendered) {
            setErrorMsg("WASM renderer not built yet")
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          setErrorMsg(err instanceof Error ? err.message : "Failed to render document")
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [blob, format, fileName, status])

  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current)
      }
    }
  }, [])

  if (status === "loading") {
    return (
      <div className="de-document-canvas de-document-canvas--loading" style={containerStyle}>
        <p style={messageStyle}>Initializing renderer...</p>
      </div>
    )
  }

  if (status === "rendering") {
    return (
      <div className="de-document-canvas de-document-canvas--rendering" style={containerStyle}>
        <p style={messageStyle}>Rendering document...</p>
      </div>
    )
  }

  if (status === "error" && errorMsg) {
    return (
      <div className="de-document-canvas de-document-canvas--error" style={containerStyle}>
        <p style={messageStyle}>Failed to render: {errorMsg}</p>
      </div>
    )
  }

  return (
    <div className="de-document-canvas" style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
          display: "block",
        }}
      />
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  backgroundColor: "#e8e8e8",
  padding: "24px",
  overflow: "auto",
}

const messageStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "14px",
  margin: 0,
}
