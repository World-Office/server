// EditorStore — root editor state (type, permissions, loading, error)

import { makeAutoObservable } from "mobx"

export type EditorType = "document" | "spreadsheet" | "presentation" | "pdf" | "visio"

export interface EditorPermissions {
  edit: boolean
  download: boolean
  print: boolean
  review: boolean
  comment: boolean
}

export class EditorStore {
  editorType: EditorType = "document"
  documentKey = ""
  permissions: EditorPermissions = {
    edit: true,
    download: true,
    print: true,
    review: true,
    comment: true,
  }
  isLoading = true
  isReady = false
  error: string | null = null
  lang = "en"

  constructor() {
    makeAutoObservable(this)
  }

  setEditorType(type: EditorType): void {
    this.editorType = type
  }

  setDocumentKey(key: string): void {
    this.documentKey = key
  }

  setPermissions(perms: Partial<EditorPermissions>): void {
    Object.assign(this.permissions, perms)
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading
  }

  setReady(ready: boolean): void {
    this.isReady = ready
    if (ready) this.isLoading = false
  }

  setError(error: string | null): void {
    this.error = error
    if (error) this.isLoading = false
  }

  setLang(lang: string): void {
    this.lang = lang
  }

  reset(): void {
    this.documentKey = ""
    this.isLoading = true
    this.isReady = false
    this.error = null
    this.permissions = {
      edit: true,
      download: true,
      print: true,
      review: true,
      comment: true,
    }
  }
}