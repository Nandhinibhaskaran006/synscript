/**
 * SynScript Terminal Workspace Foundation
 * 
 * Architectural Foundation for Future Containerized Interactive Terminals.
 * 
 * Pipeline Design:
 * Browser (xterm.js / WebSockets)
 *    ↓
 * Socket.io Server (terminal-input, terminal-resize events)
 *    ↓
 * Backend Terminal Workspace Service (this service)
 *    ↓
 * Isolated Docker Workspace Container (node-pty / Dockerode stream)
 *    ↓
 * Sandboxed Alpine / Ubuntu Shell (/bin/sh, bash)
 */

const logger = require('../utils/logger');

// In-memory active terminal sessions: sessionId -> SessionState
const activeSessions = new Map();

class TerminalWorkspaceService {
  constructor() {
    this.dockerEnabled = process.env.DOCKER_TERMINAL_ENABLED === 'true';
  }

  /**
   * Initialize a terminal workspace session for a room / user
   * @param {string} roomId
   * @param {string} userId
   * @param {object} options
   */
  async createSession(roomId, userId, options = {}) {
    const sessionId = `term_${roomId}_${userId}_${Date.now()}`;
    logger.info('TERMINAL', `Creating terminal workspace session: ${sessionId}`, { roomId, userId });

    const session = {
      id: sessionId,
      roomId,
      userId,
      createdAt: new Date(),
      status: 'ready',
      cols: options.cols || 80,
      rows: options.rows || 24,
      containerId: null, // Will hold Docker container ID in full terminal phase
    };

    activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Resize terminal dimensions
   */
  async resizeSession(sessionId, cols, rows) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    session.cols = cols;
    session.rows = rows;
    logger.debug('TERMINAL', `Resized terminal session ${sessionId} to ${cols}x${rows}`);
    return true;
  }

  /**
   * Terminate and clean up session
   */
  async closeSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    logger.info('TERMINAL', `Closing terminal workspace session: ${sessionId}`);
    activeSessions.delete(sessionId);
    return true;
  }

  /**
   * Get active session status
   */
  getSession(sessionId) {
    return activeSessions.get(sessionId) || null;
  }

  /**
   * Check container engine readiness
   */
  getReadiness() {
    return {
      dockerEnabled: this.dockerEnabled,
      activeSessionsCount: activeSessions.size,
      runtime: 'node-docker-foundation',
    };
  }
}

module.exports = new TerminalWorkspaceService();
