/**
 * SynScript Terminal Workspace Service
 * 
 * Interactive containerized/sandboxed PTY terminal management using node-pty.
 * Supports multiple concurrent terminal tabs per user/socket connection.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const workspaceWatcherService = require('./workspaceWatcherService');
const logger = require('../utils/logger');

// In-memory active terminal sessions: `${socketId}:${terminalId}` -> SessionState
const activeSessions = new Map();

// Ensure spawn-helper binary has execute permissions on darwin if present
if (process.platform === 'darwin') {
  try {
    const helperArm = path.join(__dirname, '../../node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper');
    const helperX64 = path.join(__dirname, '../../node_modules/node-pty/prebuilds/darwin-x64/spawn-helper');
    if (fs.existsSync(helperArm)) fs.chmodSync(helperArm, 0o755);
    if (fs.existsSync(helperX64)) fs.chmodSync(helperX64, 0o755);
  } catch (e) {
    // Ignore if not accessible
  }
}

/**
 * Determine suitable shell based on platform and available binaries
 */
function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  if (fs.existsSync('/bin/sh')) return '/bin/sh';
  return process.env.SHELL || 'sh';
}

function getSessionKey(socketId, terminalId = '1') {
  return `${socketId}:${terminalId || '1'}`;
}

class TerminalWorkspaceService {
  /**
   * Start an interactive PTY session for a socket connection (Non-blocking & multi-terminal tab support)
   */
  async startTerminal(socket, roomId, options = {}) {
    const socketId = socket.id;
    const terminalId = String(options.terminalId || '1');
    const sessionKey = getSessionKey(socketId, terminalId);

    // If an existing session exists for this socket + terminalId, terminate it first
    if (activeSessions.has(sessionKey)) {
      this.closeTerminal(socketId, terminalId);
    }

    const cols = Math.max(10, parseInt(options.cols, 10) || 80);
    const rows = Math.max(5, parseInt(options.rows, 10) || 24);

    // Sandbox workspace folder per room
    const baseWorkspaceRoot = process.env.WORKSPACE_ROOT || path.join(os.tmpdir(), 'synscript_workspaces');
    const sanitizedRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const workspaceDir = path.join(baseWorkspaceRoot, sanitizedRoom);
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    // Dedicated sandbox home for shell/npm/tool cache files
    const sandboxHome = path.join(workspaceDir, '.synscript_home');
    if (!fs.existsSync(sandboxHome)) {
      try {
        fs.mkdirSync(sandboxHome, { recursive: true });
      } catch (_) {}
    }

    // Run file sync in background non-blockingly (never block shell spawn)
    workspaceWatcherService.syncDatabaseFilesToDisk(roomId).catch((err) => {
      logger.warn('TERMINAL', `Background file sync warning: ${err.message}`, { roomId });
    });

    let roomName = options.roomName;
    if (!roomName && mongoose.connection.readyState === 1) {
      try {
        const room = await Room.findOne({ roomId }).select('name').lean();
        if (room && room.name) {
          roomName = room.name;
        }
      } catch (err) {
        // ignore
      }
    }
    const safeRoomName = (roomName || 'Workspace').replace(/[\r\n\t]/g, '').trim();

    // Dynamic prompt command: updates PS1 on cd / mkdir / navigation relative to room workspace root
    const promptCommand = `cur="$PWD"; base="$SYNSCRIPT_WORKSPACE_ROOT"; rname="$SYNSCRIPT_ROOM_NAME"; if [ "$cur" = "$base" ]; then PS1="synscript:\${rname}# "; elif [[ "$cur" == "$base"/* ]]; then rel="\${cur#$base/}"; PS1="synscript:\${rname}/\$rel# "; else PS1="synscript:\${rname}:\$cur# "; fi`;

    const shell = getDefaultShell();
    const spawnArgs = shell.endsWith('bash') ? ['--norc', '--noprofile', '-i'] : ['-i'];
    logger.info('TERMINAL', `Spawning PTY shell [${shell}] for room "${safeRoomName}" [${roomId}] (socket: ${socketId}, tab: ${terminalId})`);

    let ptyProcess;
    try {
      ptyProcess = pty.spawn(shell, spawnArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: workspaceDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: 'en_US.UTF-8',
          SYNSCRIPT_WORKSPACE_ROOT: workspaceDir,
          SYNSCRIPT_ROOM_NAME: safeRoomName,
          PS1: `synscript:${safeRoomName}# `,
          PROMPT: `synscript:${safeRoomName}# `,
          PROMPT_COMMAND: promptCommand,
          HOME: sandboxHome,
          XDG_CACHE_HOME: path.join(sandboxHome, 'cache'),
          XDG_CONFIG_HOME: path.join(sandboxHome, 'config'),
          npm_config_cache: path.join(sandboxHome, 'npm-cache'),
          HISTFILE: path.join(sandboxHome, `.bash_history_${terminalId}`),
          PWD: workspaceDir,
          PYTHONUNBUFFERED: '1',
          FORCE_COLOR: '1',
        },
      });
    } catch (spawnErr) {
      logger.error('TERMINAL', `Failed to spawn node-pty process: ${spawnErr.message}`, { roomId, terminalId, stack: spawnErr.stack });
      socket.emit('terminal:output', {
        terminalId,
        data: `\r\n\x1b[31m[SynScript Terminal Error]: Failed to start shell: ${spawnErr.message}\x1b[0m\r\n`,
      });
      return null;
    }

    const session = {
      socketId,
      terminalId,
      sessionKey,
      roomId,
      userId: socket.userId,
      username: socket.username,
      workspaceDir,
      pty: ptyProcess,
      historyBuffer: '',
      createdAt: new Date(),
    };

    activeSessions.set(sessionKey, session);

    // Stream output to socket with terminalId
    ptyProcess.onData((data) => {
      session.historyBuffer += data;
      if (session.historyBuffer.length > 64 * 1024) {
        session.historyBuffer = session.historyBuffer.slice(-32 * 1024);
      }

      socket.emit('terminal:output', { terminalId, data });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info('TERMINAL', `PTY process exited (socket: ${socketId}, tab: ${terminalId}, code: ${exitCode}, signal: ${signal})`);
      socket.emit('terminal:output', {
        terminalId,
        data: `\r\n\x1b[33m[Session ${terminalId} terminated with code ${exitCode}]\x1b[0m\r\n`,
      });
      activeSessions.delete(sessionKey);
    });

    return session;
  }

  /**
   * Handle incoming input from client terminal
   */
  handleInput(socketId, terminalId = '1', data) {
    // Support overloaded arguments handleInput(socketId, data)
    if (typeof terminalId === 'string' && data === undefined) {
      data = terminalId;
      terminalId = '1';
    }

    const sessionKey = getSessionKey(socketId, terminalId);
    const session = activeSessions.get(sessionKey);
    if (!session || !session.pty) return false;
    if (typeof data !== 'string') return false;

    try {
      session.pty.write(data);
      return true;
    } catch (err) {
      logger.error('TERMINAL', `Error writing to PTY: ${err.message}`, { socketId, terminalId });
      return false;
    }
  }

  /**
   * Resize PTY dimensions
   */
  handleResize(socketId, terminalId = '1', cols, rows) {
    // Support overloaded arguments handleResize(socketId, cols, rows)
    if (typeof terminalId === 'number' && typeof cols === 'number' && rows === undefined) {
      rows = cols;
      cols = terminalId;
      terminalId = '1';
    }

    const sessionKey = getSessionKey(socketId, terminalId);
    const session = activeSessions.get(sessionKey);
    if (!session || !session.pty) return false;

    const safeCols = Math.max(10, parseInt(cols, 10) || 80);
    const safeRows = Math.max(5, parseInt(rows, 10) || 24);

    try {
      session.pty.resize(safeCols, safeRows);
      return true;
    } catch (err) {
      logger.debug('TERMINAL', `Error resizing PTY: ${err.message}`, { socketId, terminalId });
      return false;
    }
  }

  /**
   * Close a specific terminal session (or all for a socket if terminalId is omitted)
   */
  closeTerminal(socketId, terminalId) {
    if (terminalId) {
      const sessionKey = getSessionKey(socketId, terminalId);
      const session = activeSessions.get(sessionKey);
      if (!session) return false;

      try {
        if (session.pty) {
          session.pty.kill();
        }
      } catch (err) {
        logger.debug('TERMINAL', `Error killing PTY process: ${err.message}`, { socketId, terminalId });
      }

      activeSessions.delete(sessionKey);
      return true;
    }

    // Close all sessions for this socketId
    return this.cleanupSocket(socketId);
  }

  /**
   * Clean up all terminal sessions for a specific socket
   */
  cleanupSocket(socketId) {
    let closedCount = 0;
    for (const [key, session] of activeSessions.entries()) {
      if (session.socketId === socketId) {
        try {
          if (session.pty) {
            session.pty.kill();
          }
        } catch (err) {
          // ignore
        }
        activeSessions.delete(key);
        closedCount++;
      }
    }
    return closedCount > 0;
  }

  /**
   * Clean up all terminal sessions for a room
   */
  cleanupRoom(roomId) {
    for (const [key, session] of activeSessions.entries()) {
      if (session.roomId === roomId) {
        try {
          if (session.pty) {
            session.pty.kill();
          }
        } catch (err) {
          // ignore
        }
        activeSessions.delete(key);
      }
    }
  }

  /**
   * Get active session by socket ID and terminalId
   */
  getSession(socketId, terminalId = '1') {
    const sessionKey = getSessionKey(socketId, terminalId);
    return activeSessions.get(sessionKey) || null;
  }

  /**
   * Get all active sessions for a socket
   */
  getSocketSessions(socketId) {
    const list = [];
    for (const session of activeSessions.values()) {
      if (session.socketId === socketId) {
        list.push(session);
      }
    }
    return list;
  }
}

module.exports = new TerminalWorkspaceService();
