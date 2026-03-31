import { localApi } from './api'

export async function readLocalMentionFile(filePath: string): Promise<string> {
  // const electronReadFile = window.electronAPI?.fs?.readFile

  // if (electronReadFile) {
  //   const result = await electronReadFile(filePath, 'utf8')

  //   if (typeof result === 'string') {
  //     return result
  //   }

  //   if (result?.success) {
  //     return typeof result.content === 'string' ? result.content : ''
  //   }

  //   throw new Error(result?.error || `Failed to read file: ${filePath}`)
  // }

  const params = new URLSearchParams({ path: filePath })
  const response = await localApi.get<{ content?: string }>(`/local/file-content?${params}`)
  return typeof response?.content === 'string' ? response.content : ''
}
