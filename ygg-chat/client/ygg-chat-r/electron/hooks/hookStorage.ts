import { createRequire as createNodeRequire } from 'module'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'

const HOOKS_DIR_NAME = '.ygg'
const YGG_SETTINGS_FILES = ['settings.json', 'settings.local.json'] as const

function isHookDebugLoggingEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.YGG_HOOK_DEBUG_LOGS || '')
}

function logHookStorage(message: string, details?: Record<string, unknown>): void {
  if (!isHookDebugLoggingEnabled()) return
  console.info(`[HookStorage] ${message}`, details || {})
}

let cachedHooksDir: string | null = null

type ElectronAppLike = {
  getPath: (name: string) => string
  getAppPath: () => string
  isPackaged?: boolean
}

const electronRequire = createNodeRequire(import.meta.url)
let cachedElectronApp: ElectronAppLike | null | undefined

function getElectronApp(): ElectronAppLike | null {
  if (cachedElectronApp !== undefined) {
    return cachedElectronApp
  }

  try {
    const electronModule = electronRequire('electron') as any
    cachedElectronApp = (electronModule?.app as ElectronAppLike | undefined) || null
  } catch {
    cachedElectronApp = null
  }

  return cachedElectronApp
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsPromises.access(targetPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function syncBundledTree(sourcePath: string, targetPath: string): Promise<void> {
  const sourceStats = await fsPromises.stat(sourcePath)

  if (sourceStats.isDirectory()) {
    await fsPromises.mkdir(targetPath, { recursive: true })
    const entries = await fsPromises.readdir(sourcePath, { withFileTypes: true })
    for (const entry of entries) {
      await syncBundledTree(path.join(sourcePath, entry.name), path.join(targetPath, entry.name))
    }
    return
  }

  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true })
  await fsPromises.copyFile(sourcePath, targetPath)
  logHookStorage('copied bundled hook file', { sourcePath, targetPath })
}

function resolveBundledHooksDirectory(): string {
  const envOverride = process.env.YGG_HOOKS_TEMPLATE_DIRECTORY?.trim()
  if (envOverride) {
    const resolved = path.resolve(envOverride)
    logHookStorage('resolved bundled hooks directory from env', { bundledHooksDir: resolved })
    return resolved
  }

  const electronApp = getElectronApp()
  if (electronApp?.isPackaged) {
    const resolved = path.join(process.resourcesPath, HOOKS_DIR_NAME)
    logHookStorage('resolved packaged bundled hooks directory', { bundledHooksDir: resolved, resourcesPath: process.resourcesPath })
    return resolved
  }

  try {
    if (electronApp) {
      const resolved = path.join(electronApp.getAppPath(), HOOKS_DIR_NAME)
      logHookStorage('resolved app bundled hooks directory', { bundledHooksDir: resolved, appPath: electronApp.getAppPath() })
      return resolved
    }
  } catch (error) {
    logHookStorage('failed to resolve app bundled hooks directory; falling back to cwd', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const resolved = path.resolve(process.cwd(), HOOKS_DIR_NAME)
  logHookStorage('resolved cwd bundled hooks directory', { bundledHooksDir: resolved })
  return resolved
}

export function getManagedHooksDirectory(): string {
  if (cachedHooksDir) {
    return cachedHooksDir
  }

  const envOverride = process.env.YGG_HOOKS_DIRECTORY?.trim()
  if (envOverride) {
    cachedHooksDir = path.resolve(envOverride)
    logHookStorage('resolved managed hooks directory from env', { managedHooksDir: cachedHooksDir })
    return cachedHooksDir
  }

  const electronApp = getElectronApp()
  if (electronApp) {
    cachedHooksDir = path.join(electronApp.getPath('userData'), HOOKS_DIR_NAME)
    logHookStorage('resolved managed hooks directory from electron userData', {
      managedHooksDir: cachedHooksDir,
      userData: electronApp.getPath('userData'),
    })
    return cachedHooksDir
  }

  cachedHooksDir = path.resolve(process.cwd(), HOOKS_DIR_NAME)
  logHookStorage('resolved managed hooks directory from cwd', { managedHooksDir: cachedHooksDir })
  return cachedHooksDir
}

export function getManagedHooksWorkingDirectory(): string {
  return path.dirname(getManagedHooksDirectory())
}

export async function ensureManagedHooksInitialized(): Promise<string> {
  const managedHooksDir = getManagedHooksDirectory()
  await fsPromises.mkdir(managedHooksDir, { recursive: true })

  const bundledHooksDir = resolveBundledHooksDirectory()
  const normalizedManaged = path.resolve(managedHooksDir)
  const normalizedBundled = path.resolve(bundledHooksDir)
  logHookStorage('initializing managed hooks', {
    managedHooksDir,
    bundledHooksDir,
    normalizedManaged,
    normalizedBundled,
  })

  if (normalizedManaged === normalizedBundled) {
    logHookStorage('managed hooks directory is bundled hooks directory; skipping copy', { managedHooksDir })
    return managedHooksDir
  }

  if (!(await pathExists(bundledHooksDir))) {
    logHookStorage('bundled hooks directory not found; using managed directory as-is', { bundledHooksDir, managedHooksDir })
    return managedHooksDir
  }

  for (const fileName of YGG_SETTINGS_FILES) {
    const sourceFile = path.join(bundledHooksDir, fileName)
    const targetFile = path.join(managedHooksDir, fileName)
    if (await pathExists(sourceFile)) {
      await syncBundledTree(sourceFile, targetFile)
    }
  }

  const bundledHooksScriptsDir = path.join(bundledHooksDir, 'hooks')
  const targetHooksScriptsDir = path.join(managedHooksDir, 'hooks')
  if (await pathExists(bundledHooksScriptsDir)) {
    await syncBundledTree(bundledHooksScriptsDir, targetHooksScriptsDir)
  } else {
    logHookStorage('bundled hook scripts directory not found', { bundledHooksScriptsDir })
  }

  logHookStorage('managed hooks initialized', { managedHooksDir })
  return managedHooksDir
}
