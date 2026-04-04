export const OPEN_WORKSPACE_MUTATION_DIFFS_EVENT = 'ygg-open-workspace-mutation-diffs'

export type OpenWorkspaceMutationDiffsDetail = {
  filePaths: string[]
  basePath?: string | null
  focusPath?: string | null
}

const normalizeMutationDiffPath = (value: string): string => value.trim()

export function dispatchOpenWorkspaceMutationDiffs(detail: OpenWorkspaceMutationDiffsDetail): void {
  if (typeof window === 'undefined') return

  const filePaths = Array.from(
    new Set((detail.filePaths || []).map(normalizeMutationDiffPath).filter(path => path.length > 0))
  )

  if (filePaths.length === 0) return

  window.dispatchEvent(
    new CustomEvent<OpenWorkspaceMutationDiffsDetail>(OPEN_WORKSPACE_MUTATION_DIFFS_EVENT, {
      detail: {
        ...detail,
        filePaths,
        basePath: typeof detail.basePath === 'string' && detail.basePath.trim().length > 0 ? detail.basePath : null,
        focusPath:
          typeof detail.focusPath === 'string' && detail.focusPath.trim().length > 0 ? detail.focusPath.trim() : null,
      },
    })
  )
}
