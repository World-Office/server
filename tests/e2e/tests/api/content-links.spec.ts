import { expect, test } from "@playwright/test"

const STORAGE_SERVICE = "http://localhost:8002"

test.describe("API: Content Links", () => {
  test("should create and list content links", async ({ request }) => {
    const doc1 = await request.post(`${STORAGE_SERVICE}/files`, {
      multipart: {
        file: {
          name: "source.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("source document content"),
        },
      },
    })
    expect(doc1.status()).toBe(201)
    const doc1Body: { id: string } = await doc1.json()

    const doc2 = await request.post(`${STORAGE_SERVICE}/files`, {
      multipart: {
        file: {
          name: "target.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("target document content"),
        },
      },
    })
    expect(doc2.status()).toBe(201)
    const doc2Body: { id: string } = await doc2.json()

    const createRes = await request.post(
      `${STORAGE_SERVICE}/documents/${doc1Body.id}/content-links`,
      {
        data: { target_document_id: doc2Body.id },
      },
    )
    expect(createRes.status()).toBe(201)

    const inboundRes = await request.get(
      `${STORAGE_SERVICE}/documents/${doc2Body.id}/content-links`,
    )
    expect(inboundRes.status()).toBe(200)
    const inboundBody: { links: Array<{ source_document_id: string }> } = await inboundRes.json()
    expect(inboundBody.links.length).toBeGreaterThanOrEqual(1)
    expect(inboundBody.links.some((l) => l.source_document_id === doc1Body.id)).toBe(true)

    const outboundRes = await request.get(
      `${STORAGE_SERVICE}/documents/${doc1Body.id}/outbound-content-links`,
    )
    expect(outboundRes.status()).toBe(200)
    const outboundBody: { links: Array<{ target_document_id: string }> } = await outboundRes.json()
    expect(outboundBody.links.length).toBeGreaterThanOrEqual(1)
    expect(outboundBody.links.some((l) => l.target_document_id === doc2Body.id)).toBe(true)
  })
})
