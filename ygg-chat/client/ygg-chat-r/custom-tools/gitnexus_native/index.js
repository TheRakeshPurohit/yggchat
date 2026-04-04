const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const JSON_ACTIONS = new Set(['query', 'context', 'impact', 'cypher']);
const ACTION_TIMEOUTS = {
  version: 30000,
  list: 60000,
  status: 60000,
  query: 120000,
  context: 120000,
  impact: 120000,
  cypher: 120000,
  analyze: 1800000,
};

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizePathMaybe(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function existingFileOrNull(filePath) {
  if (!filePath) return null;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function existingDirOrNull(dirPath) {
  if (!dirPath) return null;
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory() ? dirPath : null;
  } catch {
    return null;
  }
}

function resolveWorkingDirectory(args, options) {
  return (
    existingDirOrNull(normalizePathMaybe(args.repoPath)) ||
    existingDirOrNull(normalizePathMaybe(options && options.cwd)) ||
    existingDirOrNull(normalizePathMaybe(options && options.rootPath)) ||
    process.cwd()
  );
}

function getCandidateBinaries(explicitBin) {
  const candidates = [];
  const explicit = normalizePathMaybe(explicitBin);
  if (explicit) candidates.push(explicit);

  const envBin = normalizePathMaybe(process.env.GITNEXUS_BIN);
  if (envBin) candidates.push(envBin);

  if (process.platform === 'win32') {
    const appData = normalizePathMaybe(process.env.APPDATA) || path.join(os.homedir(), 'AppData', 'Roaming');
    candidates.push(path.join(appData, 'npm', 'gitnexus.cmd'));
    candidates.push(path.join(appData, 'npm', 'gitnexus.ps1'));
    candidates.push(path.join(appData, 'npm', 'gitnexus'));
    candidates.push('gitnexus.cmd');
    candidates.push('gitnexus');
  } else {
    candidates.push(path.join(os.homedir(), '.npm-global', 'bin', 'gitnexus'));
    candidates.push(path.join(os.homedir(), '.local', 'bin', 'gitnexus'));
    candidates.push('gitnexus');
  }

  return uniq(candidates).filter(candidate => {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      return Boolean(existingFileOrNull(candidate));
    }
    return true;
  });
}

function buildCommandArgs(action, args, workingDirectory) {
  switch (action) {
    case 'version':
      return ['--version'];

    case 'analyze': {
      const commandArgs = ['analyze'];
      const repoPath = normalizePathMaybe(args.repoPath);
      if (repoPath && path.resolve(repoPath) !== path.resolve(workingDirectory)) {
        commandArgs.push(repoPath);
      }
      if (args.force) commandArgs.push('--force');
      if (args.embeddings) commandArgs.push('--embeddings');
      if (args.skills) commandArgs.push('--skills');
      if (args.skipAgentsMd) commandArgs.push('--skip-agents-md');
      if (args.skipGit) commandArgs.push('--skip-git');
      if (args.verbose) commandArgs.push('--verbose');
      return commandArgs;
    }

    case 'list':
      return ['list'];

    case 'status':
      return ['status'];

    case 'query': {
      if (!normalizePathMaybe(args.query)) {
        throw new Error('The "query" action requires a non-empty "query" string.');
      }
      const commandArgs = ['query', args.query];
      if (normalizePathMaybe(args.repo)) commandArgs.push('--repo', args.repo);
      if (normalizePathMaybe(args.taskContext)) commandArgs.push('--context', args.taskContext);
      if (normalizePathMaybe(args.goal)) commandArgs.push('--goal', args.goal);
      if (Number.isInteger(args.limit)) commandArgs.push('--limit', String(args.limit));
      if (args.content) commandArgs.push('--content');
      return commandArgs;
    }

    case 'context': {
      if (!normalizePathMaybe(args.symbol) && !normalizePathMaybe(args.uid)) {
        throw new Error('The "context" action requires either "symbol" or "uid".');
      }
      const commandArgs = ['context'];
      if (normalizePathMaybe(args.symbol)) commandArgs.push(args.symbol);
      if (normalizePathMaybe(args.repo)) commandArgs.push('--repo', args.repo);
      if (normalizePathMaybe(args.uid)) commandArgs.push('--uid', args.uid);
      if (normalizePathMaybe(args.file)) commandArgs.push('--file', args.file);
      if (args.content) commandArgs.push('--content');
      return commandArgs;
    }

    case 'impact': {
      if (!normalizePathMaybe(args.target)) {
        throw new Error('The "impact" action requires a non-empty "target" string.');
      }
      const commandArgs = ['impact', args.target];
      if (normalizePathMaybe(args.direction)) commandArgs.push('--direction', args.direction);
      if (normalizePathMaybe(args.repo)) commandArgs.push('--repo', args.repo);
      if (Number.isInteger(args.depth)) commandArgs.push('--depth', String(args.depth));
      if (args.includeTests) commandArgs.push('--include-tests');
      return commandArgs;
    }

    case 'cypher': {
      if (!normalizePathMaybe(args.cypher)) {
        throw new Error('The "cypher" action requires a non-empty "cypher" string.');
      }
      const commandArgs = ['cypher', args.cypher];
      if (normalizePathMaybe(args.repo)) commandArgs.push('--repo', args.repo);
      return commandArgs;
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

function tryParseJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function isCommandNotFound(result) {
  const stderr = String(result && result.stderr ? result.stderr : '').toLowerCase();
  const stdout = String(result && result.stdout ? result.stdout : '').toLowerCase();
  return (
    result && result.errorCode === 'ENOENT' ||
    stderr.includes('not recognized as an internal or external command') ||
    stderr.includes('no such file or directory') ||
    stderr.includes('command not found') ||
    stdout.includes('command not found')
  );
}

function runBinary(binary, commandArgs, options) {
  const timeoutMs = options.timeoutMs;
  const cwd = options.cwd;

  return new Promise(resolve => {
    const child = spawn(binary, commandArgs, {
      cwd,
      shell: process.platform === 'win32',
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutHandle = null;

    const finish = result => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(result);
    };

    timeoutHandle = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      finish({
        ok: false,
        timedOut: true,
        errorCode: 'ETIMEDOUT',
        exitCode: null,
        signal: 'SIGTERM',
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}Command timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      finish({
        ok: false,
        timedOut: false,
        errorCode: error && error.code ? error.code : 'SPAWN_ERROR',
        exitCode: null,
        signal: null,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message || String(error)}`,
      });
    });

    child.on('close', (exitCode, signal) => {
      finish({
        ok: exitCode === 0,
        timedOut: false,
        errorCode: null,
        exitCode,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

async function executeGitNexus(action, args, options) {
  const workingDirectory = resolveWorkingDirectory(args, options || {});
  const commandArgs = buildCommandArgs(action, args, workingDirectory);
  const timeoutMs = Number.isInteger(args.timeoutMs) && args.timeoutMs > 0
    ? args.timeoutMs
    : (ACTION_TIMEOUTS[action] || 120000);

  const binaries = getCandidateBinaries(args.gitnexusBin);
  if (binaries.length === 0) {
    throw new Error('No GitNexus binary candidates were found. Install GitNexus or pass gitnexusBin.');
  }

  let lastResult = null;
  let selectedBinary = null;

  for (const binary of binaries) {
    const result = await runBinary(binary, commandArgs, {
      cwd: workingDirectory,
      timeoutMs,
    });

    if (isCommandNotFound(result)) {
      lastResult = result;
      continue;
    }

    lastResult = result;
    selectedBinary = binary;
    break;
  }

  if (!selectedBinary) {
    throw new Error(
      `Unable to locate a working GitNexus binary. Tried: ${binaries.join(', ')}${lastResult && lastResult.stderr ? ` | Last error: ${lastResult.stderr.trim()}` : ''}`
    );
  }

  const parsed = JSON_ACTIONS.has(action) ? tryParseJson(lastResult.stdout) : null;
  const success = Boolean(lastResult.ok) && !(parsed && parsed.error);

  return {
    success,
    action,
    gitnexusBinUsed: selectedBinary,
    command: [selectedBinary, ...commandArgs].join(' '),
    cwd: workingDirectory,
    timeoutMs,
    exitCode: lastResult.exitCode,
    signal: lastResult.signal,
    stdout: lastResult.stdout,
    stderr: lastResult.stderr,
    data: parsed || undefined,
    error: success
      ? undefined
      : (parsed && parsed.error) || lastResult.stderr.trim() || lastResult.stdout.trim() || `gitnexus ${action} failed`,
  };
}

module.exports.execute = async (args = {}, options = {}) => {
  const action = normalizePathMaybe(args.action);
  if (!action) {
    return { success: false, error: 'Missing required "action".' };
  }

  try {
    return await executeGitNexus(action, args, options);
  } catch (error) {
    return {
      success: false,
      action,
      error: error && error.message ? error.message : String(error),
    };
  }
};
