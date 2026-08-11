import type { ResearchClassification } from '../../../domain/research/research-classification'

export const CPI_QUEUE_SELECTORS = {
  advancedFilterButton: 'a.link:has(i[title="Filtros Avançados"])',

  showAllButton: 'a.link:has(i[title="Mostrar Tudo"])',

  targetFilterCheckbox: 'input#id_tipo_pesq_29[name="id_tipo_pesq"]',

  allFilterCheckboxes: 'input[type="checkbox"][name="id_tipo_pesq"]',

  selectButton: 'div.pa.ac > a.button:has-text("Selecionar")'
} as const

export const CPI_QUEUE_AVAILABILITY_SELECTORS = {
  frameBody: 'body'
} as const

export const CPI_RESEARCH_SELECTORS = {
  researchRows:
    'div.row.linhas:has(input[type="checkbox"][id^="pesq_"]):has(i[title="Responder / Atualizar"])',

  responderAction: 'i[title="Responder / Atualizar"]',

  deleteAction: 'i[title="Excluir"]'
} as const

export const CPI_RESEARCH_DATA_SELECTORS = {
  cpfValue:
    'xpath=//div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " txt ") and normalize-space(.)="CPF:"]/following-sibling::div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " field ")][1]'
} as const

export const CPI_RESEARCH_PDF_UPLOAD_SELECTOR = '#MainPage_FileUpload1'

export const CPI_RESEARCH_RESULT_SELECTORS = {
  researcher: 'select[name="id_pesquisador"]',
  primaryResearcher: 'select[name="id_pesquisador_prim"]',
  status: 'select[name="id_pesq_status"]',
  save: 'form[name="form_cad"] a.button[onclick*="upd_pesq"]',
  labelFor: (resultId: string): string => 'label[for="' + resultId + '"]',
  selectedOption: (selector: string): string => selector + ' option:checked'
} as const

export const CPI_RESEARCH_RESULT_OPTIONS = {
  CONSTA_RESTRICAO: {
    selector: '#consta3',
    label: 'Sim, Consta Restrições'
  },
  HA_INFORMACOES: {
    selector: '#consta2',
    label: 'Há Informações'
  },
  NADA_CONSTA: {
    selector: '#consta1',
    label: 'Nada Consta'
  },
  INDEFINIDO: {
    selector: '#consta2',
    label: 'Há Informações'
  }
} as const satisfies Record<ResearchClassification, { selector: string; label: string }>
