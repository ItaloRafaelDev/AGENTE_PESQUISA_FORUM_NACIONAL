export const RESEARCH_HISTORY_SCHEMA_VERSION = 1 as const

export const RESEARCH_HISTORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS research_history (
    id TEXT PRIMARY KEY,
    masked_cpf TEXT NOT NULL,
    classification TEXT,
    cpi_result TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    pdf_path TEXT,
    error_stage TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_research_history_started_at
  ON research_history(started_at DESC);

  CREATE INDEX IF NOT EXISTS idx_research_history_status
  ON research_history(status);

  CREATE INDEX IF NOT EXISTS idx_research_history_classification
  ON research_history(classification);
`

export const REQUIRED_RESEARCH_HISTORY_COLUMNS = [
  'id',
  'masked_cpf',
  'classification',
  'cpi_result',
  'status',
  'started_at',
  'finished_at',
  'duration_ms',
  'pdf_path',
  'error_stage',
  'error_message',
  'created_at'
] as const

export const REQUIRED_RESEARCH_HISTORY_INDEXES = [
  'idx_research_history_started_at',
  'idx_research_history_status',
  'idx_research_history_classification'
] as const

export const REQUIRED_RESEARCH_HISTORY_COLUMN_METADATA = {
  id: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 1
  },
  masked_cpf: {
    type: 'TEXT',
    notNull: true,
    primaryKeyPosition: 0
  },
  classification: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  cpi_result: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  status: {
    type: 'TEXT',
    notNull: true,
    primaryKeyPosition: 0
  },
  started_at: {
    type: 'TEXT',
    notNull: true,
    primaryKeyPosition: 0
  },
  finished_at: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  duration_ms: {
    type: 'INTEGER',
    notNull: false,
    primaryKeyPosition: 0
  },
  pdf_path: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  error_stage: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  error_message: {
    type: 'TEXT',
    notNull: false,
    primaryKeyPosition: 0
  },
  created_at: {
    type: 'TEXT',
    notNull: true,
    primaryKeyPosition: 0
  }
} as const

export const REQUIRED_RESEARCH_HISTORY_INDEX_METADATA = {
  idx_research_history_started_at: {
    column: 'started_at',
    descending: true
  },
  idx_research_history_status: {
    column: 'status',
    descending: false
  },
  idx_research_history_classification: {
    column: 'classification',
    descending: false
  }
} as const
