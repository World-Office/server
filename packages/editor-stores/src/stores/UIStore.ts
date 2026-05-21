// UIStore — panel visibility, active tabs, toolbar state, modals

import { makeAutoObservable } from "mobx"

export type PanelId = "left" | "right" | "search"
export type LeftPanelTab = "navigation" | "pageThumbnails" | "comments"
export type RightPanelTab = "styles" | "shapes" | "properties"

export class UIStore {
  leftPanelVisible = false
  rightPanelVisible = false
  searchVisible = false
  leftPanelTab: LeftPanelTab = "navigation"
  rightPanelTab: RightPanelTab = "styles"
  fileMenuOpen = false
  activeModal: string | null = null
  contextMenu: { x: number; y: number } | null = null

  constructor() {
    makeAutoObservable(this)
  }

  // Panel toggle actions
  toggleLeftPanel(tab?: LeftPanelTab): void {
    this.leftPanelVisible = !this.leftPanelVisible
    if (tab && this.leftPanelVisible) {
      this.leftPanelTab = tab
    }
  }

  toggleRightPanel(tab?: RightPanelTab): void {
    this.rightPanelVisible = !this.rightPanelVisible
    if (tab && this.rightPanelVisible) {
      this.rightPanelTab = tab
    }
  }

  toggleSearch(): void {
    this.searchVisible = !this.searchVisible
  }

  // Panel tab actions
  setLeftPanelTab(tab: LeftPanelTab): void {
    this.leftPanelTab = tab
    if (!this.leftPanelVisible) this.leftPanelVisible = true
  }

  setRightPanelTab(tab: RightPanelTab): void {
    this.rightPanelTab = tab
    if (!this.rightPanelVisible) this.rightPanelVisible = true
  }

  // Panel visibility
  showPanel(panelId: PanelId): void {
    switch (panelId) {
      case "left":
        this.leftPanelVisible = true
        break
      case "right":
        this.rightPanelVisible = true
        break
      case "search":
        this.searchVisible = true
        break
    }
  }

  hidePanel(panelId: PanelId): void {
    switch (panelId) {
      case "left":
        this.leftPanelVisible = false
        break
      case "right":
        this.rightPanelVisible = false
        break
      case "search":
        this.searchVisible = false
        break
    }
  }

  hideAllPanels(): void {
    this.leftPanelVisible = false
    this.rightPanelVisible = false
    this.searchVisible = false
  }

  // Menu actions
  setFileMenuOpen(open: boolean): void {
    this.fileMenuOpen = open
  }

  // Modal actions
  openModal(modalId: string): void {
    this.activeModal = modalId
  }

  closeModal(): void {
    this.activeModal = null
  }

  // Context menu actions
  showContextMenu(x: number, y: number): void {
    this.contextMenu = { x, y }
  }

  hideContextMenu(): void {
    this.contextMenu = null
  }

  reset(): void {
    this.leftPanelVisible = false
    this.rightPanelVisible = false
    this.searchVisible = false
    this.leftPanelTab = "navigation"
    this.rightPanelTab = "styles"
    this.fileMenuOpen = false
    this.activeModal = null
    this.contextMenu = null
  }
}