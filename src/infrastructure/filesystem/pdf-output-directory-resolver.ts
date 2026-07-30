import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'

export interface WritableDirectoryFilesystem {
  ensureWritableDirectory(path: string): Promise<void>
}

export interface PdfOutputDirectories {
  preferredDirectory: string
  fallbackDirectory: string
}

const nodeWritableDirectoryFilesystem: WritableDirectoryFilesystem = {
  async ensureWritableDirectory(path: string): Promise<void> {
    await mkdir(path, {
      recursive: true
    })
    await access(path, constants.W_OK)
  }
}

export async function resolvePdfOutputDirectory(
  directories: PdfOutputDirectories,
  filesystem: WritableDirectoryFilesystem = nodeWritableDirectoryFilesystem
): Promise<string> {
  try {
    await filesystem.ensureWritableDirectory(directories.preferredDirectory)

    return directories.preferredDirectory
  } catch {
    await filesystem.ensureWritableDirectory(directories.fallbackDirectory)

    return directories.fallbackDirectory
  }
}
