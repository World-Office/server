const AI_PROXY_ENDPOINT = "/ai-proxy"

interface AiProxyRequest {
  model?: string
  messages: Array<{ role: string; content: string }>
}

interface AiProxyResponse {
  choices?: Array<{ message: { content: string } }>
  content?: string
  text?: string
  error?: string
}

export async function callAi(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: Array<{ role: string; content: string }> = []

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt })
  }
  messages.push({ role: "user", content: prompt })

  const res = await fetch(AI_PROXY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages } satisfies AiProxyRequest),
  })

  if (!res.ok) {
    throw new Error(`AI request failed: ${res.status} ${res.statusText}`)
  }

  const json: AiProxyResponse = await res.json()

  if (json.error) {
    throw new Error(json.error)
  }

  return json.choices?.[0]?.message?.content ?? json.content ?? json.text ?? ""
}

export async function summarizeSelection(text: string): Promise<string> {
  return callAi(
    text,
    "Summarize the following text concisely. Output only the summary, no preamble.",
  )
}

export async function improveWriting(text: string): Promise<string> {
  return callAi(
    text,
    "Improve the writing quality of the following text. Fix grammar, enhance clarity, and make it more professional. Output only the improved text.",
  )
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  return callAi(
    text,
    `Translate the following text to ${targetLang}. Output only the translation, no preamble.`,
  )
}
