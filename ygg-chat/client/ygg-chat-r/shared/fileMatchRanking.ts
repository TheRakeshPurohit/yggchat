export type FileMatchKind = 'file' | 'folder'

export interface FileMatchCandidate {
  kind?: FileMatchKind
  isDirectory?: boolean
  name?: string
  relativePath?: string
  relativeDirectoryPath?: string
  path?: string
}

export interface RankedFileMatch<T extends FileMatchCandidate> {
  item: T
  score: number
}

type PreparedQuery = {
  raw: string
  normalized: string
  compact: string
  segments: string[]
}

const EXACT_FILE_NAME_SCORE = 0
const EXACT_FILE_PATH_SCORE = 100
const EXACT_DIRECTORY_SCORE = 200
const FILE_NAME_PREFIX_SCORE = 300
const DIRECTORY_NAME_PREFIX_SCORE = 400
const FILE_NAME_CONTAINS_SCORE = 500
const DIRECTORY_NAME_CONTAINS_SCORE = 600
const FILE_SEGMENT_PREFIX_SCORE = 700
const DIRECTORY_SEGMENT_PREFIX_SCORE = 800
const FILE_PATH_CONTAINS_SCORE = 900
const DIRECTORY_PATH_CONTAINS_SCORE = 1000
const ABSOLUTE_PATH_CONTAINS_SCORE = 1200

const normalizeSlashes = (value: string): string => value.replace(/\\/g, '/')

export const normalizeFileMatchText = (value: string | null | undefined): string => normalizeSlashes(String(value || '')).toLowerCase()

export const basenameForFileMatch = (value: string | null | undefined): string => {
  const normalized = normalizeSlashes(String(value || ''))
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

const prepareQuery = (query: string | null | undefined): PreparedQuery | null => {
  const raw = String(query || '').trim().replace(/^@+/, '')
  const normalized = normalizeFileMatchText(raw).replace(/^\/+/, '')
  if (!normalized) return null

  return {
    raw,
    normalized,
    compact: normalized.replace(/[\s_\-.]+/g, ''),
    segments: normalized.split('/').filter(Boolean),
  }
}

const candidateKind = (candidate: FileMatchCandidate): FileMatchKind =>
  candidate.kind === 'folder' || candidate.isDirectory ? 'folder' : 'file'

const compact = (value: string): string => value.replace(/[\s_\-.]+/g, '')

const segmentPrefixIndex = (pathValue: string, query: string): number => {
  const segments = pathValue.split('/').filter(Boolean)
  return segments.findIndex(segment => segment.startsWith(query))
}

const firstPositiveIndex = (value: string, query: string): number => {
  const index = value.indexOf(query)
  return index < 0 ? Number.POSITIVE_INFINITY : index
}

const withLengthBias = (base: number, primary: string, query: string, extra = 0): number =>
  base * 100000 + Math.max(0, primary.length - query.length) * 100 + extra

export const getFileMatchScore = (candidate: FileMatchCandidate, query: string | null | undefined): number | null => {
  const prepared = prepareQuery(query)
  if (!prepared) return 0

  const kind = candidateKind(candidate)
  const isFile = kind === 'file'
  const name = normalizeFileMatchText(candidate.name || basenameForFileMatch(candidate.relativePath || candidate.path))
  const relativePath = normalizeFileMatchText(candidate.relativePath || candidate.name || basenameForFileMatch(candidate.path))
  const relativeDirectoryPath = normalizeFileMatchText(candidate.relativeDirectoryPath || '')
  const absolutePath = normalizeFileMatchText(candidate.path || '')
  const q = prepared.normalized

  const nameCompact = compact(name)
  const qCompact = prepared.compact
  const relativePathCompact = compact(relativePath)

  if (isFile && name === q) return withLengthBias(EXACT_FILE_NAME_SCORE, name, q)
  if (isFile && relativePath === q) return withLengthBias(EXACT_FILE_PATH_SCORE, relativePath, q)
  if (!isFile && (name === q || relativePath === q)) return withLengthBias(EXACT_DIRECTORY_SCORE, relativePath, q)

  if (isFile && name.startsWith(q)) return withLengthBias(FILE_NAME_PREFIX_SCORE, name, q)
  if (!isFile && (name.startsWith(q) || relativePath.startsWith(q))) {
    return withLengthBias(DIRECTORY_NAME_PREFIX_SCORE, name.startsWith(q) ? name : relativePath, q)
  }

  if (isFile && name.includes(q)) return withLengthBias(FILE_NAME_CONTAINS_SCORE, name, q, firstPositiveIndex(name, q))
  if (!isFile && (name.includes(q) || relativePath.includes(q))) {
    const primary = name.includes(q) ? name : relativePath
    return withLengthBias(DIRECTORY_NAME_CONTAINS_SCORE, primary, q, firstPositiveIndex(primary, q))
  }

  const fileSegmentIndex = segmentPrefixIndex(relativePath, q)
  if (isFile && fileSegmentIndex >= 0) return withLengthBias(FILE_SEGMENT_PREFIX_SCORE, relativePath, q, fileSegmentIndex)

  const directorySegmentIndex = segmentPrefixIndex(relativePath, q)
  if (!isFile && directorySegmentIndex >= 0) {
    return withLengthBias(DIRECTORY_SEGMENT_PREFIX_SCORE, relativePath, q, directorySegmentIndex)
  }

  if (isFile && relativePath.includes(q)) {
    return withLengthBias(FILE_PATH_CONTAINS_SCORE, relativePath, q, firstPositiveIndex(relativePath, q))
  }
  if (!isFile && (relativePath.includes(q) || relativeDirectoryPath.includes(q))) {
    const primary = relativePath.includes(q) ? relativePath : relativeDirectoryPath
    return withLengthBias(DIRECTORY_PATH_CONTAINS_SCORE, primary, q, firstPositiveIndex(primary, q))
  }

  // Typing punctuation inconsistently should still behave reasonably: e.g. "inputtextarea" matches
  // "InputTextArea.tsx", but only after direct filename/path matches.
  if (qCompact && isFile && (nameCompact.includes(qCompact) || relativePathCompact.includes(qCompact))) {
    const primary = nameCompact.includes(qCompact) ? nameCompact : relativePathCompact
    return withLengthBias(FILE_PATH_CONTAINS_SCORE + 50, primary, qCompact, firstPositiveIndex(primary, qCompact))
  }
  if (qCompact && !isFile && relativePathCompact.includes(qCompact)) {
    return withLengthBias(DIRECTORY_PATH_CONTAINS_SCORE + 50, relativePathCompact, qCompact, firstPositiveIndex(relativePathCompact, qCompact))
  }

  if (absolutePath.includes(q)) {
    return withLengthBias(ABSOLUTE_PATH_CONTAINS_SCORE, absolutePath, q, firstPositiveIndex(absolutePath, q))
  }

  return null
}

export const compareFileMatchCandidates = <T extends FileMatchCandidate>(a: RankedFileMatch<T>, b: RankedFileMatch<T>): number => {
  if (a.score !== b.score) return a.score - b.score

  const aKind = candidateKind(a.item)
  const bKind = candidateKind(b.item)
  if (aKind !== bKind) return aKind === 'file' ? -1 : 1

  const aRelativePath = normalizeFileMatchText(a.item.relativePath || a.item.path || a.item.name)
  const bRelativePath = normalizeFileMatchText(b.item.relativePath || b.item.path || b.item.name)
  if (aRelativePath.length !== bRelativePath.length) return aRelativePath.length - bRelativePath.length

  return aRelativePath.localeCompare(bRelativePath, undefined, { sensitivity: 'base' })
}

export const rankFileMatches = <T extends FileMatchCandidate>(items: readonly T[], query: string | null | undefined): T[] => {
  const prepared = prepareQuery(query)
  if (!prepared) {
    return [...items]
  }

  return items
    .map(item => {
      const score = getFileMatchScore(item, prepared.raw)
      return score == null ? null : { item, score }
    })
    .filter((entry): entry is RankedFileMatch<T> => entry != null)
    .sort(compareFileMatchCandidates)
    .map(entry => entry.item)
}

export const addFileMentionLookupKeys = (keys: Map<string, string>, mention: string | null | undefined, pathValue: string): void => {
  const raw = String(mention || '').trim()
  if (!raw) return
  if (!keys.has(raw)) keys.set(raw, pathValue)

  const normalized = normalizeSlashes(raw)
  if (normalized && !keys.has(normalized)) keys.set(normalized, pathValue)

  const withoutAt = normalized.replace(/^@+/, '')
  if (withoutAt && !keys.has(withoutAt)) keys.set(withoutAt, pathValue)
}
