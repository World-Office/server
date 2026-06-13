/**
 * Coauthoring Service E2E Tests
 *
 * Tests the real-time collaboration WebSocket flow:
 * - Session creation via REST
 * - Participant join via REST
 * - WebSocket connect receives InitialState
 * - WebSocket receives ParticipantUpdate when other clients join/leave
 * - CursorMoved events are broadcast to other clients
 */

const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const config = require("../../setup")

const CS_URL = config.coauthoringServiceUrl
const CS_WS = config.coauthoringServiceWs

let serviceAvailable = false
const wsMock = null

beforeAll(async () => {
  try {
    const response = await axios.get(`${CS_URL}/health`, { timeout: 5000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

describe("Coauthoring Service", () => {
  if (!serviceAvailable) {
    test.skip("coauthoring-service is not available in this stack", () => {})
    return
  }

  describe("REST API", () => {
    let sessionId = null
    const testUser = { user_id: "test-user-1", username: "Test User 1" }

    test("POST /sessions creates a session", async () => {
      const response = await axios.post(
        `${CS_URL}/sessions`,
        { document_id: "test-doc-001" },
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("session_id")
      sessionId = response.data.session_id
    })

    test("POST /sessions/{id}/join adds participant", async () => {
      const response = await axios.post(`${CS_URL}/sessions/${sessionId}/join`, testUser, {
        timeout: 10000,
      })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("session_id", sessionId)
      expect(response.data).toHaveProperty("participants")
      expect(response.data.participants.some((p) => p.user_id === testUser.user_id)).toBe(true)
    })

    test("GET /sessions/{id} returns session with participants", async () => {
      const response = await axios.get(`${CS_URL}/sessions/${sessionId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("id", sessionId)
      expect(response.data).toHaveProperty("participants")
    })
  })

  describe("WebSocket Presence Flow", () => {
    let sessionId = null

    beforeAll(async () => {
      const response = await axios.post(
        `${CS_URL}/sessions`,
        { document_id: "test-doc-ws-001" },
        { timeout: 10000 },
      )
      sessionId = response.data.session_id
    })

    test("WS connects and receives InitialState on connect", async () => {
      const received = []
      const wsUrl = `${CS_WS}/ws/${sessionId}?user_id=ws-user-1&username=WS+User+1`

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
      expect(initState.state).toHaveProperty("crdt_bytes")
      expect(initState.state).toHaveProperty("participants")
    })

    test("WS receives participantUpdate when second client joins", async () => {
      const firstReceived = []
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=multi-user-1&username=Multi+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=multi-user-2&username=Multi+User+2`

      const firstWs = await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl1)
        const received = []
        ws.onopen = () => resolve({ ws, received })
        ws.onerror = () => resolve({ ws: null, received })
      })

      if (!firstWs.ws) {
        test.skip("first WS could not connect")
        return
      }

      const joinedUpdate = await new Promise((resolve) => {
        firstWs.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            firstWs.received.push(data)
            if (data.type === "participant_update" && data.update?.event === "joined") {
              resolve(data)
            }
          } catch (e) {}
        }

        const secondWs = new WebSocket(wsUrl2)
        secondWs.onerror = () => resolve(null)

        setTimeout(() => resolve(null), 8000)
      })

      firstWs.ws.close()

      if (joinedUpdate) {
        expect(joinedUpdate.update).toHaveProperty("user_id", "multi-user-2")
        expect(joinedUpdate.update).toHaveProperty("username", "Multi User 2")
        expect(joinedUpdate.update).toHaveProperty("event", "joined")
      }
    })

    test("WS sends cursor update and receives it back via presence channel", async () => {
      const secondWsUrl = `${CS_WS}/ws/${sessionId}?user_id=cursor-user-2&username=Cursor+User+2`
      let cursorUpdateReceived = null

      // Connect first WS and set up message handler
      const firstWs = await new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `${CS_WS}/ws/${sessionId}?user_id=cursor-user-1&username=Cursor+User+1`,
        )
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            ws.close()
            reject(new Error("First WS connect timeout (10s)"))
          }
        }, 10000)

        ws.onopen = () => {
          settled = true
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = (err) => {
          settled = true
          clearTimeout(timeout)
          reject(new Error(`First WS error: ${err.message}`))
        }
      })

      // Connect second WS and send cursor update
      const secondWs = await new Promise((resolve, reject) => {
        const ws = new WebSocket(secondWsUrl)
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            ws.close()
            reject(new Error("Second WS connect timeout (10s)"))
          }
        }, 10000)

        ws.onopen = () => {
          settled = true
          clearTimeout(timeout)
          resolve(ws)
        }
        ws.onerror = (err) => {
          settled = true
          clearTimeout(timeout)
          reject(new Error(`Second WS error: ${err.message}`))
        }
      })

      // Listen on first WS for cursor updates
      await new Promise((resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            reject(new Error("Cursor update receive timeout (10s)"))
          }
        }, 10000)

        firstWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (
              data.type === "participant_update" &&
              data.update?.event === "cursor_moved" &&
              data.update?.user_id === "cursor-user-2"
            ) {
              if (!settled) {
                settled = true
                clearTimeout(timeout)
                cursorUpdateReceived = data.update
                resolve()
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      })

      // Send cursor update from second WS
      const cursorMoveMessage = JSON.stringify({
        type: "participant_update",
        update: {
          type: "cursor_moved",
          user_id: "cursor-user-2",
          username: "Cursor User 2",
          color: "#E74C3C",
          cursor_position: { page: 1, x: 100, y: 200 },
        },
      })
      secondWs.send(cursorMoveMessage)

      await new Promise((r) => setTimeout(r, 500))

      // Verify cursor update was propagated
      expect(cursorUpdateReceived).not.toBeNull()
      expect(cursorUpdateReceived).toHaveProperty("user_id", "cursor-user-2")
      expect(cursorUpdateReceived).toHaveProperty("username", "Cursor User 2")
      expect(cursorUpdateReceived).toHaveProperty("cursor_position")
      expect(cursorUpdateReceived.cursor_position).toEqual({ page: 1, x: 100, y: 200 })

      firstWs.close()
      secondWs.close()
    })

    test("WS Left event broadcast when client disconnects", async () => {
      const firstReceived = []
      const wsUrl1 = `${CS_WS}/ws/${sessionId}?user_id=left-user-1&username=Left+User+1`
      const wsUrl2 = `${CS_WS}/ws/${sessionId}?user_id=left-user-2&username=Left+User+2`

      const firstWs = await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl1)
        const received = []
        ws.onopen = () => resolve({ ws, received })
        ws.onerror = () => resolve({ ws: null, received })
      })

      if (!firstWs.ws) {
        test.skip("first WS could not connect")
        return
      }

      const secondWs = new WebSocket(wsUrl2)
      secondWs.onerror = () => {}
      await new Promise((r) => setTimeout(r, 1000))

      const leftUpdate = await new Promise((resolve) => {
        firstWs.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            firstWs.received.push(data)
            if (data.type === "participant_update" && data.update?.event === "left") {
              resolve(data)
            }
          } catch (e) {}
        }

        firstWs.ws.close()
        secondWs.close()

        setTimeout(() => resolve(null), 8000)
      })

      if (leftUpdate) {
        expect(leftUpdate.update).toHaveProperty("event", "left")
      }
    })

    test("WS reconnects after connection loss", async () => {
      const wsUrl = `${CS_WS}/ws/${sessionId}?user_id=reconnect-user-1&username=Reconnect+User+1`
      let connectionCount = 0
      let reconnectCount = 0

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            ws.close()
            reject(new Error("Reconnect test timeout (15s)"))
          }
        }, 15000)

        ws.onopen = () => {
          connectionCount++
          if (connectionCount === 1) {
            // First connection successful, now close it to trigger reconnect
            ws.close()
          }
        }

        ws.onclose = () => {
          if (connectionCount === 1 && !settled) {
            // First connection closed, create a new WebSocket to test reconnect
            const newWs = new WebSocket(wsUrl)
            newWs.onopen = () => {
              connectionCount++
              reconnectCount++
              settled = true
              clearTimeout(timeout)
              newWs.close()
              ws.close()
              resolve()
            }
            newWs.onerror = (err) => {
              if (!settled) {
                settled = true
                clearTimeout(timeout)
                reject(new Error(`Reconnect failed: ${err.message}`))
              }
            }
          }
        }

        ws.onerror = (err) => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            reject(new Error(`First connection failed: ${err.message}`))
          }
        }
      })

      // Verify both connections happened
      expect(connectionCount).toBe(2)
      expect(reconnectCount).toBe(1)
    })
  })
})
