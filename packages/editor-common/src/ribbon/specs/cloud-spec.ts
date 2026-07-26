import type { RibbonButtonSpec, RibbonContext, RibbonGroupSpec, RibbonTabSpec } from "../types"

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

const cloudDownloadButton: RibbonButtonSpec = {
  id: "cloud-download",
  type: "button",
  icon: "Download",
  label: "Download",
  tooltip: "Download document",
  command: "download",
  visible: (ctx: RibbonContext) => ctx.isWopi,
}

const cloudHistoryButton: RibbonButtonSpec = {
  id: "cloud-history",
  type: "button",
  icon: "Clock",
  label: "History",
  tooltip: "Version history",
  command: "openHistory",
  visible: (ctx: RibbonContext) => ctx.isWopi,
}

/**
 * Cloud service info group — shows current user, connection info.
 * Visible only when WOPI is active.
 */
const cloudInfoGroup: RibbonGroupSpec = {
  id: "cloud-info",
  label: "Session",
  controls: [
    {
      id: "cloud-user",
      type: "button",
      icon: "User",
      label: "",
      tooltip: "Current user",
      command: "",
      visible: (ctx: RibbonContext) => ctx.isWopi,
    } satisfies RibbonButtonSpec,
    {
      id: "cloud-collab-count",
      type: "button",
      icon: "Users",
      label: "",
      tooltip: "Connected users",
      command: "",
      visible: (ctx: RibbonContext) => ctx.isWopi,
    } satisfies RibbonButtonSpec,
  ],
}

/**
 * Collaboration tab shown only when WOPI is active.
 * Contains save, share, download, history, and status controls.
 */
export const cloudTab: RibbonTabSpec = {
  id: "cloud",
  label: "Online",
  visible: (ctx: RibbonContext) => ctx.isWopi,
  groups: [
    {
      id: "cloud-file",
      label: "Cloud",
      controls: [cloudSaveButton, cloudShareButton, cloudDownloadButton, cloudHistoryButton],
    },
    cloudInfoGroup,
  ],
}

/**
 * Cloud-aware File group with save/share actions for the File menu.
 * Returns an empty array if WOPI is not active.
 */
export function getCloudFileGroup(ctx: RibbonContext): RibbonButtonSpec[] {
  if (!ctx.isWopi) return []

  return [
    {
      id: "file-save-cloud",
      type: "button",
      icon: "Save",
      label: "Save to Cloud",
      tooltip: "Save document to cloud storage",
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
    {
      id: "file-save-copy",
      type: "button",
      icon: "Copy",
      label: "Save Copy to Cloud",
      tooltip: "Save a copy to cloud storage",
      command: "saveCopy",
    },
  ]
}
