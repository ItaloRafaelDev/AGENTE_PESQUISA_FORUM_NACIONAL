import { parseAppConfig, type AppConfig } from '../../src/infrastructure/config/app-config'
import {
  resolveOperationalPaths,
  type OperationalPaths
} from '../../src/infrastructure/filesystem/runtime-paths'

export function resolveWindowsOperationalConfig(appData = process.env.APPDATA): {
  config: AppConfig
  paths: OperationalPaths
} {
  if (!appData?.trim()) {
    throw new Error('APPDATA não está disponível no Windows')
  }

  const config = parseAppConfig()

  return {
    config,
    paths: resolveOperationalPaths(appData, config.paths)
  }
}
