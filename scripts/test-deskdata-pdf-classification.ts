import { basename } from 'node:path'
import { DeskDataPdfProcessReader } from '../src/automation/deskdata/deskdata-pdf-process-reader'
import { classifyDeskDataSpheres } from '../src/domain/research/classify-deskdata-spheres'

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2)

  if (filePaths.length === 0) {
    throw new Error(
      'Informe pelo menos um PDF: pnpm exec tsx scripts/test-deskdata-pdf-classification.ts "arquivo.pdf"'
    )
  }

  const reader = new DeskDataPdfProcessReader()

  for (const filePath of filePaths) {
    const processes = await reader.read(filePath)
    const classification = classifyDeskDataSpheres(processes)

    console.log(
      JSON.stringify(
        {
          file: basename(filePath),
          processCount: processes.length,
          spheres: processes.map((process) => process.sphereRaw),
          result: classification.result,
          reason: classification.reason
        },
        null,
        2
      )
    )
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
