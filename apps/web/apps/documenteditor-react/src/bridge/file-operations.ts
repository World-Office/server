import { isDesktop } from "./platform"

export interface OpenFileResult {
  path: string
  name: string
  content: string
  mimeType: string
}

export interface SaveFileResult {
  path: string
  name: string
}

export async function openFile(
  filters?: Array<{ name: string; extensions: string[] }>,
): Promise<OpenFileResult | null> {
  if (!isDesktop()) return null
  const { open } = await import("@tauri-apps/plugin-dialog")
  const { invoke } = await import("@tauri-apps/api/core")
  const selectedPath = await open({
    multiple: false,
    filters: filters ?? [
      { name: "Documents", extensions: ["docx", "odt", "doc", "txt", "rtf", "pdf", "html", "md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  })
  if (!selectedPath) return null
  const path = selectedPath as string
  const name = path.split(/[/\\]/).pop() ?? "Untitled"
  const binaryExtensions = new Set([
    "docx",
    "odt",
    "doc",
    "pdf",
    "xlsx",
    "pptx",
    "epub",
    "fb2",
    "rtf",
  ])
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const isBinary = binaryExtensions.has(ext)
  const content = isBinary
    ? await invoke<string>("read_file_binary", { path })
    : await invoke<string>("read_file", { path })
  const mimeType = await invoke<string>("detect_document_type", { path })
  return { path, name, content, mimeType }
}

export async function saveFile(
  content: string,
  options?: {
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
    binary?: boolean
  },
): Promise<SaveFileResult | null> {
  if (!isDesktop()) return null
  const { save } = await import("@tauri-apps/plugin-dialog")
  const { invoke } = await import("@tauri-apps/api/core")
  const selectedPath = await save({
    defaultPath: options?.defaultPath,
    filters: options?.filters ?? [
      { name: "Word Document", extensions: ["docx"] },
      { name: "ODT Document", extensions: ["odt"] },
      { name: "Plain Text", extensions: ["txt"] },
      { name: "Markdown", extensions: ["md"] },
      { name: "HTML", extensions: ["html"] },
      { name: "All Files", extensions: ["*"] },
    ],
  })
  if (!selectedPath) return null
  const path = selectedPath as string
  const name = path.split(/[/\\]/).pop() ?? "Untitled"
  if (options?.binary) {
    await invoke("write_file_binary", { path, contentBase64: content })
  } else {
    await invoke("write_file", { path, content })
  }
  return { path, name }
}

export async function saveFileToPath(path: string, content: string, binary = false): Promise<void> {
  if (!isDesktop()) return
  const { invoke } = await import("@tauri-apps/api/core")
  if (binary) {
    await invoke("write_file_binary", { path, contentBase64: content })
  } else {
    await invoke("write_file", { path, content })
  }
}
