import { ResearchHistoryTable } from '../features/history/ResearchHistoryTable'
import { useResearchHistory } from '../features/history/use-research-history'

export default function ResearchHistoryPanel(): React.JSX.Element {
  const history = useResearchHistory()
  const { records, loading, busy, feedback } = history

  return (
    <section className="activity-panel history-panel" aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <span className="panel-label">Persistência</span>

          <h2 id="history-title">Histórico de pesquisas</h2>
        </div>

        <button
          className="button secondary"
          type="button"
          disabled={busy || loading || records.length === 0}
          onClick={() => void history.clearHistory()}
        >
          Limpar histórico
        </button>
      </div>

      {feedback ? (
        <p className="history-feedback" aria-live="polite">
          {feedback}
        </p>
      ) : null}

      {loading ? (
        <p className="empty-state">Carregando histórico...</p>
      ) : records.length === 0 ? (
        <p className="empty-state">Nenhuma pesquisa registrada.</p>
      ) : (
        <ResearchHistoryTable
          records={records}
          busy={busy}
          onOpenPdf={(pdfPath) => void history.openPdf(pdfPath)}
          onRevealPdf={(pdfPath) => void history.revealPdf(pdfPath)}
        />
      )}
    </section>
  )
}
