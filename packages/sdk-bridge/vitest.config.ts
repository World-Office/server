import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Use jsdom environment since we're testing browser-like code
    environment: "jsdom",
    globals: true,
    // Include test files
    include: ["**/__tests__/**/*.test.ts"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.config.*"],
    },
    // Allow importing TypeScript files directly
    transformMode: {
      web: [/\.[tj]sx?$/],
    },
  },
  resolve: {
    alias: {
      "@world-office/sdk-bridge": "./src",
    },
  },
})
