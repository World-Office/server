/*
 * (c) Copyright Ascensio System SIA 2010-2024
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation. In accordance with
 * Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement
 * of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR  PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 */

/**
 * Screen reader helper interface for aria-live TTS announcements.
 */
export interface IScreenReaderHelper {
  /**
   * Enable or disable the screen reader helper.
   * When enabled, creates an aria-live element if needed.
   * @param enabled - Whether to enable the helper
   */
  setEnabled(enabled: boolean): void

  /**
   * Disable the screen reader helper.
   * Removes the aria-live element from the DOM.
   */
  disable(): void

  /**
   * Announce text to screen readers via aria-live region.
   * @param text - The text to announce
   */
  speech(text: string): void
}

/**
 * Screen reader helper implementation.
 * Uses an aria-live element for text-to-speech announcements.
 * Removes jQuery dependency in favor of native DOM API.
 */
class ScreenReaderHelper implements IScreenReaderHelper {
  private _elem: HTMLDivElement | null = null

  /**
   * Enable or disable the screen reader helper.
   * @param enabled - Whether to enable the helper
   */
  setEnabled(enabled: boolean): void {
    if (enabled) {
      if (!this._elem) {
        // Try to find existing aria-live element
        const existing = document.querySelector("div[aria-live]")
        if (existing) {
          this._elem = existing as HTMLDivElement
        } else {
          // Create new aria-live element
          this._elem = document.createElement("div")
          this._elem.setAttribute("aria-live", "assertive")
          this._elem.className = "sr-only"
          this._elem.style.cssText = ""
          document.body.appendChild(this._elem)
        }
      }
    } else {
      if (this._elem) {
        this._elem.remove()
        this._elem = null
      }
    }
  }

  /**
   * Disable the screen reader helper.
   */
  disable(): void {
    this.setEnabled(false)
  }

  /**
   * Announce text to screen readers.
   * Clears the text first, then sets it on the next tick to ensure
   * screen readers announce the update.
   * @param text - The text to announce
   */
  speech(text: string): void {
    if (!this._elem) {
      this.setEnabled(true)
    }

    if (!this._elem) return

    // Clear first, then set on next tick to ensure announcement
    this._elem.textContent = ""
    setTimeout(() => {
      if (this._elem) {
        this._elem.textContent = text
      }
    }, 0)
  }
}

/**
 * Global screen reader helper instance.
 * Use this for all TTS announcements.
 */
export const screenReaderHelper = new ScreenReaderHelper()
