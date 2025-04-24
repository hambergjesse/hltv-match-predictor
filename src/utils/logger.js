import { LOG_CONFIG } from './config.js'; // Path updated (sibling in utils)

class Logger {
    constructor() {
        this.level = LOG_CONFIG.level;
        this.levels = LOG_CONFIG.levels;
    }

    _shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        // Simple string formatting
        const argsString = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' ');
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${args.length ? ' ' + argsString : ''}`;
    }

    error(message, ...args) {
        if (this._shouldLog('error')) {
            console.error(this._formatMessage('error', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this._shouldLog('warn')) {
            console.warn(this._formatMessage('warn', message, ...args));
        }
    }

    info(message, ...args) {
        if (this._shouldLog('info')) {
            console.info(this._formatMessage('info', message, ...args));
        }
    }

    debug(message, ...args) {
        if (this._shouldLog('debug')) {
            console.debug(this._formatMessage('debug', message, ...args));
        }
    }
}

export const logger = new Logger(); 