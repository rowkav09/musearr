export function MusearrMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Musearr">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {!compact && <span className="brand-wordmark">Musearr</span>}
    </div>
  )
}
