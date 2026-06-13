import { observer } from "mobx-react-lite";
import { presentationStore } from "../stores/PresentationStore";

function CollaborativeCursorsInternal(): React.ReactElement | null {
	const { remoteCursors, currentSlide, zoomLevel } = presentationStore;

	if (remoteCursors.size === 0) return null;

	return (
		<>
			{Array.from(remoteCursors.entries())
				.filter(([_, data]) => data.page === currentSlide)
				.map(([userId, data]) => {
					const scale = zoomLevel / 100;
					const left = data.x * scale;
					const top = data.y * scale;

					return (
						<div
							key={userId}
							className="prese-collab-cursor"
							style={{
								position: "absolute",
								left: `${left}px`,
								top: `${top}px`,
								pointerEvents: "none",
								zIndex: 9999,
							}}
						>
							<svg
								width="14"
								height="20"
								viewBox="0 0 14 20"
								role="img"
								aria-label={`Cursor for ${data.username}`}
							>
								<title>{data.username}</title>
								<path d="M0 0L14 12L9 12L6 20L0 0Z" fill={data.color} />
							</svg>
							<div
								className="prese-collab-cursor-label"
								style={{
									marginLeft: "12px",
									marginTop: "-4px",
									padding: "2px 6px",
									background: data.color,
									color: "white",
									fontSize: "10px",
									borderRadius: "3px",
									whiteSpace: "nowrap",
								}}
							>
								{data.username}
							</div>
						</div>
					);
				})}
		</>
	);
}

export const CollaborativeCursors = observer(CollaborativeCursorsInternal);
