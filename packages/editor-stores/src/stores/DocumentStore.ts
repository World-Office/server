// DocumentStore — document state (page, zoom, title, modifications)

import { makeAutoObservable } from "mobx"

export class DocumentStore {
  title = "Untitled"
  currentPage = 1
  pageCount = 1
  zoom = 100
  isModified = false
  isSaving = false

  constructor() {
    makeAutoObservable(this)
  }

  setTitle(title: string): void {
    this.title = title
  }

  setPage(page: number): void {
    this.currentPage = Math.max(1, Math.min(page, this.pageCount))
  }

  setPageCount(count: number): void {
    this.pageCount = Math.max(1, count)
    if (this.currentPage > this.pageCount) {
      this.currentPage = this.pageCount
    }
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(25, Math.min(500, zoom))
  }

  zoomIn(step = 10): void {
    this.setZoom(this.zoom + step)
  }

  zoomOut(step = 10): void {
    this.setZoom(this.zoom - step)
  }

  zoomFit(): void {
    this.zoom = 100
  }

  setModified(modified: boolean): void {
    this.isModified = modified
  }

  setSaving(saving: boolean): void {
    this.isSaving = saving
  }

  reset(): void {
    this.title = "Untitled"
    this.currentPage = 1
    this.pageCount = 1
    this.zoom = 100
    this.isModified = false
    this.isSaving = false
  }
}