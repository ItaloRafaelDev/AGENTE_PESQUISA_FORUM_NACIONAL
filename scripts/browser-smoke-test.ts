import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { BrowserManager } from '../src/automation/browser/browser-manager'
import { PlaywrightBrowserLauncher } from '../src/automation/browser/playwright-browser-launcher'
import {
  ensureRuntimeDirectories,
  resolveRuntimePaths
} from '../src/infrastructure/filesystem/runtime-paths'

async function main(): Promise<void> {
  const runtimePaths = resolveRuntimePaths(join(process.cwd(), 'data', 'runtime'))

  await ensureRuntimeDirectories(runtimePaths)

  const manager = new BrowserManager(
    new PlaywrightBrowserLauncher(),
    runtimePaths.browserProfileDir
  )

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  try {
    console.log('Iniciando Chromium persistente...')

    const snapshot = await manager.start()
    const context = manager.getContext()
    const page = context.pages()[0] ?? (await context.newPage())

    await page.setContent(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Agente CPI</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              font-family: Arial, sans-serif;
              background: #111827;
              color: #f9fafb;
            }

            main {
              width: min(680px, 90%);
              padding: 40px;
              border: 1px solid #374151;
              border-radius: 16px;
              background: #1f2937;
            }

            h1 {
              margin-top: 0;
            }

            code {
              color: #93c5fd;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>Teste do navegador concluído</h1>
            <p>
              O Chromium foi aberto pelo Playwright com perfil persistente.
            </p>
            <p>
              Perfil:
              <code>${runtimePaths.browserProfileDir}</code>
            </p>
          </main>
        </body>
      </html>
    `)

    console.log('Estado:', snapshot.state)
    console.log('Perfil:', snapshot.profilePath)
    console.log('Navegador aberto com sucesso.')
    console.log('Não feche manualmente a janela durante este teste.')

    await terminal.question('Pressione ENTER no terminal para fechar com segurança...')
  } finally {
    terminal.close()

    if (manager.getSnapshot().state === 'RUNNING') {
      await manager.stop()
    }

    console.log('Navegador encerrado com segurança.')
  }
}

main().catch((error: unknown) => {
  console.error('Falha no teste do navegador:', error)
  process.exitCode = 1
})
