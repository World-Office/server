interface StatusBarProps {
  zoom?: number
  page?: number
  pageCount?: number
}

export function StatusBar({ zoom = 100, page, pageCount }: StatusBarProps) {
  return (
    <output className="statusbar-container" aria-live="polite" aria-atomic="true">
      <div className="statusbar-left">
        {page !== undefined && pageCount !== undefined && (
          <span aria-label={`Page ${page} of ${pageCount}`}>
            Page {page} of {pageCount}
          </span>
        )}
      </div>
      <div className="statusbar-right">
        <span aria-label={`Zoom ${zoom} percent`}>{zoom}%</span>
      </div>
    </output>
  )
}
