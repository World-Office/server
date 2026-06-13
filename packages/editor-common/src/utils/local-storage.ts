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
 * LocalStorage interface with fallback to in-memory store.
 * Provides type-safe methods for storing and retrieving values.
 */
export interface ILocalStorage {
  /**
   * Get a string value from storage.
   * @param name - The key to retrieve
   * @returns The string value or null if not found
   */
  getItem(name: string): string | null

  /**
   * Get an integer value from storage.
   * @param name - The key to retrieve
   * @param defValue - Default value if not found (defaults to 0)
   * @returns The integer value or default
   */
  getItemAsInt(name: string, defValue?: number): number

  /**
   * Get a boolean value from storage.
   * @param name - The key to retrieve
   * @param defValue - Default value if not found (defaults to false)
   * @returns The boolean value or default
   */
  getBool(name: string, defValue?: boolean): boolean

  /**
   * Set a string value in storage.
   * @param name - The key to set
   * @param value - The string value to store
   */
  setItem(name: string, value: string): void

  /**
   * Set a boolean value in storage (stored as "1" or "0").
   * @param name - The key to set
   * @param value - The boolean value to store
   */
  setBool(name: string, value: boolean): void

  /**
   * Remove a value from storage.
   * @param name - The key to remove
   */
  removeItem(name: string): void

  /**
   * Check if a key exists in storage.
   * @param name - The key to check
   * @returns true if the key exists, false otherwise
   */
  itemExists(name: string): boolean

  /**
   * Sync storage (placeholder for future functionality).
   */
  sync(): void

  /**
   * Save storage (placeholder for future functionality).
   */
  save(): void
}

/**
 * LocalStorage implementation with in-memory fallback.
 * Uses browser localStorage when available, falls back to memory store.
 */
class LocalStorage implements ILocalStorage {
  private _lsAllowed: boolean
  private _store: Record<string, string>

  constructor() {
    this._store = {}

    // Test if localStorage is accessible (WebView check)
    try {
      localStorage.setItem("test", "1")
      localStorage.removeItem("test")
      this._lsAllowed = true
    } catch (e) {
      this._lsAllowed = false
    }
  }

  getItem(name: string): string | null {
    if (this._lsAllowed) {
      return localStorage.getItem(name)
    }
    return this._store[name] === undefined ? null : this._store[name]
  }

  getItemAsInt(name: string, defValue?: number): number {
    const value = this.getItem(name)
    return value !== null ? Number.parseInt(value, 10) : (defValue ?? 0)
  }

  getBool(name: string, defValue?: boolean): boolean {
    const value = this.getItem(name)
    const defaultValue = defValue ?? false
    return value !== null ? Number.parseInt(value, 10) !== 0 : defaultValue
  }

  setItem(name: string, value: string): void {
    if (this._lsAllowed) {
      try {
        localStorage.setItem(name, value)
      } catch (error) {
        // Silently fail if localStorage is full or unavailable
      }
    } else {
      this._store[name] = value
    }
  }

  setBool(name: string, value: boolean): void {
    this.setItem(name, value ? "1" : "0")
  }

  removeItem(name: string): void {
    if (this._lsAllowed) {
      localStorage.removeItem(name)
    } else {
      delete this._store[name]
    }
  }

  itemExists(name: string): boolean {
    return this.getItem(name) !== null
  }

  sync(): void {
    // Placeholder for future sync functionality
  }

  save(): void {
    // Placeholder for future save functionality
  }
}

/**
 * Global LocalStorage instance.
 * Use this for all storage operations.
 */
export const localStorage = new LocalStorage()
