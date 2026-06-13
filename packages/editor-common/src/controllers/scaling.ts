/**
 * Scaling controller — manages pixel ratio scaling for high DPI displays.
 *
 * Watches for changes to body class attributes that indicate pixel ratio
 * and emits scaling events via the notification center.
 */

import { type ControllerEvents, notificationCenter } from "../core/event-bus"

/** Maps body class names to pixel ratio values */
const SCALING_MAP: Record<string, number> = {
  "pixel-ratio__1": 1,
  "pixel-ratio__1_25": 1.25,
  "pixel-ratio__1_5": 1.5,
  "pixel-ratio__1_75": 1.75,
  "pixel-ratio__2": 2,
  "pixel-ratio__2_5": 2.25,
}

/** Extracts the pixel ratio class name from a class string */
function getScalingClassFromClassList(classList: string): string {
  const match = /(pixel-ratio__[\w-]+)/.exec(classList)
  if (match && match[1] in SCALING_MAP) {
    return match[1]
  }
  return "pixel-ratio__1"
}

let currentScalingClass = getScalingClassFromClassList(document.body.className)

/** Handles body class mutations and emits scaling events */
function handleBodyMutation(_records: MutationRecord[], _observer: MutationObserver): void {
  const newScalingClass = getScalingClassFromClassList(document.body.className)
  if (newScalingClass !== currentScalingClass) {
    notificationCenter.emit("app:scaling", {
      ratio: SCALING_MAP[newScalingClass],
    })
    currentScalingClass = newScalingClass
  }
}

// Initialize MutationObserver to watch for body class changes
new MutationObserver(handleBodyMutation).observe(document.body, {
  attributes: true,
  attributeFilter: ["class"],
})

/**
 * Gets the current pixel ratio value.
 * @returns The current pixel ratio (e.g., 1, 1.5, 2)
 */
export function getCurrentRatio(): number {
  return SCALING_MAP[currentScalingClass]
}

/**
 * Gets the current pixel ratio class name selector.
 * @returns The class name selector (e.g., "pixel-ratio__1_5")
 */
export function getCurrentRatioSelector(): string {
  return currentScalingClass
}

/**
 * Scaling event type.
 */
export type ScalingEvent = ControllerEvents["app:scaling"]
