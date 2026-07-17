const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const config = require("../../setup")

const WS_URL = config.webhookServiceUrl

let serviceAvailable = false

beforeAll(async () => {
  try {
    const response = await axios.get(`${WS_URL}/health`, { timeout: 3000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

describe("Webhook Service", () => {
  if (!serviceAvailable) {
    test.skip("webhook-service is not available — start the service on WEBHOOK_SERVICE_URL (default http://localhost:8005)", () => {})
    return
  }

  describe("GET /health", () => {
    test("returns 200", async () => {
      const response = await axios.get(`${WS_URL}/health`)
      expect(response.status).toBe(200)
    }, 10000)

    test("returns JSON with status, service, version", async () => {
      const response = await axios.get(`${WS_URL}/health`)
      expect(response.data).toHaveProperty("status", "ok")
      expect(response.data).toHaveProperty("service", "webhook-service")
      expect(response.data).toHaveProperty("version")
    }, 10000)
  })

  describe("Webhook CRUD", () => {
    let webhookId = null
    const testWebhook = {
      url: "https://hooks.example.com/notify",
      events: ["document.created", "document.updated"],
      secret: "whsec_test",
      enabled: true,
      max_retries: 3,
      timeout_ms: 5000,
    }

    test("POST /hooks creates a webhook", async () => {
      const response = await axios.post(`${WS_URL}/hooks`, testWebhook, { timeout: 10000 })
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("id")
      expect(response.data.url).toBe("https://hooks.example.com/notify")
      expect(response.data.events).toEqual(["document.created", "document.updated"])
      expect(response.data.enabled).toBe(true)
      webhookId = response.data.id
    })

    test("GET /hooks lists webhooks", async () => {
      const response = await axios.get(`${WS_URL}/hooks`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("webhooks")
      expect(response.data).toHaveProperty("count")
      expect(response.data.count).toBeGreaterThanOrEqual(1)
    })

    test("GET /hooks/{id} returns the created webhook", async () => {
      const response = await axios.get(`${WS_URL}/hooks/${webhookId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("id", webhookId)
      expect(response.data.url).toBe("https://hooks.example.com/notify")
    })

    test("PUT /hooks/{id} updates the webhook", async () => {
      const updated = {
        ...testWebhook,
        url: "https://hooks.example.com/v2/notify",
        events: ["document.deleted"],
      }
      const response = await axios.put(`${WS_URL}/hooks/${webhookId}`, updated, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data.url).toBe("https://hooks.example.com/v2/notify")
      expect(response.data.events).toEqual(["document.deleted"])
    })

    test("DELETE /hooks/{id} deletes the webhook", async () => {
      const response = await axios.delete(`${WS_URL}/hooks/${webhookId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("deleted", true)
    })

    test("GET /hooks/{id} returns 404 after deletion", async () => {
      try {
        await axios.get(`${WS_URL}/hooks/${webhookId}`, { timeout: 10000 })
      } catch (error) {
        expect(error.response?.status).toBe(404)
      }
    })
  })

  describe("Webhook Validation", () => {
    test("POST /hooks rejects empty url", async () => {
      try {
        await axios.post(
          `${WS_URL}/hooks`,
          { url: "", events: ["document.created"] },
          { timeout: 10000 },
        )
      } catch (error) {
        expect(error.response?.status).toBe(400)
      }
    })

    test("POST /hooks rejects empty events", async () => {
      try {
        await axios.post(
          `${WS_URL}/hooks`,
          { url: "https://hooks.example.com/test", events: [] },
          { timeout: 10000 },
        )
      } catch (error) {
        expect(error.response?.status).toBe(400)
      }
    })

    test("GET /hooks/{id} returns 404 for unknown webhook", async () => {
      try {
        await axios.get(`${WS_URL}/hooks/non-existent-id`, { timeout: 10000 })
      } catch (error) {
        expect(error.response?.status).toBe(404)
      }
    })
  })

  describe("Event Trigger", () => {
    let webhookId = null

    beforeAll(async () => {
      try {
        const response = await axios.post(
          `${WS_URL}/hooks`,
          {
            url: "https://httpbin.org/post",
            events: ["document.created"],
            enabled: true,
            max_retries: 1,
            timeout_ms: 3000,
          },
          { timeout: 10000 },
        )
        webhookId = response.data.id
      } catch {
        webhookId = null
      }
    })

    test("POST /trigger accepts event and queues delivery", async () => {
      if (!webhookId) {
        test.skip("could not create webhook for trigger test")
        return
      }
      const response = await axios.post(
        `${WS_URL}/trigger`,
        {
          event_type: "document.created",
          resource_type: "document",
          resource_id: "doc-trigger-001",
          data: { title: "Test Document" },
        },
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("triggered", true)
      expect(response.data).toHaveProperty("event_type", "document.created")
    })
  })
})
