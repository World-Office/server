export function SaveAsPanel({ visible }: { visible: boolean }) {
  const formats = ["VSDX", "PDF", "PDF/A", "PNG", "JPG"]

  return (
    <div
      className="visio-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="visio-file-menu-header">Download as</div>
      <div className="visio-file-menu-saveas-formats">
        {formats.map((format) => (
          <button key={format} type="button" className="visio-file-menu-format-btn">
            <div className="visio-file-menu-format-icon">
              <span>{format}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
