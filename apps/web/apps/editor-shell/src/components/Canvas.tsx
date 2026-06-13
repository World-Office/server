import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { init, renderPage } from "../lib/wasm-renderer"

interface CanvasProps {
  children?: ReactNode
}

export function Canvas({ children }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initialized = useRef(false)
  const [showCanvas, setShowCanvas] = useState(true)

  // If children are provided, show them instead of the canvas
  useEffect(() => {
    setShowCanvas(children === undefined || children === null)
  }, [children])

  // Initialize canvas renderer when no children are provided
  useEffect(() => {
    if (!showCanvas) return
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    renderPage(0, 100)
  }, [showCanvas])

  return (
    <div
      className="canvas-container"
      style={{ overflow: "auto", height: "100%", backgroundColor: "#e8e8e8" }}
    >
      {showCanvas ? (
        <div style={{ margin: "16px auto", display: "flex", justifyContent: "center" }}>
          <canvas
            ref={canvasRef}
            className="shell-canvas"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)" }}
          />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
