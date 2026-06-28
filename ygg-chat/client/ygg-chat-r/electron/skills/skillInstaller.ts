// electron/skills/skillInstaller.ts
// Install skills from GitHub, ClawdHub, or local folders

import AdmZip from 'adm-zip'
import fs from 'fs/promises'
import path from 'path'
import yaml from 'yaml'
import { skillRegistry } from './skillLoader.js'

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
  url: string // API URL for directories
  html_url?: string
}

export interface SkillInstallCandidate {
  name: string
  path: string
  url: string
  contents?: GitHubContent[]
}

interface GitHubSourceParts {
  owner: string
  repo: string
  path: string
  ref?: string
}

export interface InstallResult {
  success: boolean
  skillName?: string
  skillNames?: string[]
  error?: string
  code?: 'MULTIPLE_SKILLS_FOUND' | 'NO_SKILLS_FOUND' | 'INVALID_SOURCE' | 'INSTALL_FAILED'
  candidates?: SkillInstallCandidate[]
}

interface CatalogSkill {
  name: string
  description: string
  path: string // Path within repo (e.g., "skills/code-review")
}

const GITHUB_API_BASE = 'https://api.github.com'
const USER_AGENT = 'ygg-chat-electron'
const GITHUB_API_MIN_INTERVAL_MS = process.env.VITEST ? 0 : 750

let lastGitHubApiRequestAt = 0

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForGitHubApiSlot(): Promise<void> {
  const now = Date.now()
  const waitMs = Math.max(0, lastGitHubApiRequestAt + GITHUB_API_MIN_INTERVAL_MS - now)
  if (waitMs > 0) {
    await delay(waitMs)
  }
  lastGitHubApiRequestAt = Date.now()
}

/**
 * Fetch JSON from GitHub API
 */
async function fetchGitHubAPI(url: string): Promise<any> {
  await waitForGitHubApiSlot()

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository or path not found')
    }
    if (response.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Try again later.')
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`)
  }

  return response.text()
}

/**
 * Recursively download directory contents from GitHub
 */
async function downloadDirectory(
  contents: GitHubContent[],
  targetDir: string,
  preloadedDirectories: Map<string, GitHubContent[]> = new Map()
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  for (const item of contents) {
    const targetPath = path.join(targetDir, item.name)

    if (item.type === 'file' && item.download_url) {
      const content = await downloadFile(item.download_url)
      await fs.writeFile(targetPath, content, 'utf-8')
    } else if (item.type === 'dir') {
      // Fetch subdirectory contents, reusing already discovered directories when available.
      const subContents = preloadedDirectories.get(item.path) || (await fetchGitHubAPI(item.url))
      await downloadDirectory(subContents, targetPath, preloadedDirectories)
    }
  }
}

/**
 * Parse GitHub source string
 * Formats:
 *   - "owner/repo" -> entire repo
 *   - "owner/repo/path/to/skill" -> specific path
 *   - "https://github.com/owner/repo" -> entire repo
 *   - "https://github.com/owner/repo/tree/main/path" -> specific path
 */
function buildGitHubContentsUrl(owner: string, repo: string, repoPath: string, ref?: string): string {
  const encodedPath = repoPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return withGitHubRef(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}`, ref)
}

function withGitHubRef(url: string, ref?: string): string {
  if (!ref) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}ref=${encodeURIComponent(ref)}`
}

function buildGitHubTreeUrl(owner: string, repo: string, ref: string | undefined, repoPath: string): string {
  const encodedPath = repoPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(ref || 'main')}/${encodedPath}`
}

function containsSkillMd(contents: GitHubContent[]): boolean {
  return contents.some((item: GitHubContent) => item.name === 'SKILL.md' && item.type === 'file')
}

async function findDirectSkillCandidates(
  owner: string,
  repo: string,
  contents: GitHubContent[],
  ref?: string
): Promise<SkillInstallCandidate[]> {
  const directories = contents.filter((item: GitHubContent) => item.type === 'dir')
  const candidates: SkillInstallCandidate[] = []

  for (const directory of directories) {
    try {
      const directoryContents = await fetchGitHubAPI(withGitHubRef(directory.url, ref))
      if (Array.isArray(directoryContents) && containsSkillMd(directoryContents)) {
        candidates.push({
          name: directory.name,
          path: directory.path,
          url: directory.html_url || buildGitHubTreeUrl(owner, repo, ref, directory.path),
          contents: directoryContents,
        })
      }
    } catch {
      // Ignore unreadable child directories; they are simply not installable skills.
    }
  }

  return candidates
}

function multipleSkillsFound(candidates: SkillInstallCandidate[]): InstallResult {
  const names = candidates.map(candidate => candidate.name).join(', ')
  const urls = candidates.map(candidate => candidate.url).join(', ')
  return {
    success: false,
    code: 'MULTIPLE_SKILLS_FOUND',
    candidates: candidates.map(({ contents: _contents, ...candidate }) => candidate),
    error: `Multiple skills found: ${names}. Paste one of these specific skill URLs to install it: ${urls}`,
  }
}

async function discoverGitHubSkills(parts: GitHubSourceParts): Promise<{
  contents: GitHubContent[]
  isSingleSkill: boolean
  candidates: SkillInstallCandidate[]
}> {
  const { owner, repo, path: repoPath, ref } = parts
  const contents = await fetchGitHubAPI(buildGitHubContentsUrl(owner, repo, repoPath, ref))

  if (!Array.isArray(contents)) {
    return { contents: [], isSingleSkill: false, candidates: [] }
  }

  if (containsSkillMd(contents)) {
    return { contents, isSingleSkill: true, candidates: [] }
  }

  let candidates = await findDirectSkillCandidates(owner, repo, contents, ref)
  const skillsDir = contents.find((item: GitHubContent) => item.type === 'dir' && item.name === 'skills')
  if (repoPath === '' && candidates.length === 0 && skillsDir) {
    const skillsContents = await fetchGitHubAPI(withGitHubRef(skillsDir.url, ref))
    if (Array.isArray(skillsContents)) {
      candidates = await findDirectSkillCandidates(owner, repo, skillsContents, ref)
    }
  }

  return { contents, isSingleSkill: false, candidates }
}

function parseGitHubSource(source: string): GitHubSourceParts {
  // Handle full URLs
  if (source.startsWith('https://github.com/')) {
    const url = new URL(source)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

    const owner = parts[0]
    const repo = parts[1]

    if (!owner || !repo) {
      throw new Error('Invalid GitHub URL. Expected https://github.com/owner/repo')
    }

    // Check for /tree/branch/path or /blob/branch/path format
    if ((parts[2] === 'tree' || parts[2] === 'blob') && parts.length > 3) {
      const ref = parts[3]
      const pathParts = parts.slice(4)
      return { owner, repo, path: pathParts.join('/'), ref }
    }

    return { owner, repo, path: '' }
  }

  // Handle shorthand format: owner/repo or owner/repo/path
  const parts = source.split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new Error('Invalid source format. Use "owner/repo" or "owner/repo/path"')
  }

  const [owner, repo, ...pathParts] = parts
  return { owner, repo, path: pathParts.join('/') }
}

/**
 * Validate that a directory contains a valid SKILL.md
 */
async function validateSkillDirectory(dirPath: string): Promise<{ valid: boolean; name?: string; error?: string }> {
  const skillMdPath = path.join(dirPath, 'SKILL.md')

  try {
    const content = await fs.readFile(skillMdPath, 'utf-8')

    // Check for frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) {
      return { valid: false, error: 'SKILL.md missing YAML frontmatter' }
    }

    // Parse frontmatter to get name
    const frontmatter = yaml.parse(match[1])

    if (!frontmatter.name) {
      return { valid: false, error: 'SKILL.md missing required "name" field' }
    }

    if (!frontmatter.description) {
      return { valid: false, error: 'SKILL.md missing required "description" field' }
    }

    return { valid: true, name: frontmatter.name }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { valid: false, error: 'No SKILL.md found in directory' }
    }
    return { valid: false, error: `Failed to read SKILL.md: ${error}` }
  }
}

/**
 * Install a skill from GitHub
 */
export async function installFromGitHub(source: string): Promise<InstallResult> {
  try {
    const parts = parseGitHubSource(source)
    const { repo, path: repoPath, ref } = parts
    const discovery = await discoverGitHubSkills(parts)

    if (discovery.isSingleSkill) {
      return await installSingleSkill(discovery.contents, source, repoPath.split('/').pop() || repo)
    }

    if (discovery.candidates.length === 1) {
      return installFromGitHub(buildGitHubTreeUrl(parts.owner, repo, ref, discovery.candidates[0].path))
    }

    if (discovery.candidates.length > 1) {
      return multipleSkillsFound(discovery.candidates)
    }

    return {
      success: false,
      code: 'NO_SKILLS_FOUND',
      error:
        'No skills found at this location. GitHub skills must be folders containing SKILL.md, for example https://github.com/owner/repo/tree/main/skills/skill-name',
    }
  } catch (error) {
    return {
      success: false,
      code: 'INSTALL_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function installAllFromGitHub(source: string): Promise<InstallResult> {
  try {
    const parts = parseGitHubSource(source)
    const discovery = await discoverGitHubSkills(parts)

    if (discovery.isSingleSkill) {
      return installSingleSkill(discovery.contents, source, parts.path.split('/').pop() || parts.repo)
    }

    if (discovery.candidates.length === 0) {
      return {
        success: false,
        code: 'NO_SKILLS_FOUND',
        error: 'No skills found to install from this GitHub location',
      }
    }

    return installSkillGroupFromGitHub(parts, source, discovery.candidates)
  } catch (error) {
    return {
      success: false,
      code: 'INSTALL_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Install a single skill from GitHub contents
 */
async function installSkillGroupFromGitHub(
  parts: GitHubSourceParts,
  source: string,
  candidates: SkillInstallCandidate[]
): Promise<InstallResult> {
  const skillsDir = skillRegistry.getSkillsDirectory()
  const groupName = parts.repo
  const targetDir = path.join(skillsDir, groupName)
  const tempDir = path.join(skillsDir, `.installing-${groupName}-${Date.now()}`)
  const installedSkillNames: string[] = []

  try {
    if (await directoryExists(targetDir)) {
      return { success: false, error: `Skill group "${groupName}" is already installed` }
    }

    await fs.mkdir(tempDir, { recursive: true })

    for (const candidate of candidates) {
      const contents =
        candidate.contents || (await fetchGitHubAPI(buildGitHubContentsUrl(parts.owner, parts.repo, candidate.path, parts.ref)))
      if (!Array.isArray(contents) || !containsSkillMd(contents)) {
        throw new Error(`GitHub skill candidate "${candidate.name}" no longer contains SKILL.md`)
      }

      const skillTempDir = path.join(tempDir, candidate.name)
      await downloadDirectory(contents, skillTempDir, new Map([[candidate.path, contents]]))

      const validation = await validateSkillDirectory(skillTempDir)
      if (!validation.valid) {
        throw new Error(`${candidate.name}: ${validation.error}`)
      }

      installedSkillNames.push(validation.name || candidate.name)
    }

    await fs.rename(tempDir, targetDir)

    const installedAt = new Date().toISOString()
    for (const skillName of installedSkillNames) {
      const metaPath = path.join(targetDir, skillName, '.skill-meta.json')
      const meta = {
        installedAt,
        installedFrom: `github-group:${source}`,
        enabled: true,
        group: groupName,
      }
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    }

    await skillRegistry.reload()

    return { success: true, skillName: groupName, skillNames: installedSkillNames }
  } catch (error) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {}

    return {
      success: false,
      code: 'INSTALL_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function installSingleSkill(
  contents: GitHubContent[],
  source: string,
  fallbackName: string
): Promise<InstallResult> {
  const skillsDir = skillRegistry.getSkillsDirectory()

  // Create temp directory
  const tempDir = path.join(skillsDir, `.installing-${Date.now()}`)

  try {
    // Download all files
    await downloadDirectory(contents, tempDir)

    // Validate
    const validation = await validateSkillDirectory(tempDir)
    if (!validation.valid) {
      await fs.rm(tempDir, { recursive: true, force: true })
      return { success: false, error: validation.error }
    }

    const skillName = validation.name || fallbackName
    const targetDir = path.join(skillsDir, skillName)

    // Check if already installed
    if (await directoryExists(targetDir)) {
      await fs.rm(tempDir, { recursive: true, force: true })
      return { success: false, error: `Skill "${skillName}" is already installed` }
    }

    // Move to final location
    await fs.rename(tempDir, targetDir)

    // Write metadata
    const metaPath = path.join(targetDir, '.skill-meta.json')
    const meta = {
      installedAt: new Date().toISOString(),
      installedFrom: `github:${source}`,
      enabled: true,
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

    // Reload registry
    await skillRegistry.reload()

    return { success: true, skillName }
  } catch (error) {
    // Cleanup on failure
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {}

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Install a skill from a local folder
 */
export async function installFromLocal(sourcePath: string): Promise<InstallResult> {
  try {
    // Validate source
    const validation = await validateSkillDirectory(sourcePath)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const skillName = validation.name!
    const skillsDir = skillRegistry.getSkillsDirectory()
    const targetDir = path.join(skillsDir, skillName)

    // Check if already installed
    if (await directoryExists(targetDir)) {
      return { success: false, error: `Skill "${skillName}" is already installed` }
    }

    // Copy directory
    await copyDirectory(sourcePath, targetDir)

    // Write metadata
    const metaPath = path.join(targetDir, '.skill-meta.json')
    const meta = {
      installedAt: new Date().toISOString(),
      installedFrom: 'local',
      enabled: true,
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

    // Reload registry
    await skillRegistry.reload()

    return { success: true, skillName }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Fetch catalog of available skills from anthropics/skills repo
 */
export async function fetchSkillsCatalog(): Promise<CatalogSkill[]> {
  try {
    // Fetch the skills directory from anthropics/skills
    const apiUrl = `${GITHUB_API_BASE}/repos/anthropics/skills/contents/skills`
    const contents = await fetchGitHubAPI(apiUrl)

    const skills: CatalogSkill[] = []

    for (const item of contents) {
      if (item.type !== 'dir') continue

      // Fetch SKILL.md to get description
      try {
        const skillMdUrl = `${GITHUB_API_BASE}/repos/anthropics/skills/contents/skills/${item.name}/SKILL.md`
        const skillMdMeta = await fetchGitHubAPI(skillMdUrl)

        if (skillMdMeta.download_url) {
          const content = await downloadFile(skillMdMeta.download_url)
          const match = content.match(/^---\n([\s\S]*?)\n---/)

          if (match) {
            const frontmatter = yaml.parse(match[1])

            skills.push({
              name: frontmatter.name || item.name,
              description: frontmatter.description || 'No description',
              path: `skills/${item.name}`,
            })
          }
        }
      } catch {
        // Skip skills that fail to parse
      }
    }

    return skills
  } catch (error) {
    console.error('[SkillInstaller] Failed to fetch catalog:', error)
    return []
  }
}

// ============================================================================
// ClawdHub Installation
// ============================================================================

const CLAWDHUB_DOWNLOAD_BASE = 'https://auth.clawdhub.com/api/v1/download'

/**
 * Parse ClawdHub page URL to extract slug
 * https://clawdhub.com/owner/slug -> slug
 */
function parseClawdHubUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/clawdhub\.com\/[^\/]+\/([^\/\?\#]+)/)
  return match ? match[1] : null
}

/**
 * Check if URL is a ClawdHub page URL
 */
export function isClawdHubUrl(url: string): boolean {
  return /^https?:\/\/clawdhub\.com\/[^\/]+\/[^\/]+/.test(url)
}

/**
 * Download a zip file from URL and return as Buffer
 */
async function downloadZipFile(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Failed to download zip: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Install a skill from a zip URL (generic)
 */
export async function installFromZipUrl(zipUrl: string, sourceLabel: string): Promise<InstallResult> {
  const skillsDir = skillRegistry.getSkillsDirectory()
  const tempDir = path.join(skillsDir, `.installing-zip-${Date.now()}`)

  try {
    // Download zip
    // console.log(`[SkillInstaller] Downloading zip from: ${zipUrl}`)
    const zipBuffer = await downloadZipFile(zipUrl)

    // Extract zip
    // console.log(`[SkillInstaller] Extracting zip...`)
    const zip = new AdmZip(zipBuffer)
    zip.extractAllTo(tempDir, true)

    // Check if zip extracted to a single subdirectory (common pattern)
    const entries = await fs.readdir(tempDir, { withFileTypes: true })
    let skillSourceDir = tempDir

    // If there's exactly one directory and no files, use that as the source
    const dirs = entries.filter(e => e.isDirectory())
    const files = entries.filter(e => e.isFile())
    if (dirs.length === 1 && files.length === 0) {
      skillSourceDir = path.join(tempDir, dirs[0].name)
    }

    // Validate
    const validation = await validateSkillDirectory(skillSourceDir)
    if (!validation.valid) {
      await fs.rm(tempDir, { recursive: true, force: true })
      return { success: false, error: validation.error }
    }

    const skillName = validation.name!
    const targetDir = path.join(skillsDir, skillName)

    // Check if already installed
    if (await directoryExists(targetDir)) {
      await fs.rm(tempDir, { recursive: true, force: true })
      return { success: false, error: `Skill "${skillName}" is already installed` }
    }

    // Move to final location
    await fs.rename(skillSourceDir, targetDir)

    // Clean up temp dir if we used a subdirectory
    if (skillSourceDir !== tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }

    // Write metadata
    const metaPath = path.join(targetDir, '.skill-meta.json')
    const meta = {
      installedAt: new Date().toISOString(),
      installedFrom: sourceLabel,
      enabled: true,
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

    // Reload registry
    await skillRegistry.reload()

    console.log(`[SkillInstaller] Successfully installed skill: ${skillName}`)
    return { success: true, skillName }
  } catch (error) {
    // Cleanup on failure
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {}

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Install a skill from ClawdHub page URL
 * https://clawdhub.com/owner/slug -> downloads from auth.clawdhub.com/api/v1/download?slug=slug
 */
export async function installFromClawdHub(pageUrl: string): Promise<InstallResult> {
  const slug = parseClawdHubUrl(pageUrl)
  if (!slug) {
    return { success: false, error: 'Invalid ClawdHub URL. Expected format: https://clawdhub.com/owner/skill-slug' }
  }

  const downloadUrl = `${CLAWDHUB_DOWNLOAD_BASE}?slug=${encodeURIComponent(slug)}`
  console.log(`[SkillInstaller] ClawdHub URL detected. Slug: ${slug}, Download URL: ${downloadUrl}`)

  return installFromZipUrl(downloadUrl, `clawdhub:${slug}`)
}

/**
 * Install from any URL - auto-detects source type
 */
export async function installFromUrl(url: string): Promise<InstallResult> {
  // ClawdHub page URL
  if (isClawdHubUrl(url)) {
    return installFromClawdHub(url)
  }

  // GitHub URL
  if (url.includes('github.com')) {
    return installFromGitHub(url)
  }

  // Direct zip URL (fallback)
  if (url.endsWith('.zip') || url.includes('/download')) {
    return installFromZipUrl(url, `url:${url}`)
  }

  return {
    success: false,
    error: 'Unsupported URL format. Supported: ClawdHub page URLs, GitHub URLs, or direct zip URLs',
  }
}

// ============================================================================
// Helper functions
// ============================================================================

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}
