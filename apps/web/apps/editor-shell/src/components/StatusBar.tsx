interface StatusBarProps {
  zoom?: number
  page?: number
  pageCount?: number
}

export function StatusBar({ zoom = 100, page, pageCount }: StatusBarProps) {
  return (
    <output className="statusbar-container">
      <div className="statusbar-left">
        {page !== undefined && pageCount !== undefined && (
          <span>
            Page {page} of {pageCount}
          </span>
        )}
      </div>
      <div className="statusbar-right">
        <span>{zoom}%</span>
      </div>
    </output>
  )
}
