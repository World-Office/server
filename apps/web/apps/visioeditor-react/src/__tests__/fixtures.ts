import type { VisioMode } from "../types/visio";

/** A minimal, complete VisioMode for store/component tests. */
export function makeVisioMode(gobackUrl?: string): VisioMode {
	return {
		editorType: "visio",
		documentId: "doc-1",
		permissions: {
			canEdit: true,
			canDownload: true,
			canPrint: true,
			canComment: false,
			canReview: false,
			canCopy: true,
			canProtect: false,
		},
		locale: "en",
		theme: "light",
		customizationOptions: {},
		isEdit: true,
		isDisconnected: false,
		canCoAuthoring: false,
		canChat: false,
		canDownload: true,
		canPrint: true,
		canPreviewPrint: true,
		canRename: true,
		canBack: true,
		canHelp: true,
		canSuggest: false,
		canOpenRecent: false,
		canCreateNew: true,
		canCloseEditor: true,
		canBrandingExt: false,
		enableDownload: true,
		isDesktopApp: false,
		isOffline: false,
		compactview: false,
		customization: gobackUrl ? { goback: { url: gobackUrl } } : {},
	};
}
