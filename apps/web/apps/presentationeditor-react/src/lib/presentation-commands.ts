/**
 * K6 — Presentation command router.
 *
 * Routes ribbon spec commands (presentation-ribbon.ts, 114 commands) to the
 * PresentationStore. The Toolbar handles navigation (addSlide/goTo*) inline;
 * everything else lands here via wo-command events.
 */

import type { WoCommand } from "@world-office/editor-common"
import { presentationStore } from "../stores/PresentationStore"
import type { TransitionEffect } from "../types/presentation"

/** Map ribbon transition command suffix → TransitionEffect value. */
const TRANSITION_BY_CMD: Record<string, TransitionEffect> = {
  setTransitionFade: "fade",
  setTransitionPush: "push",
  setTransitionWipe: "wipe",
  setTransitionSplit: "split",
  setTransitionReveal: "reveal",
  setTransitionChecker: "checker",
  setTransitionZoom: "zoom",
  setTransitionMorph: "morp",
  setTransitionCircle: "circle",
  setTransitionUncover: "uncover",
  setTransitionCover: "cover",
  setTransitionNone: "none",
}

const THEME_BY_CMD: Record<string, string> = {
  setThemeStandard: "standard",
  setThemeDark: "dark",
  setThemeModern: "modern",
  setThemeGradient: "gradient",
}

export function createPresentationCommandHandler(): (cmd: WoCommand) => void {
  return (cmd: WoCommand): void => {
    const command = cmd.command

    // 1. Navigation (fallback — Toolbar already handles these inline)
    switch (command) {
      case "addSlide":
        presentationStore.addSlide()
        return
      case "goToFirstSlide":
        presentationStore.setCurrentSlide(0)
        return
      case "goToPrevSlide":
        presentationStore.setCurrentSlide(Math.max(0, presentationStore.currentSlide - 1))
        return
      case "goToNextSlide":
        presentationStore.setCurrentSlide(
          Math.min(presentationStore.totalSlides - 1, presentationStore.currentSlide + 1),
        )
        return
      case "goToLastSlide":
        presentationStore.setCurrentSlide(presentationStore.totalSlides - 1)
        return
      default:
        break
    }

    // 2. Transitions
    const transition = TRANSITION_BY_CMD[command]
    if (transition) {
      presentationStore.setSlideTransition(presentationStore.currentSlide, transition)
      return
    }

    // 3. Theme
    const theme = THEME_BY_CMD[command]
    if (theme) {
      presentationStore.setThemeType("custom")
      presentationStore.setTheme({
        name: theme,
        colorScheme: {
          name: theme,
          colors: [
            { name: "primary", color: theme === "dark" ? "#1a1a2e" : theme === "modern" ? "#0066cc" : "#2f5496" },
            { name: "secondary", color: "#f0f0f0" },
            { name: "background", color: theme === "dark" ? "#16213e" : "#ffffff" },
            { name: "text", color: theme === "dark" ? "#eaeaea" : "#222222" },
          ],
        },
        fontScheme: {
          name: theme,
          majorFont: { latin: "Calibri" },
          minorFont: { latin: "Calibri" },
        },
      })
      return
    }

    // 4. Slide size
    if (command === "setSlideSizeStandard" || command === "setSlideSizeWidescreen") {
      presentationStore.setSlideSize(
        command === "setSlideSizeWidescreen" ? "widescreen" : "standard",
      )
      return
    }

    // 5. Background
    if (command === "setBackgroundNone" || command === "resetBackground") {
      presentationStore.setSlideBackground(presentationStore.currentSlide, undefined)
      return
    }
    if (command === "setBackgroundSolid") {
      presentationStore.setSlideBackground(presentationStore.currentSlide, {
        type: "solid",
        color: "#ffffff",
      })
      return
    }
    if (command === "setBackgroundGradient") {
      presentationStore.setSlideBackground(presentationStore.currentSlide, {
        type: "gradient",
        color: "#e0e8ff",
      })
      return
    }

    // 6. Duration / advance
    const durationByCmd: Record<string, number> = {
      setDurationVeryFast: 0.5,
      setDurationFast: 1,
      setDurationNormal: 2,
      setDurationSlow: 3,
      setDurationVerySlow: 5,
      setAnimDurationVeryFast: 0.5,
      setAnimDurationFast: 1,
      setAnimDurationNormal: 2,
      setAnimDurationSlow: 3,
      setAnimDurationVerySlow: 5,
    }
    if (durationByCmd[command]) {
      presentationStore.setTransitionDuration(durationByCmd[command])
      return
    }
    if (command === "setAdvanceClick" || command === "setStartOnClick") {
      presentationStore.setAdvanceMode("click")
      return
    }
    if (command === "setAdvanceTiming" || command === "setStartAfterPrevious" || command === "setStartWithPrevious") {
      presentationStore.setAdvanceMode("after")
      presentationStore.setAdvanceTiming(5)
      return
    }
    if (command === "setTransitionSoundNone") {
      presentationStore.setTransitionSoundEnabled(false)
      return
    }
    if (command === "setTransitionSound") {
      presentationStore.setTransitionSoundEnabled(true)
      return
    }

    // 7. Insert shapes / text boxes
    if (command === "insertTextBox") {
      presentationStore.addShape(presentationStore.currentSlide, {
        id: `text-${Date.now()}`,
        type: "rect",
        x: 200,
        y: 180,
        width: 320,
        height: 60,
        rotation: 0,
        zIndex: 1,
        text: "Text Box",
        fontSize: 18,
        fontColor: "#333333",
      })
      return
    }
    if (command === "insertShape") {
      presentationStore.addShape(presentationStore.currentSlide, {
        id: `shape-${Date.now()}`,
        type: "rect",
        x: 250,
        y: 200,
        width: 160,
        height: 120,
        rotation: 0,
        zIndex: 1,
        fillColor: "#4f81bd",
      })
      return
    }
    if (command === "insertConnectorStraight" || command === "insertConnectorCurved" || command === "insertConnectorBent") {
      presentationStore.addShape(presentationStore.currentSlide, {
        id: `line-${Date.now()}`,
        type: "line",
        x: 100,
        y: 300,
        width: 300,
        height: 2,
        rotation: 0,
        zIndex: 1,
        strokeColor: "#333333",
        strokeWidth: 2,
      })
      return
    }
    if (command === "insertChart") {
      presentationStore.addChartToSlide(presentationStore.currentSlide, "bar")
      return
    }

    // 8. Formatting — route to Monaco/RTE (text edit mode) or accept silently
    const silent = new Set([
      "bold", "italic", "underline", "strike", "textColor", "highlight",
      "increaseFontSize", "decreaseFontSize", "fontFamily",
      "alignLeft", "alignCenter", "alignRight", "alignTop", "alignMiddle", "alignBottom",
      "bulletList", "orderedList", "indent", "outdent", "lineSpacing",
      "cut", "copy", "paste", "selectAll", "find", "replace",
      "startPresentation", "startPreview", "stopPreview",
      "setZoomLevel", "fitToPage", "fitToWidth",
      "insertPicture", "insertOnlinePicture", "insertPhotoAlbum", "insertIcon",
      "insert3dModel", "insertAudio", "insertVideo", "insertLink", "insertSymbol",
      "insertEquation", "insertWordArt", "insertDateTime", "insertHeaderFooter",
      "insertSlideNumber", "insertTable",
      "arrange", "distributeHorizontally", "distributeVertically",
      "setAnimationCategoryNone", "setAnimationDelay", "setAnimationEmphasis",
      "setAnimationEntrance", "setAnimationExit", "setAnimationMotionPath",
      "moveAnimationEarlier", "moveAnimationLater", "openAnimationPane",
      "applyTransitionToAll", "quickStyles", "bgColor", "bgColorStart", "bgColorEnd",
      "formatPainter", "textDirection",
    ])
    if (silent.has(command)) {
      return
    }

    // 9. Unknown
    console.warn(`[slide-commands] unhandled command: ${command}`)
  }
}
