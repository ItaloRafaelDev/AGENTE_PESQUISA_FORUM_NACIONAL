import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const productionSourcePattern = /\.(?:html|ts|tsx)$/

interface SourceFile {
  path: string
  source: string
}

function readSourceFiles(directory: string): readonly SourceFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return readSourceFiles(entryPath)
      }

      return productionSourcePattern.test(entry.name)
        ? [{ path: entryPath.replaceAll('\\', '/'), source: readFileSync(entryPath, 'utf8') }]
        : []
    })
}

function readSourceTree(directory: string): string {
  return readSourceFiles(directory)
    .map(({ source }) => source)
    .join('\n')
}

function expectRestrictedRendererApi(source: string): void {
  expect(source).not.toMatch(/\bwindow\.electron\b/)
  expect(source).not.toMatch(/\belectronAPI\b/)
  expect(source).not.toMatch(/\bipcRenderer\b/)
  expect(source).not.toMatch(/\bIpcRendererEvent\b/)
  expect(source).not.toMatch(/\bwindow\.agent\.(?:send|invoke)\b/)
  expect(source).not.toMatch(/\b(?:send|invoke)\s*\(/)
}

function hasPropertyName(property: ts.ObjectLiteralElementLike, expectedName: string): boolean {
  const propertyName = property.name

  return (
    propertyName !== undefined &&
    (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) &&
    propertyName.text === expectedName
  )
}

function requirePropertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string
): ts.PropertyAssignment {
  const matchingProperties = objectLiteral.properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && hasPropertyName(property, propertyName)
  )

  if (matchingProperties.length !== 1) {
    throw new Error(`Propriedade ${propertyName} deve existir exatamente uma vez.`)
  }

  return matchingProperties[0]
}

function requireSingleBrowserWindowOptions(source: string): ts.ObjectLiteralExpression {
  const sourceFile = ts.createSourceFile(
    'electron-main.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const browserWindowCreations: ts.NewExpression[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'BrowserWindow'
    ) {
      browserWindowCreations.push(node)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (browserWindowCreations.length !== 1) {
    throw new Error('Deve existir exatamente uma criação de BrowserWindow.')
  }

  const options = browserWindowCreations[0].arguments?.[0]

  if (!options || !ts.isObjectLiteralExpression(options)) {
    throw new Error('BrowserWindow deve receber opções em um objeto literal.')
  }

  return options
}

function requireBooleanProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  expectedValue: boolean
): void {
  const property = requirePropertyAssignment(objectLiteral, propertyName)
  const expectedKind = expectedValue ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword

  if (property.initializer.kind !== expectedKind) {
    throw new Error(`Propriedade ${propertyName} deve ser ${expectedValue}.`)
  }
}

function expectSecureBrowserWindowPreferences(source: string): void {
  const browserWindowOptions = requireSingleBrowserWindowOptions(source)
  const webPreferencesProperty = requirePropertyAssignment(browserWindowOptions, 'webPreferences')

  if (!ts.isObjectLiteralExpression(webPreferencesProperty.initializer)) {
    throw new Error('webPreferences deve ser um objeto literal.')
  }

  const webPreferences = webPreferencesProperty.initializer

  requireBooleanProperty(webPreferences, 'sandbox', true)
  requireBooleanProperty(webPreferences, 'contextIsolation', true)
  requireBooleanProperty(webPreferences, 'nodeIntegration', false)
}

const preloadSource = readFileSync('src/preload/index.ts', 'utf8')
const preloadDeclarationSource = readFileSync('src/preload/index.d.ts', 'utf8')
const mainSource = readFileSync('src/main/index.ts', 'utf8')
const productionSource = readSourceTree('src')
const rendererHtmlSource = readFileSync('src/renderer/index.html', 'utf8')
const rendererSourceFiles = readSourceFiles('src/renderer/src')
const rendererSource = readSourceTree('src/renderer')

describe('contrato de segurança do Electron', () => {
  it('expõe somente window.agent no preload e nos tipos globais', () => {
    expect(preloadSource).not.toContain("from '@electron-toolkit/preload'")
    expect(preloadSource).not.toMatch(/exposeInMainWorld\(\s*['"]electron['"]/)
    expect(preloadSource.match(/exposeInMainWorld\s*\(/g)).toHaveLength(1)
    expect(preloadDeclarationSource).not.toContain('ElectronAPI')
    expect(preloadDeclarationSource).not.toMatch(/\belectron\s*:/)
    expect(preloadDeclarationSource.match(/\bagent:\s*AgentApi\b/g)).toHaveLength(1)
    expect(preloadDeclarationSource.match(/interface Window\s*\{([^}]*)\}/)?.[1].trim()).toBe(
      'agent: AgentApi'
    )
  })

  it('impede acesso do renderer a IPC bruto ou arbitrário', () => {
    expectRestrictedRendererApi(rendererSource)

    expect(
      rendererSourceFiles
        .filter(({ source }) => /\bwindow\.agent\b/.test(source))
        .map(({ path }) => path)
    ).toEqual(['src/renderer/src/api/agent-api.ts'])
  })

  it('rejeita o identificador electronAPI no renderer', () => {
    expect(() => expectRestrictedRendererApi('const genericApi = window.electronAPI')).toThrow()
  })

  it('mantém o renderer em sandbox sem preferências inseguras', () => {
    expectSecureBrowserWindowPreferences(mainSource)

    expect(productionSource).not.toMatch(/sandbox:\s*false/)
    expect(productionSource).not.toMatch(/webSecurity:\s*false/)
    expect(productionSource).not.toMatch(/allowRunningInsecureContent:\s*true/)
    expect(productionSource).not.toMatch(/experimentalFeatures:\s*true/)
    expect(productionSource).not.toContain('enableBlinkFeatures')
    expect(productionSource).not.toMatch(/<webview\b/i)
  })

  it('aceita as três flags diretamente em webPreferences', () => {
    expect(() =>
      expectSecureBrowserWindowPreferences(`
        new BrowserWindow({
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
      `)
    ).not.toThrow()
  })

  it.each([
    [
      'sandbox movido para as opções da janela',
      `
        new BrowserWindow({
          sandbox: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        })
      `
    ],
    [
      'contextIsolation movido para as opções da janela',
      `
        new BrowserWindow({
          contextIsolation: true,
          webPreferences: {
            sandbox: true,
            nodeIntegration: false
          }
        })
      `
    ],
    [
      'nodeIntegration movido para as opções da janela',
      `
        new BrowserWindow({
          nodeIntegration: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true
          }
        })
      `
    ],
    [
      'sandbox removido',
      `
        new BrowserWindow({
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        })
      `
    ],
    [
      'contextIsolation removido',
      `
        new BrowserWindow({
          webPreferences: {
            sandbox: true,
            nodeIntegration: false
          }
        })
      `
    ],
    [
      'nodeIntegration removido',
      `
        new BrowserWindow({
          webPreferences: {
            sandbox: true,
            contextIsolation: true
          }
        })
      `
    ],
    [
      'segunda BrowserWindow adicionada',
      `
        new BrowserWindow({
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        new BrowserWindow({})
      `
    ]
  ])('rejeita %s', (_name, source) => {
    expect(() => expectSecureBrowserWindowPreferences(source)).toThrow()
  })

  it('preserva a política de conteúdo restritiva do renderer', () => {
    expect(rendererHtmlSource).toMatch(/default-src\s+'self'/)
    expect(rendererHtmlSource).toMatch(/script-src\s+'self'/)
    expect(rendererHtmlSource).toMatch(/style-src\s+'self'\s+'unsafe-inline'/)
    expect(rendererHtmlSource).toMatch(/img-src\s+'self'\s+data:/)
  })
})
