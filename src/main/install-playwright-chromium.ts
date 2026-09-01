import { installPlaywrightChromium } from './distribution/playwright-browser-installation'

const INSTALLATION_ERROR_MESSAGE = 'Não foi possível preparar o Chromium necessário.'

void installPlaywrightChromium().catch(() => {
  console.error(INSTALLATION_ERROR_MESSAGE)
  process.exitCode = 1
})
