import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { createSourceAliases } from './source-aliases'

const sourceAliases = createSourceAliases(__dirname)

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': sourceAliases['@'],
      '@renderer': sourceAliases['@renderer']
    }
  },

  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    typecheck: {
      include: ['tests/**/*.test-d.ts'],
      tsconfig: 'tsconfig.type-tests.json'
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts']
    }
  }
})
