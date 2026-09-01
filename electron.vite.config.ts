import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createSourceAliases } from './source-aliases'

const sourceAliases = createSourceAliases(__dirname)

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'install-playwright-chromium': resolve(
            __dirname,
            'src/main/install-playwright-chromium.ts'
          )
        }
      }
    },
    resolve: {
      alias: {
        '@': sourceAliases['@']
      }
    }
  },
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
