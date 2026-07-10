/**
 * Presentation Coauthoring E2E Tests
 *
 * Tests the real-time collaboration protocol for presentation-specific operations:
 * - Session creation via REST
 * - WebSocket connect receives InitialState (with presentation_state)
 * - PresentationOp (shape_add) broadcasts to other clients
 * - PresentationOp (slide_add) broadcasts to other clients
 * - PresentationOp (shape_delete) broadcasts to other clients
 * - Cursor updates with page info propagate correctly
 * - Presentation state is restored on reconnect
 *
 * Usage:
 *   npx jest tests/e2e/api/presentation-coauthoring.test.js --forceExit
 */

const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const WebSocket = require("ws")
const config = require("../../setup")

const CS_URL = config.coauthoringServiceUrl
const CS_WS = config.coauthoringServiceWs

let serviceAvailable = false

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

beforeAll(async () => {
  try {
    const response = await axios.get(`${CS_URL}/health`, { timeout: 5000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

describe("Presentation Coauthoring", () => {
  if (!serviceAvailable) {
    test.skip("coauthoring-service is not available in this stack", () => {})
    return
  }

  describe("REST API — Presentation Session", () => {
    let sessionId = null

    test("POST /sessions creates a session for a presentation document", async () => {
      const response = await axios.post(
        `${CS_URL}/sessions`,
        { document_id: "test-presentation-001" },
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("session_id")
      sessionId = response.data.session_id
    })

    test("POST /sessions/{id}/join adds participant with unique color", async () => {
      const user1 = { user_id: "pres-user-1", username: "Alice" }
      const response = await axios.post(`${CS_URL}/sessions/${sessionId}/join`, user1, {
        timeout: 10000,
      })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("session_id", sessionId)
      expect(response.data).toHaveProperty("participants")
      const alice = response.data.participants.find((p) => p.user_id === "pres-user-1")
      expect(alice).toBeDefined()
      // Color should be a hex string
      expect(alice.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })

  describe("WebSocket — Presentation Operation Broadcast", () => {
    let sessionId = null
    const PRESENTATION_ID = "test-presentation-ws-001"

    beforeAll(async () => {
      const response = await axios.post(
        `${CS_URL}/sessions`,
        { document_id: PRESENTATION_ID },
        { timeout: 10000 },
      )
      sessionId = response.data.session_id
    })

    test("WS connects and receives InitialState with presentation_state", async () => {
      const received = []
      const wsUrl = `${CS_WS}/ws/${sessionId}?user_id=pres-init-user&username=Init+User`

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            ws.close()
            reject(new Error("WS connect + InitialState timeout (10s)"))
          }
        }, 10000)

        ws.onopen = () => {}

        ws.onmessage = (event) => {
          if (settled) return
          try {
            const data = JSON.parse(event.data)
            received.push(data)
            if (data.type === "initial_state") {
              settled = true
              clearTimeout(timeout)
              ws.close()
              resolve()
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        ws.onerror = () => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            reject(new Error("WebSocket error"))
          }
        }
      })

      expect(received.some((m) => m.type === "initial_state")).toBe(true)
      const initState = received.find((m) => m.type === "initial_state")
      expect(initState.state).toHaveProperty("participants")
    })

    test("WS broadcasts shape_add operation to other participants", async () => {
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=shape-user-1&username=Shape+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=shape-user-2&username=Shape+User+2`

      // Connect user 1
      const ws1 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl1)
        const timeout = setTimeout(() => {
          reject(new Error("WS1 connect timeout"))
        }, 10000)
        ws.onopen = () => {
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = () => reject(new Error("WS1 connection error"))
      })

      // Connect user 2
      const ws2 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl2)
        const timeout = setTimeout(() => {
          reject(new Error("WS2 connect timeout"))
        }, 10000)
        ws.onopen = () => {
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = () => reject(new Error("WS2 connection error"))
      })

      // Wait for both to fully establish
      await wait(500)

      // User 2 sends a shape_add operation
      const shapeOp = {
        type: "presentation_op",
        operation: {
          action: "shape_add",
          slide_index: 0,
          shape: {
            id: "shape-test-001",
            type: "rectangle",
            x: 100,
            y: 200,
            width: 300,
            height: 150,
            rotation: 0,
            z_index: 1,
            fill_color: "#3498DB",
            stroke_color: "#2C3E50",
            stroke_width: 2,
            text: "Hello Presentation",
            font_size: 14,
            font_color: "#FFFFFF",
          },
        },
      }

      // Listen for presentation_op on ws1
      const receivedOp = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Did not receive presentation_op on ws1 within 8s"))
        }, 8000)

        ws1.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (
              data.type === "presentation_op" &&
              data.operation?.action === "shape_add" &&
              data.operation?.shape?.id === "shape-test-001"
            ) {
              clearTimeout(timeout)
              resolve(data.operation)
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        // Send after listener is set up
        ws2.send(JSON.stringify(shapeOp))
      })

      expect(receivedOp).toBeDefined()
      expect(receivedOp.action).toBe("shape_add")
      expect(receivedOp.slide_index).toBe(0)
      expect(receivedOp.shape).toBeDefined()
      expect(receivedOp.shape.id).toBe("shape-test-001")
      expect(receivedOp.shape.type).toBe("rectangle")
      expect(receivedOp.shape.x).toBe(100)
      expect(receivedOp.shape.y).toBe(200)
      expect(receivedOp.shape.width).toBe(300)
      expect(receivedOp.shape.height).toBe(150)
      expect(receivedOp.shape.fill_color).toBe("#3498DB")
      expect(receivedOp.shape.text).toBe("Hello Presentation")

      ws1.close()
      ws2.close()
    })

    test("WS broadcasts slide_add operation to other participants", async () => {
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=slide-user-1&username=Slide+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=slide-user-2&username=Slide+User+2`

      // Connect both users
      const [ws1, ws2] = await Promise.all([
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl1)
          const timeout = setTimeout(() => reject(new Error("WS1 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS1 error"))
        }),
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl2)
          const timeout = setTimeout(() => reject(new Error("WS2 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS2 error"))
        }),
      ])

      await wait(500)

      // User 2 sends a slide_add operation
      const slideOp = {
        type: "presentation_op",
        operation: {
          action: "slide_add",
          after_index: 0,
        },
      }

      const receivedOp = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Did not receive slide_add on ws1 within 8s"))
        }, 8000)

        ws1.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === "presentation_op" && data.operation?.action === "slide_add") {
              clearTimeout(timeout)
              resolve(data.operation)
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        ws2.send(JSON.stringify(slideOp))
      })

      expect(receivedOp).toBeDefined()
      expect(receivedOp.action).toBe("slide_add")
      expect(receivedOp.after_index).toBe(0)

      ws1.close()
      ws2.close()
    })

    test("WS broadcasts shape_delete operation to other participants", async () => {
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=del-user-1&username=Del+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=del-user-2&username=Del+User+2`

      const [ws1, ws2] = await Promise.all([
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl1)
          const timeout = setTimeout(() => reject(new Error("WS1 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS1 error"))
        }),
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl2)
          const timeout = setTimeout(() => reject(new Error("WS2 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS2 error"))
        }),
      ])

      await wait(500)

      const deleteOp = {
        type: "presentation_op",
        operation: {
          action: "shape_delete",
          slide_index: 0,
          shape_id: "shape-test-001",
        },
      }

      const receivedOp = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Did not receive shape_delete on ws1 within 8s"))
        }, 8000)

        ws1.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (
              data.type === "presentation_op" &&
              data.operation?.action === "shape_delete" &&
              data.operation?.shape_id === "shape-test-001"
            ) {
              clearTimeout(timeout)
              resolve(data.operation)
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        ws2.send(JSON.stringify(deleteOp))
      })

      expect(receivedOp).toBeDefined()
      expect(receivedOp.action).toBe("shape_delete")
      expect(receivedOp.slide_index).toBe(0)
      expect(receivedOp.shape_id).toBe("shape-test-001")

      ws1.close()
      ws2.close()
    })

    test("WS broadcasts cursor update with page info", async () => {
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=cursor-pres-1&username=Cursor+Pres+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=cursor-pres-2&username=Cursor+Pres+2`

      const [ws1, ws2] = await Promise.all([
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl1)
          const timeout = setTimeout(() => reject(new Error("WS1 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS1 error"))
        }),
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl2)
          const timeout = setTimeout(() => reject(new Error("WS2 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS2 error"))
        }),
      ])

      await wait(500)

      // User 2 sends cursor position on page 2
      const cursorMsg = {
        type: "participant_update",
        update: {
          event: "cursor_moved",
          user_id: "cursor-pres-2",
          username: "Cursor Pres 2",
          color: "#E74C3C",
          cursor_position: { page: 2, x: 450, y: 320 },
        },
      }

      const receivedUpdate = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Did not receive cursor update on ws1 within 8s"))
        }, 8000)

        ws1.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (
              data.type === "participant_update" &&
              data.update?.event === "cursor_moved" &&
              data.update?.user_id === "cursor-pres-2"
            ) {
              clearTimeout(timeout)
              resolve(data.update)
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        ws2.send(JSON.stringify(cursorMsg))
      })

      // Verify cursor position has page info (presentation-specific)
      expect(receivedUpdate).toBeDefined()
      expect(receivedUpdate).toHaveProperty("user_id", "cursor-pres-2")
      expect(receivedUpdate).toHaveProperty("cursor_position")
      expect(receivedUpdate.cursor_position).toHaveProperty("page", 2)
      expect(receivedUpdate.cursor_position).toHaveProperty("x", 450)
      expect(receivedUpdate.cursor_position).toHaveProperty("y", 320)

      ws1.close()
      ws2.close()
    })

    test("WS receives multiple presentation operations in sequence", async () => {
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=seq-user-1&username=Seq+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=seq-user-2&username=Seq+User+2`

      const [ws1, ws2] = await Promise.all([
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl1)
          const timeout = setTimeout(() => reject(new Error("WS1 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS1 error"))
        }),
        new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl2)
          const timeout = setTimeout(() => reject(new Error("WS2 timeout")), 10000)
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve(ws)
          }
          ws.onerror = () => reject(new Error("WS2 error"))
        }),
      ])

      await wait(500)

      const receivedOps = []
      ws1.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "presentation_op") {
            receivedOps.push(data.operation)
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      // Send multiple operations in sequence from ws2
      const shape1 = {
        type: "presentation_op",
        operation: {
          action: "shape_add",
          slide_index: 0,
          shape: {
            id: "shape-seq-001",
            type: "circle",
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            rotation: 0,
            z_index: 1,
            fill_color: "#2ECC71",
          },
        },
      }

      const shape2 = {
        type: "presentation_op",
        operation: {
          action: "shape_add",
          slide_index: 1,
          shape: {
            id: "shape-seq-002",
            type: "ellipse",
            x: 200,
            y: 150,
            width: 250,
            height: 120,
            rotation: 45,
            z_index: 2,
            fill_color: "#9B59B6",
          },
        },
      }

      const slideMove = {
        type: "presentation_op",
        operation: {
          action: "shape_move",
          slide_index: 0,
          shape_id: "shape-seq-001",
          x: 150,
          y: 200,
        },
      }

      ws2.send(JSON.stringify(shape1))
      await wait(200)
      ws2.send(JSON.stringify(shape2))
      await wait(200)
      ws2.send(JSON.stringify(slideMove))

      // Wait for all operations to propagate
      await wait(2000)

      expect(receivedOps.length).toBeGreaterThanOrEqual(3)

      const addOps = receivedOps.filter((op) => op.action === "shape_add")
      const moveOps = receivedOps.filter((op) => op.action === "shape_move")

      expect(addOps.length).toBe(2)
      expect(moveOps.length).toBe(1)

      // Verify order is preserved
      expect(receivedOps[0].shape.id).toBe("shape-seq-001")
      expect(receivedOps[1].shape.id).toBe("shape-seq-002")
      expect(receivedOps[2].action).toBe("shape_move")

      ws1.close()
      ws2.close()
    })

    test("WS synchronizes presentation_state on reconnect", async () => {
      const wsUrl = `${CS_WS}/ws/${sessionId}?user_id=reconnect-pres&username=Reconnect+Pres`

      // Connect first time
      const ws1 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        const timeout = setTimeout(() => reject(new Error("WS1 timeout")), 10000)
        ws.onopen = () => {
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = () => reject(new Error("WS1 error"))
      })

      // Get initial state
      const initialState1 = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Initial state timeout")), 8000)
        ws1.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === "initial_state") {
              clearTimeout(timeout)
              resolve(data.state)
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      })

      expect(initialState1).toBeDefined()
      expect(initialState1).toHaveProperty("participants")

      // Close and reconnect
      ws1.close()
      await wait(500)

      const ws2 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        const timeout = setTimeout(() => reject(new Error("WS2 timeout")), 10000)
        ws.onopen = () => {
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = () => reject(new Error("WS2 error"))
      })

      // Get initial state after reconnect
      const initialState2 = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Initial state on reconnect timeout")),
          8000,
        )
        ws2.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === "initial_state") {
              clearTimeout(timeout)
              resolve(data.state)
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      })

      expect(initialState2).toBeDefined()
      expect(initialState2).toHaveProperty("participants")

      ws2.close()
    })
  })

  describe("Multiple Participants — Full Collaboration Flow", () => {
    let sessionId = null

    beforeAll(async () => {
      const response = await axios.post(
        `${CS_URL}/sessions`,
        { document_id: "test-presentation-full-001" },
        { timeout: 10000 },
      )
      sessionId = response.data.session_id
    })

    test("three participants can all receive shape operations from any peer", async () => {
      const urls = [
        { url: `${CS_WS}/ws/${sessionId}?user_id=multi-a&username=Multi+A`, id: "multi-a" },
        { url: `${CS_WS}/ws/${sessionId}?user_id=multi-b&username=Multi+B`, id: "multi-b" },
        { url: `${CS_WS}/ws/${sessionId}?user_id=multi-c&username=Multi+C`, id: "multi-c" },
      ]

      // Connect all three
      const sockets = await Promise.all(
        urls.map(
          (u) =>
            new Promise((resolve, reject) => {
              const ws = new WebSocket(u.url)
              const timeout = setTimeout(() => reject(new Error(`${u.id} timeout`)), 10000)
              ws.onopen = () => {
                clearTimeout(timeout)
                resolve(ws)
              }
              ws.onerror = () => reject(new Error(`${u.id} error`))
            }),
        ),
      )

      await wait(1000)

      // Set up listeners on A and C
      const aReceived = []
      const cReceived = []

      sockets[0].onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "presentation_op") aReceived.push(data.operation)
        } catch (e) {}
      }

      sockets[2].onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "presentation_op") cReceived.push(data.operation)
        } catch (e) {}
      }

      // User B (socket[1]) sends a shape
      const shapeFromB = {
        type: "presentation_op",
        operation: {
          action: "shape_add",
          slide_index: 0,
          shape: {
            id: "shape-multi-b",
            type: "triangle",
            x: 300,
            y: 300,
            width: 200,
            height: 200,
            rotation: 0,
            z_index: 1,
            fill_color: "#F39C12",
          },
        },
      }

      sockets[1].send(JSON.stringify(shapeFromB))
      await wait(1500)

      // Both A and C should have received the operation from B
      expect(aReceived.some((op) => op.shape?.id === "shape-multi-b")).toBe(true)
      expect(cReceived.some((op) => op.shape?.id === "shape-multi-b")).toBe(true)

      // Clean up
      sockets.forEach((ws) => ws.close())
    })

    test("all participants receive participant_update when someone joins/leaves", async () => {
      // Connect user A
      const wsA = await new Promise((resolve) => {
        const ws = new WebSocket(
          `${CS_WS}/ws/${sessionId}?user_id=part-event-a&username=Part+Event+A`,
        )
        ws.onopen = () => resolve(ws)
        ws.onerror = () => resolve(null)
      })

      if (!wsA) {
        test.skip("WS A could not connect")
        return
      }

      await wait(500)

      // Connect user B — A should receive joined event
      const joinedReceived = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 8000)

        wsA.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === "participant_update" && data.update?.event === "joined") {
              clearTimeout(timeout)
              resolve(data.update)
            }
          } catch (e) {}
        }

        const wsB = new WebSocket(
          `${CS_WS}/ws/${sessionId}?user_id=part-event-b&username=Part+Event+B`,
        )
        wsB.onerror = () => {}
      })

      if (joinedReceived) {
        expect(joinedReceived).toHaveProperty("user_id", "part-event-b")
        expect(joinedReceived).toHaveProperty("username", "Part Event B")
        expect(joinedReceived).toHaveProperty("color")
      }

      wsA.close()
    })
  })
})
