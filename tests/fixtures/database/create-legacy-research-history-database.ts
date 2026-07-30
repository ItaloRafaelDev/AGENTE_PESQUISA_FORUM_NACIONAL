import Database from 'better-sqlite3'

export function createLegacyResearchHistoryDatabase(filePath: string): void {
  const database = new Database(filePath)

  try {
    database.exec(`
      CREATE TABLE research_history (
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

      CREATE INDEX idx_research_history_started_at
      ON research_history(started_at DESC);

      CREATE INDEX idx_research_history_status
      ON research_history(status);

      CREATE INDEX idx_research_history_classification
      ON research_history(classification);
    `)

    database
      .prepare(
        `
        INSERT INTO research_history (
          id,
          masked_cpf,
          classification,
          cpi_result,
          status,
          started_at,
          finished_at,
          duration_ms,
          pdf_path,
          error_stage,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
      `
      )
      .run(
        'legacy-record-1',
        '***.***.***-44',
        'CONSTA_RESTRICAO',
        'Sim, Consta Restrições',
        'CONCLUIDO',
        '2026-07-14T10:00:00.000Z',
        '2026-07-14T10:01:30.000Z',
        90_000,
        'E:\\PDF-AGENTE-CPI\\legado.pdf',
        '2026-07-14T10:00:00.000Z'
      )
  } finally {
    database.close()
  }
}
