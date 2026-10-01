import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { CpiResearchPersonalDetailsReader } from '../src/infrastructure/automation/cpi/cpi-research-personal-details-reader'
import { DeskDataCpfFormController } from '../src/infrastructure/automation/deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../src/infrastructure/automation/deskdata/deskdata-dataset-controller'
import { DeskDataMinorSearchController } from '../src/infrastructure/automation/deskdata/deskdata-minor-search-controller'
import { DeskDataNextSearchController } from '../src/infrastructure/automation/deskdata/deskdata-next-search-controller'
import { DeskDataResultReadyWaiter } from '../src/infrastructure/automation/deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchResultPageResolver } from '../src/infrastructure/automation/deskdata/deskdata-search-result-page-resolver'
import { DeskDataSearchSubmitController } from '../src/infrastructure/automation/deskdata/deskdata-search-submit-controller'
import { PlaywrightDeskDataResearchAdapter } from '../src/infrastructure/automation/workflow/playwright-deskdata-research-adapter'
import { PlaywrightResearchPreparationState } from '../src/infrastructure/automation/workflow/playwright-research-preparation-state'

const datasets = [
  'basic_data',
  'emails_extended',
  'addresses_extended',
  'phones_extended',
  'occupation_data',
  'processes'
]
const exportForm =
  '<form method="POST"><input type="submit" name="export" value="Exportar" formtarget="_blank"></form>'
const searchForm = [
  '<form id="form" action="/pessoas/resultado/" method="GET">',
  '<select id="key-select" name="key-select" onchange="',
  "document.getElementById('cpf').hidden = this.value !== 'cpf';",
  "document.getElementById('fullname').hidden = this.value !== 'fullname';",
  "document.getElementById('birthdate').hidden = this.value !== 'fullname'",
  '"><option value="cpf">CPF</option><option value="fullname">Nome</option></select>',
  '<input id="cpf" name="cpf" type="text">',
  '<input id="fullname" name="fullname" type="text" hidden>',
  '<select id="key-extra-select" name="key-extra-select">',
  '<option value="">Selecione</option><option value="birthdate">Data de nascimento</option></select>',
  '<input id="birthdate" name="birthdate" type="text" hidden>',
  ...datasets.map((id) => '<input type="checkbox" name="' + id + '" id="' + id + '">'),
  '<input type="checkbox" name="unapproved" id="unapproved" checked>',
  '<input id="search" name="submit" type="submit" value="Consultar"></form>'
].join('')

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext()
    const submissions: { fields: URLSearchParams; time: number }[] = []
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'cpi.test') {
        await route.fulfill({
          contentType: 'text/html',
          body: [
            '<div class="cell txt w15">CPF:</div><div class="cell field w35">529.982.247-25</div>',
            '<div class="cell txt w15">Nome do Pesquisado:</div><div class="cell field w85">Pessoa Ficticia Teste</div>',
            '<div class="cell txt">Nascimento:</div><div class="cell field">29/02/2012</div>'
          ].join('')
        })
      } else if (url.hostname === 'app.deskdata.com.br' && url.pathname === '/pessoas/') {
        await route.fulfill({ contentType: 'text/html', body: searchForm })
      } else if (url.hostname === 'app.deskdata.com.br' && url.pathname === '/pessoas/resultado/') {
        const submissionNumber = submissions.length + 1
        submissions.push({ fields: url.searchParams, time: Date.now() })
        const confirmedNewQuery = url.searchParams.get('confirmed') === '1'
        const minor = submissionNumber === 1
        const similarQuery = submissionNumber === 3
        const normalResult =
          '<h3>Processos</h3><p>Não foram encontrados processos.</p>' +
          exportForm +
          '<form action="/pessoas/" method="GET"><button type="submit">Voltar</button></form>'
        const minorResult =
          '<h3>Busca indisponível</h3><p>Este CPF está vinculado a uma pessoa menor de 18 anos de idade. Em cumprimento a requisitos legais, é necessário informar a data de nascimento.</p>' +
          exportForm +
          '<form action="/pessoas/" method="GET"><button type="submit">Voltar</button></form>'
        const similarQueryResult = [
          '<h5>Consultas semelhantes encontradas</h5>',
          '<table><tbody><tr>',
          '<td>08/09/2026 16:57</td><td>Q-TESTE</td><td>CPF: 529.982.247-25</td>',
          '<td>Dados básicos Emprego Processos</td>',
          '<td><a href="/historico/detalhes?q=Q-TESTE">Ver</a></td>',
          '</tr></tbody></table>',
          '<form action="/pessoas/resultado/" method="GET">',
          '<input type="hidden" name="confirmed" value="1">',
          '<button type="button" onclick="this.form.requestSubmit()">Confirmar</button></form>'
        ].join('')
        await route.fulfill({
          contentType: 'text/html',
          body: confirmedNewQuery
            ? normalResult
            : similarQuery
              ? similarQueryResult
              : minor
                ? minorResult
                : normalResult
        })
      } else {
        await route.abort()
      }
    })
    const cpi = await context.newPage()
    await cpi.goto('https://cpi.test/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx')
    const desk = await context.newPage()
    await desk.goto('https://app.deskdata.com.br/pessoas/')
    const reader = new CpiResearchPersonalDetailsReader()
    const state = new PlaywrightResearchPreparationState()
    const adapter = new PlaywrightDeskDataResearchAdapter(
      desk,
      {
        cpfForm: new DeskDataCpfFormController(),
        dataset: new DeskDataDatasetController(),
        submit: new DeskDataSearchSubmitController(),
        minorSearch: new DeskDataMinorSearchController({
          readDetails: (cpf) => reader.read(cpi.mainFrame(), cpf),
          dataset: new DeskDataDatasetController(),
          submit: new DeskDataSearchSubmitController()
        }),
        resultPageResolver: new DeskDataSearchResultPageResolver({
          searchAttempts: 5,
          searchIntervalMs: 10
        }),
        resultReady: new DeskDataResultReadyWaiter()
      },
      state
    )
    await adapter.fillCpf('52998224725')
    await adapter.applyApprovedDatasets()
    await adapter.submitOnce()
    assert.throws(() => state.requireResolvedResult())
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].fields.get('key-select'), 'cpf')
    assert.match(await desk.locator('body').innerText(), /pessoa menor de 18 anos de idade/)
    assert.equal(await desk.locator('p').count(), 1)
    assert.equal(
      await desk.locator('p:has-text("pessoa menor de 18 anos de idade"):visible').count(),
      1
    )
    await adapter.waitUntilResultReady()
    assert.equal(submissions.length, 2)
    assert.equal(submissions[0].fields.get('key-select'), 'cpf')
    assert.equal(submissions[1].fields.get('key-select'), 'fullname')
    assert.equal(submissions[1].fields.get('key-extra-select'), 'birthdate')
    assert.equal(submissions[1].fields.get('fullname'), 'Pessoa Ficticia Teste')
    assert.equal(submissions[1].fields.get('birthdate'), '29/02/2012')
    for (const { fields } of submissions) {
      assert.ok(datasets.every((id) => fields.get(id) === 'on'))
      assert.equal(fields.has('unapproved'), false)
    }
    assert.ok(submissions[1].time - submissions[0].time >= 15_000)
    assert.ok(Date.now() - submissions[1].time >= 15_000)
    assert.equal(state.requireResolvedResult().resultPage, desk)
    await new DeskDataNextSearchController().prepare(desk)

    const adultState = new PlaywrightResearchPreparationState()
    const adultAdapter = new PlaywrightDeskDataResearchAdapter(
      desk,
      {
        cpfForm: new DeskDataCpfFormController(),
        dataset: new DeskDataDatasetController(),
        submit: new DeskDataSearchSubmitController(),
        resultPageResolver: new DeskDataSearchResultPageResolver({
          searchAttempts: 5,
          searchIntervalMs: 10
        }),
        resultReady: new DeskDataResultReadyWaiter()
      },
      adultState
    )
    await adultAdapter.fillCpf('52998224725')
    await adultAdapter.applyApprovedDatasets()
    await adultAdapter.submitOnce()
    assert.equal(submissions.length, 3)
    assert.match(await desk.locator('body').innerText(), /Consultas semelhantes encontradas/)
    assert.throws(() => adultState.requireResolvedResult())
    await adultAdapter.waitUntilResultReady()
    assert.equal(submissions.length, 4)
    assert.equal(submissions[2].fields.get('key-select'), 'cpf')
    assert.equal(submissions[3].fields.get('confirmed'), '1')
    assert.ok(submissions[3].time - submissions[2].time >= 15_000)
    assert.ok(Date.now() - submissions[3].time >= 15_000)
    assert.equal(adultState.requireResolvedResult().resultPage, desk)

    console.log(
      'PASS: menor por nome, adulto com consulta anterior incompleta, confirmação única, seis conjuntos e esperas de 15s. Nenhuma requisição externa foi enviada.'
    )
  } finally {
    await browser.close()
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
