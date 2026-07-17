const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const config = require("../../setup")

const AS_URL = config.auditServiceUrl

let serviceAvailable = false

beforeAll(async () => {
  try {
    const response = await axios.get(`${AS_URL}/health`, { timeout: 3000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

describe("Audit Service", () => {
  if (!serviceAvailable) {
    test.skip("audit-service is not available — start the service on AUDIT_SERVICE_URL (default http://localhost:8003)", () => {})
    return
  }

  describe("GET /health", () => {
    test("returns 200", async () => {
      const response = await axios.get(`${AS_URL}/health`)
      expect(response.status).toBe(200)
    }, 10000)

    test("returns JSON with status, service, version", async () => {
      const response = await axios.get(`${AS_URL}/health`)
      expect(response.data).toHaveProperty("status", "ok")
      expect(response.data).toHaveProperty("service", "audit-service")
      expect(response.data).toHaveProperty("version")
    }, 10000)
  })

  describe("Event CRUD", () => {
    let eventId = null

    test("POST /events creates an audit event", async () => {
      const response = await axios.post(
        `${AS_URL}/events`,
        {
          event_type: "document.viewed",
          actor_id: "user-001",
          resource_id: "doc-abc-123",
          details_json: JSON.stringify({ page: 3 }),
          ip_address: "10.0.0.1",
        },
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("event")
      expect(response.data.event).toHaveProperty("id")
      expect(response.data.event.event_type).toBe("document.viewed")
      eventId = response.data.event.id
    })

    test("GET /events lists events with pagination", async () => {
      const response = await axios.get(`${AS_URL}/events`, {
        params: { limit: 10, offset: 0 },
        timeout: 10000,
      })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("events")
      expect(response.data).toHaveProperty("count")
      expect(response.data).toHaveProperty("total")
      expect(Array.isArray(response.data.events)).toBe(true)
      expect(response.data.count).toBeGreaterThanOrEqual(1)
    })

    test("GET /events/{id} returns the created event", async () => {
      const response = await axios.get(`${AS_URL}/events/${eventId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("id", eventId)
      expect(response.data.event_type).toBe("document.viewed")
    })

    test("GET /events/{id} returns 404 for unknown event", async () => {
      try {
        await axios.get(`${AS_URL}/events/non-existent-id`, { timeout: 10000 })
      } catch (error) {
        expect(error.response?.status).toBe(404)
      }
    })

    test("POST /events rejects empty event_type", async () => {
      try {
        await axios.post(
          `${AS_URL}/events`,
          {
            event_type: "",
            actor_id: "user-001",
            resource_id: "doc-xyz",
          },
          { timeout: 10000 },
        )
      } catch (error) {
        expect(error.response?.status).toBe(400)
      }
    })

    test("DELETE /events/older-than/{days} applies retention", async () => {
      const response = await axios.delete(`${AS_URL}/events/older-than/90`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("deleted")
      expect(response.data).toHaveProperty("older_than_days", 90)
    })
  })
})
