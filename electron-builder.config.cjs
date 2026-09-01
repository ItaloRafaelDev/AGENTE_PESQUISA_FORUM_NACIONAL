// eslint-disable-next-line @typescript-eslint/no-require-imports -- electron-builder loads this CommonJS config synchronously.
const identity = require('./build/application-identity.json')

module.exports = {
  appId: identity.appId,
  productName: identity.productName,
  directories: { buildResources: 'build', output: 'release' },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  win: {
    icon: 'build/icon.ico',
    executableName: identity.executableName,
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    artifactName: `${identity.artifactBaseName}-\${version}-Setup-x64.\${ext}`,
    shortcutName: identity.productName,
    uninstallDisplayName: identity.productName,
    createStartMenuShortcut: true,
    createDesktopShortcut: false,
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
    include: 'build/installer.nsh'
  },
  npmRebuild: false,
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/'
  }
}
