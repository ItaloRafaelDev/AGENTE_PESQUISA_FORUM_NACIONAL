import { mkdir, open, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

export interface DeskDataPdfFile {
  filePath: string
  fileName: string
  sizeBytes: number
  modifiedAtMs: number
}

export class DeskDataLatestPdfLocator {
  constructor(private readonly directory: string) {}

  async findLatestValid(): Promise<DeskDataPdfFile> {
    await mkdir(this.directory, {
      recursive: true
    })

    const entries = await readdir(this.directory, {
      withFileTypes: true
    })

    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.pdf')
        .map(async (entry) => {
          return this.inspectFile(join(this.directory, entry.name), entry.name)
        })
    )

    const validCandidates = candidates
      .filter((candidate): candidate is DeskDataPdfFile => candidate !== undefined)
      .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs)

    const latest = validCandidates.at(0)

    if (!latest) {
      throw new Error('Nenhum PDF válido da DeskData foi encontrado em ' + this.directory + '.')
    }

    return latest
  }

  private async inspectFile(
    filePath: string,
    fileName: string
  ): Promise<DeskDataPdfFile | undefined> {
    try {
      const fileStat = await stat(filePath)

      if (!fileStat.isFile() || fileStat.size < 5) {
        return undefined
      }

      const signature = Buffer.alloc(5)
      const fileHandle = await open(filePath, 'r')

      try {
        const readResult = await fileHandle.read(signature, 0, signature.length, 0)

        if (readResult.bytesRead !== signature.length || signature.toString('ascii') !== '%PDF-') {
          return undefined
        }
      } finally {
        await fileHandle.close()
      }

      return {
        filePath,
        fileName,
        sizeBytes: fileStat.size,
        modifiedAtMs: fileStat.mtimeMs
      }
    } catch {
      return undefined
    }
  }
}
