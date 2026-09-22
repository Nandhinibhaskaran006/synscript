/**
 * Centralized Ignore Rules for SynScript
 * 
 * Excludes package managers, build artifacts, version control, caches,
 * shell histories, and system metadata from workspace watching, scanning,
 * database persistence, and client synchronization.
 */

const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.npm',
  '.yarn',
  '.pnpm-store',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.config',
  '.local',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
  '.cargo',
  '.rustup',
  '.gradle',
  '.m2',
  '.nuget',
  '.pub-cache',
  '.gem',
  '.bundle',
  '.synscript_home',
]);

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'npm-debug.log',
  'yarn-debug.log',
  'yarn-error.log',
  '.pnpm-debug.log',
  '.bash_history',
  '.zsh_history',
  '.bashrc',
  '.bash_profile',
  '.bash_logout',
  '.zshrc',
  '.profile',
  '.lesshst',
  '.viminfo',
  '.node_repl_history',
  '.python_history',
  '.gitconfig',
  '.wget-hsts',
]);

// Chokidar ignore pattern regex array
const CHOKIDAR_IGNORED = [
  /(^|[\/\\])(node_modules|\.npm|\.yarn|\.pnpm-store|\.git|\.svn|\.hg|dist|build|out|\.next|\.nuxt|\.turbo|\.cache|\.config|\.local|coverage|\.nyc_output|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.venv|venv|env|\.idea|\.vscode|\.cargo|\.rustup|\.gradle|\.m2|\.synscript_home|\.DS_Store)($|[\/\\])/,
  /\.log$/,
  /Thumbs\.db$/,
  /\.DS_Store$/,
  /(^|[\/\\])\.(bash|zsh|node_repl|python)_history$/,
  /(^|[\/\\])\.(bashrc|bash_profile|bash_logout|zshrc|profile|lesshst|viminfo)$/,
];

/**
 * Check if a relative path or file/folder name should be ignored
 */
function isPathIgnored(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return true;
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized) return true;

  const segments = normalized.split('/');

  for (const seg of segments) {
    if (!seg) continue;
    if (IGNORED_DIR_NAMES.has(seg)) return true;
    if (IGNORED_FILE_NAMES.has(seg)) return true;

    // Dot shell histories or runtime caches
    if (
      seg.startsWith('.bash_') ||
      seg.startsWith('.zsh_') ||
      seg.startsWith('.npm') ||
      seg.startsWith('.cache') ||
      seg === '.lesshst' ||
      seg === '.viminfo' ||
      seg === '.node_repl_history' ||
      seg === '.python_history' ||
      seg === '.synscript_home'
    ) {
      return true;
    }

    // Log files or swap files
    if (seg.endsWith('.log') || seg.endsWith('.tmp') || seg.endsWith('.swp') || seg.endsWith('.swo')) {
      return true;
    }
  }

  return false;
}

/**
 * Filter an array of file/folder objects
 */
function filterIgnoredFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.filter((f) => {
    if (!f || typeof f.path !== 'string') return false;
    return !isPathIgnored(f.path);
  });
}

module.exports = {
  IGNORED_DIR_NAMES,
  IGNORED_FILE_NAMES,
  CHOKIDAR_IGNORED,
  isPathIgnored,
  filterIgnoredFiles,
};
