import type { WorldOfficePlugin } from "./index"

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate a WorldOfficePlugin instance.
 * Checks that required fields are present and correctly typed.
 */
export function validatePlugin(plugin: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!plugin || typeof plugin !== "object") {
    errors.push("Plugin must be a non-null object")
    return { valid: false, errors, warnings }
  }

  const p = plugin as Record<string, unknown>

  if (!p.id || typeof p.id !== "string") {
    errors.push("Plugin must have a string 'id' field")
  } else if (!/^[a-z0-9-]+$/.test(p.id)) {
    errors.push("Plugin 'id' must contain only lowercase alphanumeric characters and hyphens")
  }

  if (!p.name || typeof p.name !== "string") {
    errors.push("Plugin must have a string 'name' field")
  }

  if (!p.version || typeof p.version !== "string") {
    errors.push("Plugin must have a string 'version' field")
  } else if (!/^\d+\.\d+\.\d+$/.test(p.version)) {
    warnings.push("Plugin 'version' should follow semantic versioning (e.g. 1.0.0)")
  }

  if (p.description !== undefined && typeof p.description !== "string") {
    warnings.push("Plugin 'description' should be a string")
  }

  if (typeof p.init !== "function") {
    errors.push("Plugin must have a function 'init' that receives PluginContext")
  }

  if (typeof p.destroy !== "function") {
    errors.push("Plugin must have a function 'destroy' for cleanup")
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
