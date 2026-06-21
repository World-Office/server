import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? { junit: "./coverage/junit.xml" } : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts", "src/index.ts", "src/types/**"],
      thresholds: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
  },
})
