import type { RibbonButtonSpec, RibbonContext, RibbonTabSpec } from "../types"

/**
 * Cloud integration buttons for the ribbon.
 * These are shared across all editors when WOPI is active.
 */

const cloudSaveButton: RibbonButtonSpec = {
  id: "cloud-save",
  type: "button",
  icon: "Save",
  label: "Save",
  tooltip: "Save to cloud (Ctrl+S)",
  command: "save",
  visible: (ctx: RibbonContext) => ctx.isWopi,
  enabled: (ctx: RibbonContext) => ctx.isModified && !ctx.isSaving,
}

const cloudShareButton: RibbonButtonSpec = {
  id: "cloud-share",
  type: "button",
  icon: "Share2",
  label: "Share",
  tooltip: "Share this document",
  command: "share",
  visible: (ctx: RibbonContext) => ctx.isWopi,
}

const cloudStatusIndicator: RibbonButtonSpec = {
  id: "cloud-status",
  type: "button",
  icon: "Cloud",
  label: "Online",
  tooltip: "Collaboration status",
  command: "",
  visible: (ctx: RibbonContext) => ctx.isWopi,
}

/**
 * Collaboration tab shown only when WOPI is active.
 * Contains save, share, and status controls.
 */
export const cloudTab: RibbonTabSpec = {
  id: "cloud",
  label: "Online",
  visible: (ctx: RibbonContext) => ctx.isWopi,
  groups: [
    {
      id: "cloud-file",
      label: "Cloud",
      controls: [cloudSaveButton, cloudShareButton, cloudStatusIndicator],
    },
  ],
}

/**
 * Cloud-aware File tab with save/share actions.
 */
export function getCloudFileGroup(ctx: RibbonContext): RibbonButtonSpec[] {
  if (!ctx.isWopi) return []

  return [
    {
      id: "file-save-cloud",
      type: "button",
      icon: "Save",
      label: "Save",
      tooltip: "Save to cloud",
      command: "save",
      enabled: (c: RibbonContext) => c.isModified && !c.isSaving,
    },
    {
      id: "file-download",
      type: "button",
      icon: "Download",
      label: "Download",
      tooltip: "Download document",
      command: "download",
    },
  ]
}
