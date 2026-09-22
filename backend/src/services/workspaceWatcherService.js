/**
 * SynScript Workspace Watcher Service
 * 
 * Bi-directional synchronization between the on-disk workspace (terminal / filesystem)
 * and the SynScript Room state (MongoDB & WebSockets).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');
const chokidar = require('chokidar');
const Room = require('../models/Room');
const { replaceRoomFiles } = require('../utils/roomFiles');
const { CHOKIDAR_IGNORED, isPathIgnored } = require('../utils/ignoreRules');
const logger = require('../utils/logger');

// In-memory active watchers: roomId -> { watcher, debounceTimer, isInternalWriteUntil }
const activeWatchers = new Map();

class WorkspaceWatcherService {
  /**
   * Get canonical workspace directory path for a room
   */
  getWorkspaceDir(roomId) {
    const base = process.env.WORKSPACE_ROOT || path.join(os.tmpdir(), 'synscript_workspaces');
    const sanitized = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(base, sanitized);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Recursively scan a workspace directory to build the normalized Room.files array.
   * Ignores node_modules, caches, build artifacts, dotfiles, and limits total items to prevent lag.
   */
  scanWorkspaceToFiles(workspaceDir) {
    const results = [];
    if (!fs.existsSync(workspaceDir)) return results;

    const maxFileSize = 250 * 1024; // 250 KB limit for inline text sync
    const maxTotalItems = 300;      // Hard limit to ensure sub-millisecond serialization

    function scan(currentDir, relativePrefix = '', depth = 0) {
      if (depth > 6 || results.length >= maxTotalItems) return;

      let entries = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (err) {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxTotalItems) break;

        const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

        // Skip ignored directories, files, or hidden system folders
        if (isPathIgnored(relPath) || isPathIgnored(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          results.push({
            path: relPath,
            name: entry.name,
            type: 'folder',
            content: '',
            isOpen: false,
          });

          scan(fullPath, relPath, depth + 1);
        } else if (entry.isFile()) {
          let content = '';
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size <= maxFileSize) {
              content = fs.readFileSync(fullPath, 'utf8');
            }
          } catch (readErr) {
            content = '';
          }

          results.push({
            path: relPath,
            name: entry.name,
            type: 'file',
            content,
            isOpen: true,
          });
        }
      }
    }

    scan(workspaceDir, '', 0);
    return results;
  }

  /**
   * Sync existing MongoDB files to disk on startup / room initialization asynchronously
   */
  async syncDatabaseFilesToDisk(roomId) {
    try {
      const workspaceDir = this.getWorkspaceDir(roomId);
      if (mongoose.connection.readyState !== 1) return workspaceDir;

      const room = await Room.findOne({ roomId }).select('files').lean();
      if (!room || !Array.isArray(room.files)) return workspaceDir;

      await Promise.all(
        room.files.map(async (f) => {
          if (!f || !f.path || isPathIgnored(f.path)) return;

          const targetPath = path.join(workspaceDir, f.path);

          try {
            if (f.type === 'folder') {
              await fs.promises.mkdir(targetPath, { recursive: true });
            } else {
              const parentDir = path.dirname(targetPath);
              await fs.promises.mkdir(parentDir, { recursive: true });
              
              // Only write if file doesn't exist or content differs
              let shouldWrite = true;
              try {
                const existing = await fs.promises.readFile(targetPath, 'utf8');
                if (existing === (f.content || '')) {
                  shouldWrite = false;
                }
              } catch (_) {
                shouldWrite = true;
              }

              if (shouldWrite) {
                await fs.promises.writeFile(targetPath, f.content || '', 'utf8');
              }
            }
          } catch (writeErr) {
            // non-fatal per-file write error
          }
        })
      );
      return workspaceDir;
    } catch (err) {
      logger.warn('WATCHER', `Failed to sync db files to disk for ${roomId}: ${err.message}`);
      return this.getWorkspaceDir(roomId);
    }
  }

  /**
   * Start watching a room's workspace directory for filesystem changes
   */
  startWatching(roomId, io) {
    if (!roomId || !io) return;
    if (activeWatchers.has(roomId)) return;

    const workspaceDir = this.getWorkspaceDir(roomId);
    logger.info('WATCHER', `Starting optimized workspace watcher for room ${roomId}`);

    const state = {
      watcher: null,
      debounceTimer: null,
      isInternalWriteUntil: 0,
    };

    const watcher = chokidar.watch(workspaceDir, {
      ignored: CHOKIDAR_IGNORED,
      ignoreInitial: true,
      persistent: true,
      depth: 6,
      usePolling: false,
    });

    const triggerSync = () => {
      // If internal editor write occurred recently, ignore watcher trigger
      if (Date.now() < state.isInternalWriteUntil) {
        return;
      }

      if (state.debounceTimer) clearTimeout(state.debounceTimer);

      state.debounceTimer = setTimeout(async () => {
        try {
          const files = this.scanWorkspaceToFiles(workspaceDir);
          logger.debug('WATCHER', `Filesystem change detected in ${roomId}, syncing ${files.length} items`);

          // Update MongoDB room files if connected
          if (mongoose.connection.readyState === 1) {
            await replaceRoomFiles(roomId, files);
          }

          // Broadcast to all clients in the room
          io.to(roomId).emit('WORKSPACE_FILES_SYNC', { roomId, files });
        } catch (err) {
          logger.error('WATCHER', `Error synchronizing workspace for ${roomId}: ${err.message}`);
        }
      }, 250);
    };

    watcher.on('add', triggerSync);
    watcher.on('change', triggerSync);
    watcher.on('unlink', triggerSync);
    watcher.on('addDir', triggerSync);
    watcher.on('unlinkDir', triggerSync);

    state.watcher = watcher;
    activeWatchers.set(roomId, state);
  }

  /**
   * Stop watching a room workspace (e.g. when room closes or has 0 users)
   */
  stopWatching(roomId) {
    const state = activeWatchers.get(roomId);
    if (!state) return;

    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    if (state.watcher) {
      try {
        state.watcher.close();
      } catch (err) {
        // ignore
      }
    }
    activeWatchers.delete(roomId);
    logger.info('WATCHER', `Stopped workspace watcher for room ${roomId}`);
  }

  /**
   * Suppress watcher echo when writing from Monaco editor / UI
   */
  markInternalWrite(roomId, durationMs = 500) {
    const state = activeWatchers.get(roomId);
    if (state) {
      state.isInternalWriteUntil = Date.now() + durationMs;
    }
  }

  /**
   * Write file change from Monaco editor to disk
   */
  writeFileFromEditor(roomId, filePath, content) {
    if (!roomId || !filePath || isPathIgnored(filePath)) return;
    try {
      this.markInternalWrite(roomId);
      const workspaceDir = this.getWorkspaceDir(roomId);
      const targetPath = path.join(workspaceDir, filePath);
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content || '', 'utf8');
    } catch (err) {
      logger.error('WATCHER', `Error writing file from editor ${filePath}: ${err.message}`);
    }
  }

  /**
   * Create file/folder from Explorer UI on disk
   */
  createItemFromEditor(roomId, item) {
    if (!roomId || !item || !item.path || isPathIgnored(item.path)) return;
    try {
      this.markInternalWrite(roomId);
      const workspaceDir = this.getWorkspaceDir(roomId);
      const targetPath = path.join(workspaceDir, item.path);

      if (item.type === 'folder') {
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
      } else {
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, item.content || '', 'utf8');
      }
    } catch (err) {
      logger.error('WATCHER', `Error creating item on disk ${item.path}: ${err.message}`);
    }
  }

  /**
   * Rename file/folder on disk
   */
  renameItemOnDisk(roomId, oldPath, newPath) {
    if (!roomId || !oldPath || !newPath) return;
    if (isPathIgnored(oldPath) && isPathIgnored(newPath)) return;
    try {
      this.markInternalWrite(roomId);
      const workspaceDir = this.getWorkspaceDir(roomId);
      const src = path.join(workspaceDir, oldPath);
      const dest = path.join(workspaceDir, newPath);
      if (fs.existsSync(src)) {
        const parentDir = path.dirname(dest);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.renameSync(src, dest);
      }
    } catch (err) {
      logger.error('WATCHER', `Error renaming item on disk from ${oldPath} to ${newPath}: ${err.message}`);
    }
  }

  /**
   * Delete file/folder on disk
   */
  deleteItemFromDisk(roomId, itemPath) {
    if (!roomId || !itemPath) return;
    try {
      this.markInternalWrite(roomId);
      const workspaceDir = this.getWorkspaceDir(roomId);
      const targetPath = path.join(workspaceDir, itemPath);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch (err) {
      logger.error('WATCHER', `Error deleting item on disk ${itemPath}: ${err.message}`);
    }
  }
}

module.exports = new WorkspaceWatcherService();
