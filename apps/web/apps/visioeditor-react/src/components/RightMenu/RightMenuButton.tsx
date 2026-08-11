import type { JSX } from "react";

interface RightMenuButtonProps {
	action: string;
	title: string;
	icon: string;
	active: boolean;
	onClick: () => void;
}

export function RightMenuButton({
	action,
	title,
	icon,
	active,
	onClick,
}: RightMenuButtonProps): JSX.Element {
	const svg = getSvg(icon);
	return (
		<button
			key={action}
			type="button"
			className={`vi-right-menu-btn${active ? " active" : ""}`}
			title={title}
			onClick={onClick}
			style={{
				width: 40,
				height: 40,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				border: "none",
				background: active ? "#e8f0fe" : "transparent",
				cursor: "pointer",
				borderRadius: 4,
				margin: "2px 0",
				position: "relative",
				fontSize: 18,
			}}
		>
			{svg || <span>{icon}</span>}
		</button>
	);
}

function getSvg(icon: string): JSX.Element | null {
	const size = { width: 18, height: 18 };
	const svgs: Record<string, JSX.Element> = {
		Shapes: (
			<svg
				{...size}
				aria-label="Shapes"
				role="img"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M12 2l4 8H8z" />
				<rect x="3" y="14" width="6" height="6" rx="1" />
				<rect x="15" y="14" width="6" height="6" rx="1" />
			</svg>
		),
		Connector: (
			<svg
				{...size}
				aria-label="Connector"
				role="img"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<line x1="5" y1="19" x2="19" y2="5" />
				<polyline points="14 5 19 5 19 10" />
			</svg>
		),
		Layers: (
			<svg
				{...size}
				aria-label="Layers"
				role="img"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<rect x="2" y="4" width="20" height="4" rx="1" />
				<rect x="4" y="10" width="16" height="4" rx="1" />
				<rect x="6" y="16" width="12" height="4" rx="1" />
			</svg>
		),
		Info: (
			<svg
				{...size}
				aria-label="Info"
				role="img"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="16" x2="12" y2="12" />
				<line x1="12" y1="8" x2="12.01" y2="8" />
			</svg>
		),
	};
	return svgs[icon] || null;
}
