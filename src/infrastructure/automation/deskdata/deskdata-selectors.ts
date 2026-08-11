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
