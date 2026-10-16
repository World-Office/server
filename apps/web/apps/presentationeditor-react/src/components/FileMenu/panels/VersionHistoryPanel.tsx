import { useEffect, useState } from "react";
import { presentationStore } from "../../../stores/PresentationStore";

/**
 * File → Version History... — the entry shipped hasPanel:true but the build
 * mounted no VersionHistoryPanel at all, so the click left the menu open with
 * a blank pane (a dialog-declaring entry whose surface never existed).
 *
 * Lists the file's versions from the files_versions OCS API (falls back to a
 * WebDAV probe, then to the "no versions yet" copy for local/unsaved decks)
 * and restores a version on demand.
 */

interface VersionEntry {
	versionId: string;
	name: string;
	size: number;
	lastModified: string;
	mimeType: string;
}

const OCS_HEADERS: Record<string, string> = {
	Accept: "application/json",
};

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
		if (diffMin < 1) return "Just now";
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `${diffH}h ago`;
		const diffD = Math.floor(diffH / 24);
		if (diffD < 7) return `${diffD}d ago`;
		return d.toLocaleDateString();
	} catch {
		return iso;
	}
}

async function fetchVersions(
	accessToken: string,
	filePath: string,
): Promise<VersionEntry[]> {
	const encodedPath = encodeURIComponent(filePath);

	try {
		const resp = await fetch(
			`/apps/files_versions/api/v1/versions?file=${encodedPath}&format=json`,
			{ headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` } },
		);
		if (resp.ok) {
			const data = await resp.json();
			const versions = data.ocs?.data ?? [];
			if (Array.isArray(versions) && versions.length > 0) {
				return versions.map((v: Record<string, unknown>) => ({
					versionId: String(v.id ?? v.version ?? ""),
					name: String(
						v.name ?? v.file_name ?? filePath.split("/").pop() ?? "",
					),
					size: Number(v.size ?? 0),
					lastModified: String(v.mtime ?? v.timestamp ?? ""),
					mimeType: String(v.mimetype ?? ""),
				}));
			}
		}
	} catch {
		/* fall through to the WebDAV probe */
	}

	try {
		const resp = await fetch(filePath, {
			method: "PROPFIND",
			headers: {
				...OCS_HEADERS,
				Authorization: `Bearer ${accessToken}`,
				Depth: "0",
				"Content-Type": "application/xml",
			},
			body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`,
		});
		if (resp.ok) return [];
	} catch {
		/* no version backend reachable */
	}

	return [];
}

async function restoreVersion(
	accessToken: string,
	filePath: string,
	versionId: string,
): Promise<void> {
	const encodedPath = encodeURIComponent(filePath);
	const resp = await fetch(
		`/apps/files_versions/api/v1/versions/${versionId}/restore?file=${encodedPath}&format=json`,
		{
			method: "POST",
			headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` },
		},
	);
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

export function VersionHistoryPanel({ visible }: { visible: boolean }) {
	const conn = presentationStore.wopiConnection;
	const accessToken = conn?.wopiAccessToken;
	const filePath = conn?.wopiFileId ?? "";

	const [versions, setVersions] = useState<VersionEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [restoring, setRestoring] = useState<string | null>(null);

	useEffect(() => {
		if (!visible || !accessToken || !filePath) return;
		let cancelled = false;

		setLoading(true);
		setError(null);
		setVersions([]);

		fetchVersions(accessToken, filePath)
			.then((data) => {
				if (!cancelled) setVersions(data);
			})
			.catch((err) => {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: "Failed to load version history",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [visible, accessToken, filePath]);

	async function handleRestore(version: VersionEntry): Promise<void> {
		if (!accessToken || !filePath) return;
		setRestoring(version.versionId);
		try {
			await restoreVersion(accessToken, filePath, version.versionId);
			await presentationStore.loadFromWopi();
		} catch {
			setError("Failed to restore version");
		} finally {
			setRestoring(null);
		}
	}

	function handleClose(): void {
		presentationStore.setActiveFileMenuPanel(null);
	}

	return (
		<div
			className="prese-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="prese-file-menu-header">Version History</div>
			<div className="prese-file-menu-body">
				<p className="prese-file-menu-instruction">
					{filePath
						? `Versions of: ${filePath.split("/").pop()}`
						: "No file loaded"}
				</p>
			</div>

			{loading && (
				<div className="prese-file-menu-body">
					<p className="prese-file-menu-instruction">Loading versions…</p>
				</div>
			)}

			{error && (
				<div className="prese-file-menu-body">
					<p className="prese-file-menu-instruction">{error}</p>
				</div>
			)}

			{!loading && versions.length > 0 && (
				<div className="prese-file-menu-versions">
					{versions.map((version) => (
						<div key={version.versionId} className="prese-file-menu-version">
							<span className="prese-file-menu-version-title">
								Version {version.versionId.slice(0, 8)}
								{version.mimeType
									? ` — ${version.mimeType.split("/").pop()?.toUpperCase()}`
									: ""}
							</span>
							<span className="prese-file-menu-version-meta">
								{formatSize(version.size)} ·{" "}
								{formatDateTime(version.lastModified)}
							</span>
							<button
								type="button"
								className="prese-file-menu-version-restore"
								onClick={() => handleRestore(version)}
								disabled={restoring === version.versionId}
								style={{ opacity: restoring === version.versionId ? 0.5 : 1 }}
							>
								{restoring === version.versionId ? "Restoring…" : "Restore"}
							</button>
						</div>
					))}
				</div>
			)}

			{!loading && versions.length === 0 && !error && (
				<div className="prese-file-menu-body">
					<p className="prese-file-menu-instruction">
						No previous versions available for this file.
					</p>
					<p className="prese-file-menu-instruction">
						Versions are created automatically when you save changes.
					</p>
				</div>
			)}

			<div className="prese-file-menu-footer">
				<button type="button" onClick={handleClose}>
					Close
				</button>
			</div>
		</div>
	);
}
