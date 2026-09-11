const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Normalizes language string to supported keys: 'javascript', 'python', 'java'
 */
function normalizeLanguage(lang = '') {
  const l = String(lang).trim().toLowerCase();
  if (['js', 'javascript', 'node'].includes(l)) return 'javascript';
  if (['py', 'python', 'python3'].includes(l)) return 'python';
  if (['java'].includes(l)) return 'java';
  if (['ts', 'typescript'].includes(l)) return 'typescript';
  return l;
}

/**
 * Extracts the Java class name from code if present, otherwise defaults to 'Main'
 */
function extractJavaClassName(code) {
  const match = code.match(/(?:public\s+)?(?:final\s+)?class\s+([A-Za-z0-9_$]+)/);
  return match ? match[1] : 'Main';
}

/**
 * Controller to execute code securely in a child process
 * POST /api/execute
 * Body: { language: string, code: string }
 */
const executeCode = async (req, res) => {
  const { language, code } = req.body;

  if (typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      output: '',
      error: 'Code string is required.',
    });
  }

  const normalizedLang = normalizeLanguage(language);
  const supportedLanguages = ['javascript', 'python', 'java', 'typescript'];

  if (!supportedLanguages.includes(normalizedLang)) {
    return res.status(400).json({
      success: false,
      output: '',
      error: `Unsupported language: "${language}". Supported languages are: JavaScript, Python, Java.`,
    });
  }

  // Create an isolated temporary folder
  const runId = crypto.randomBytes(6).toString('hex');
  const tempDir = path.join(os.tmpdir(), `synscript_run_${runId}`);

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });

    let fileName = '';
    let command = '';

    switch (normalizedLang) {
      case 'javascript':
        fileName = 'script.js';
        command = `node "${fileName}"`;
        break;

      case 'python':
        fileName = 'script.py';
        // Try python3 first, fallback handled gracefully
        command = `python3 "${fileName}" 2>&1 || python "${fileName}"`;
        break;

      case 'typescript':
        fileName = 'script.ts';
        command = `npx -y tsx "${fileName}" || npx -y ts-node "${fileName}"`;
        break;

      case 'java': {
        const className = extractJavaClassName(code);
        fileName = `${className}.java`;
        // In Java 11+, single-file source code can be run directly via `java <file.java>`
        // Fallback to `javac <file.java> && java <className>`
        command = `java "${fileName}" || (javac "${fileName}" && java "${className}")`;
        break;
      }

      default:
        throw new Error(`Unsupported language ${normalizedLang}`);
    }

    const filePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(filePath, code, 'utf8');

    const executionPromise = new Promise((resolve) => {
      exec(
        command,
        {
          cwd: tempDir,
          timeout: 10000, // 10-second timeout limit
          maxBuffer: 1024 * 1024, // 1MB buffer limit
          env: {
            ...process.env,
            NODE_ENV: 'production',
            PYTHONUNBUFFERED: '1',
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            if (error.killed || error.signal === 'SIGTERM') {
              return resolve({
                success: false,
                output: stdout ? stdout.toString() : '',
                error: 'Execution timed out (10s limit). Please check for infinite loops or long-running operations.',
              });
            }

            const errMessage = stderr
              ? stderr.toString()
              : error.message || 'Execution failed';

            return resolve({
              success: false,
              output: stdout ? stdout.toString() : '',
              error: errMessage,
            });
          }

          resolve({
            success: true,
            output: stdout ? stdout.toString() : '',
            error: stderr ? stderr.toString() : '',
          });
        }
      );
    });

    const result = await executionPromise;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      output: '',
      error: err.message || 'Internal server error during execution',
    });
  } finally {
    // Cleanup temporary directory and files
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('Failed to clean up temp execution directory:', cleanupErr);
    }
  }
};

module.exports = {
  executeCode,
};
