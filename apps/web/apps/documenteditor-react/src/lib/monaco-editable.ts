/**
 * Resolve Monaco editability. Explicit `isEditable` wins; otherwise
 * presentation/pdf editors default to read-only (preserves the
 * constructor-only default from before the FE-1 dynamic-readOnly migration).
 */
export function resolveMonacoEditable(
  isEditable: boolean | undefined,
  editorType: string | undefined,
): boolean {
  return isEditable ?? (editorType !== "presentation" && editorType !== "pdf")
}
