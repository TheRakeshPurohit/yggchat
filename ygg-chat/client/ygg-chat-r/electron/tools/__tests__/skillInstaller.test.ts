import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let skillsDir: string

vi.mock('../../skills/skillLoader.js', () => ({
  skillRegistry: {
    getSkillsDirectory: () => skillsDir,
    reload: vi.fn().mockResolvedValue(undefined),
  },
}))

type GitHubItem = {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
  url: string
}

const apiUrl = (repoPath = '') => `https://api.github.com/repos/owner/repo/contents/${repoPath}`
const treeUrl = (repoPath: string) => `https://github.com/owner/repo/tree/main/${repoPath}`
const dir = (name: string, repoPath = name): GitHubItem => ({
  name,
  path: repoPath,
  type: 'dir',
  download_url: null,
  url: apiUrl(repoPath),
})
const file = (name: string, repoPath = name, downloadUrl = `https://raw.test/${repoPath}`): GitHubItem => ({
  name,
  path: repoPath,
  type: 'file',
  download_url: downloadUrl,
  url: apiUrl(repoPath),
})

function mockGitHubFetch(responses: Record<string, unknown>, downloads: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url in downloads) {
        return new Response(downloads[url], { status: 200 })
      }

      const withoutRef = url.replace(/\?ref=[^&]+$/, '')
      if (withoutRef in responses) {
        return new Response(JSON.stringify(responses[withoutRef]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'not found' }), { status: 404, statusText: 'Not Found' })
    })
  )
}

describe('skillInstaller GitHub discovery', () => {
  beforeEach(async () => {
    vi.resetModules()
    skillsDir = await mkdtemp(path.join(os.tmpdir(), 'ygg-skills-'))
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(skillsDir, { recursive: true, force: true })
  })

  it('returns candidate URLs for a repo root with multiple skills under top-level skills/', async () => {
    mockGitHubFetch({
      [apiUrl('')]: [dir('skills'), dir('docs')],
      [apiUrl('skills')]: [dir('ponytail', 'skills/ponytail'), dir('ponytail-review', 'skills/ponytail-review')],
      [apiUrl('skills/ponytail')]: [file('SKILL.md', 'skills/ponytail/SKILL.md')],
      [apiUrl('skills/ponytail-review')]: [file('SKILL.md', 'skills/ponytail-review/SKILL.md')],
    })

    const { installFromGitHub } = await import('../../skills/skillInstaller.js')
    const result = await installFromGitHub('https://github.com/owner/repo')

    expect(result.success).toBe(false)
    expect(result.code).toBe('MULTIPLE_SKILLS_FOUND')
    expect(result.candidates).toEqual([
      { name: 'ponytail', path: 'skills/ponytail', url: treeUrl('skills/ponytail') },
      { name: 'ponytail-review', path: 'skills/ponytail-review', url: treeUrl('skills/ponytail-review') },
    ])
    expect(result.error).toContain('Multiple skills found')
  })

  it('auto-installs a repo root with exactly one skill under top-level skills/', async () => {
    mockGitHubFetch(
      {
        [apiUrl('')]: [dir('skills')],
        [apiUrl('skills')]: [dir('ponytail', 'skills/ponytail')],
        [apiUrl('skills/ponytail')]: [
          file('SKILL.md', 'skills/ponytail/SKILL.md', 'https://raw.test/skills/ponytail/SKILL.md'),
        ],
      },
      {
        'https://raw.test/skills/ponytail/SKILL.md': '---\nname: ponytail\ndescription: Lazy senior dev mode\n---\nUse less code.\n',
      }
    )

    const { installFromGitHub } = await import('../../skills/skillInstaller.js')
    const result = await installFromGitHub('https://github.com/owner/repo')

    expect(result).toMatchObject({ success: true, skillName: 'ponytail' })
  })

  it('installs a direct GitHub skill folder URL', async () => {
    mockGitHubFetch(
      {
        [apiUrl('skills/ponytail')]: [
          file('SKILL.md', 'skills/ponytail/SKILL.md', 'https://raw.test/skills/ponytail/SKILL.md'),
        ],
      },
      {
        'https://raw.test/skills/ponytail/SKILL.md': '---\nname: ponytail\ndescription: Lazy senior dev mode\n---\nUse less code.\n',
      }
    )

    const { installFromGitHub } = await import('../../skills/skillInstaller.js')
    const result = await installFromGitHub('https://github.com/owner/repo/tree/main/skills/ponytail')

    expect(result).toMatchObject({ success: true, skillName: 'ponytail' })
  })

  it('returns a clear no-skills result for repos without skill folders', async () => {
    mockGitHubFetch({
      [apiUrl('')]: [dir('docs'), file('README.md')],
      [apiUrl('docs')]: [file('guide.md', 'docs/guide.md')],
    })

    const { installFromGitHub } = await import('../../skills/skillInstaller.js')
    const result = await installFromGitHub('https://github.com/owner/repo')

    expect(result.success).toBe(false)
    expect(result.code).toBe('NO_SKILLS_FOUND')
    expect(result.error).toContain('No skills found')
  })

  it('installs all discovered skills under the GitHub repo directory', async () => {
    mockGitHubFetch(
      {
        [apiUrl('')]: [dir('skills')],
        [apiUrl('skills')]: [dir('ponytail', 'skills/ponytail'), dir('ponytail-review', 'skills/ponytail-review')],
        [apiUrl('skills/ponytail')]: [
          file('SKILL.md', 'skills/ponytail/SKILL.md', 'https://raw.test/skills/ponytail/SKILL.md'),
        ],
        [apiUrl('skills/ponytail-review')]: [
          file('SKILL.md', 'skills/ponytail-review/SKILL.md', 'https://raw.test/skills/ponytail-review/SKILL.md'),
        ],
      },
      {
        'https://raw.test/skills/ponytail/SKILL.md': '---\nname: ponytail\ndescription: Lazy senior dev mode\n---\nUse less code.\n',
        'https://raw.test/skills/ponytail-review/SKILL.md': '---\nname: ponytail-review\ndescription: Review for needless code\n---\nDelete code.\n',
      }
    )

    const { access } = await import('fs/promises')
    const { installAllFromGitHub } = await import('../../skills/skillInstaller.js')
    const result = await installAllFromGitHub('https://github.com/owner/repo')

    expect(result).toMatchObject({
      success: true,
      skillName: 'repo',
      skillNames: ['ponytail', 'ponytail-review'],
    })
    await expect(access(path.join(skillsDir, 'repo', 'ponytail', 'SKILL.md'))).resolves.toBeUndefined()
    await expect(access(path.join(skillsDir, 'repo', 'ponytail-review', 'SKILL.md'))).resolves.toBeUndefined()
  })
})
