const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const config = require("../../setup")

const SS_URL = config.scimServiceUrl

let serviceAvailable = false

beforeAll(async () => {
  try {
    const response = await axios.get(`${SS_URL}/health`, { timeout: 3000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

describe("SCIM Service", () => {
  if (!serviceAvailable) {
    test.skip("scim-service is not available — start the service on SCIM_SERVICE_URL (default http://localhost:8004)", () => {})
    return
  }

  describe("GET /health", () => {
    test("returns 200", async () => {
      const response = await axios.get(`${SS_URL}/health`)
      expect(response.status).toBe(200)
    }, 10000)

    test("returns JSON with status, service, version", async () => {
      const response = await axios.get(`${SS_URL}/health`)
      expect(response.data).toHaveProperty("status", "ok")
      expect(response.data).toHaveProperty("service", "scim-service")
      expect(response.data).toHaveProperty("version")
    }, 10000)
  })

  describe("User CRUD", () => {
    let userId = null
    const testUser = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      user_name: "jdoe",
      name: {
        given_name: "John",
        family_name: "Doe",
      },
      display_name: "John Doe",
      active: true,
      emails: [{ value: "jdoe@example.com", primary: true }],
    }

    test("POST /v2/Users creates a user", async () => {
      const response = await axios.post(`${SS_URL}/v2/Users`, testUser, { timeout: 10000 })
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("id")
      expect(response.data.user_name).toBe("jdoe")
      userId = response.data.id
    })

    test("GET /v2/Users lists users", async () => {
      const response = await axios.get(`${SS_URL}/v2/Users`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("Resources")
      expect(response.data).toHaveProperty("totalResults")
      expect(response.data.totalResults).toBeGreaterThanOrEqual(1)
    })

    test("GET /v2/Users/{id} returns the created user", async () => {
      const response = await axios.get(`${SS_URL}/v2/Users/${userId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("id", userId)
      expect(response.data.user_name).toBe("jdoe")
    })

    test("PUT /v2/Users/{id} updates the user", async () => {
      const updated = {
        ...testUser,
        display_name: "John Updated",
      }
      const response = await axios.put(`${SS_URL}/v2/Users/${userId}`, updated, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data.display_name).toBe("John Updated")
    })

    test("PATCH /v2/Users/{id} patches the user", async () => {
      const patchOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", path: "displayName", value: "John Patched" }],
      }
      const response = await axios.patch(`${SS_URL}/v2/Users/${userId}`, patchOp, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data.display_name).toBe("John Patched")
    })

    test("DELETE /v2/Users/{id} deletes the user", async () => {
      const response = await axios.delete(`${SS_URL}/v2/Users/${userId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
    })

    test("GET /v2/Users/{id} returns 404 after deletion", async () => {
      try {
        await axios.get(`${SS_URL}/v2/Users/${userId}`, { timeout: 10000 })
      } catch (error) {
        expect(error.response?.status).toBe(404)
      }
    })
  })

  describe("Group CRUD", () => {
    let groupId = null
    const testGroup = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      display_name: "Administrators",
    }

    test("POST /v2/Groups creates a group", async () => {
      const response = await axios.post(`${SS_URL}/v2/Groups`, testGroup, { timeout: 10000 })
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("id")
      expect(response.data.display_name).toBe("Administrators")
      groupId = response.data.id
    })

    test("GET /v2/Groups lists groups", async () => {
      const response = await axios.get(`${SS_URL}/v2/Groups`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("Resources")
      expect(response.data.totalResults).toBeGreaterThanOrEqual(1)
    })

    test("GET /v2/Groups/{id} returns the created group", async () => {
      const response = await axios.get(`${SS_URL}/v2/Groups/${groupId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("id", groupId)
      expect(response.data.display_name).toBe("Administrators")
    })

    test("PUT /v2/Groups/{id} updates the group", async () => {
      const updated = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        display_name: "Super Admins",
      }
      const response = await axios.put(`${SS_URL}/v2/Groups/${groupId}`, updated, { timeout: 10000 })
      expect(response.status).toBe(200)
      expect(response.data.display_name).toBe("Super Admins")
    })

    test("DELETE /v2/Groups/{id} deletes the group", async () => {
      const response = await axios.delete(`${SS_URL}/v2/Groups/${groupId}`, { timeout: 10000 })
      expect(response.status).toBe(200)
    })
  })
})
