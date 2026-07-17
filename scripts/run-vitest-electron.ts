import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function resolveVitestCli(): string {
  try {
    return require.resolve('vitest/vitest.mjs')
  } catch {
    const packagePath = require.resolve('vitest/package.json')

    return join(dirname(packagePath), 'vitest.mjs')
  }
}

const electronPath = require('electron') as string

const vitestCliPath = resolveVitestCli()

const result = spawnSync(electronPath, [vitestCliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
  windowsHide: false,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  }
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
