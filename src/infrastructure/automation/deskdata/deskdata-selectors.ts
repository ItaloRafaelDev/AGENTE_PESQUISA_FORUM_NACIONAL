export const DESKDATA_SEARCH_SELECTORS = {
  form: 'form#form',

  cpfKeyButton: 'form#form button[title="CPF"]',

  cpfInput: 'form#form input#cpf[name="cpf"][type="text"]',

  searchButton: 'form#form input#search[name="submit"][type="submit"]'
} as const

export const DESKDATA_DATASET_SELECTORS = {
  allCheckboxes: 'form#form input[type="checkbox"]'
} as const

export const DESKDATA_NEXT_SEARCH_SELECTORS = {
  primaryKey: 'form#form select#key-select[name="key-select"]',
  cpfInput: 'form#form input#cpf[name="cpf"][type="text"]',
  searchButton: 'form#form input#search[name="submit"][type="submit"]',
  similarQueriesHeading: 'h5:has-text("Consultas semelhantes encontradas")',
  consultPeopleLink:
    'a[href="https://app.deskdata.com.br/pessoas/"]:visible, a[href="https://app.deskdata.com.br/pessoas"]:visible'
} as const

export const DESKDATA_SUBMIT_SELECTORS = {
  searchButton: 'form#form input#search[name="submit"][type="submit"]'
} as const

export const DESKDATA_SIMILAR_QUERY_SELECTORS = {
  rows: 'table tbody tr:has(a[href*="/historico/detalhes"])',
  historyLink: 'a[href*="/historico/detalhes"]',
  rowCells: 'td'
} as const

export const DESKDATA_PDF_EXPORT_SELECTOR =
  'form[method="POST"] input[type="submit"][name="export"][value="Exportar"][formtarget="_blank"]'

export const DESKDATA_PROCESSES_SECTION_SELECTOR = '#processes'

export const DESKDATA_PROCESSES_UPDATED_MESSAGE =
  'A consulta ao conjunto de dados Processos foi atualizada.'

export const DESKDATA_PROCESSES_UPDATED_SELECTOR = `.toast-message:text-is("${DESKDATA_PROCESSES_UPDATED_MESSAGE}"):visible`

export const DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE = 'data-agent-cpi-processes-updated'

export const DESKDATA_PROCESSES_UPDATED_MARKER_SELECTOR = `html[${DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE}="true"]`
export const DESKDATA_MINOR_SEARCH_SELECTORS = {
  notice: 'p:has-text("pessoa menor de 18 anos de idade"):visible',
  back: 'button[type="submit"]:text-is("Voltar"):visible',
  primaryKey: 'form#form select#key-select[name="key-select"]',
  secondaryKey: 'form#form select#key-extra-select[name="key-extra-select"]',
  fullName: 'form#form input#fullname[name="fullname"][type="text"]',
  birthDate: 'form#form input#birthdate[name="birthdate"][type="text"]'
} as const
