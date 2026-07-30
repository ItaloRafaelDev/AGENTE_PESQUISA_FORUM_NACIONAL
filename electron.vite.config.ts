import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { createSourceAliases } from './source-aliases'

const sourceAliases = createSourceAliases(__dirname)

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': sourceAliases['@renderer']
      }
    },
    plugins: [react()]
  }
})
