/**
 * @file Logger utility for DataGateway with configurable log levels.
 */

/**
 * Available log levels in order of priority (from lowest to highest).
 */
export enum LogLevel {
	/** Log all messages (debug, info, warn, error) */
	ALL = 0,
	/** Log debug, info, warn and error messages */
	DEBUG = 10,
	/** Log info, warn and error messages */
	INFO = 20,
	/** Log warn and error messages only */
	WARN = 30,
	/** Log error messages only */
	ERROR = 40,
	/** Disable all logging */
	OFF = 50
}

/**
 * Log entry structure.
 */
export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	message: string;
	context?: string;
	data?: any;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
	/** The minimum log level to output (default: INFO) */
	level?: LogLevel;
	/** Whether to output logs to console (default: true) */
	console?: boolean;
	/** Custom log formatter function */
	formatter?: (entry: LogEntry) => string;
	/** Custom log handler function */
	handler?: (entry: LogEntry) => void;
}

/**
 * Default log formatter that creates human-readable log output.
 */
const defaultFormatter = (entry: LogEntry): string => {
	const timestamp = entry.timestamp.toISOString();
	const level = LogLevel[entry.level].padEnd(5);
	const context = entry.context ? `[${entry.context}] ` : '';
	const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
	return `${timestamp} ${level} ${context}${entry.message}${data}`;
};

/**
 * Logger class for DataGateway with configurable log levels and output options.
 */
export class Logger {
	private config: Required<LoggerConfig>;

	constructor(config: LoggerConfig = {}) {
		this.config = {
			level: config.level ?? LogLevel.INFO,
			console: config.console ?? true,
			formatter: config.formatter ?? defaultFormatter,
			handler: config.handler ?? this.defaultHandler.bind(this)
		};
	}

	/**
	 * Updates the logger configuration.
	 */
	configure(config: Partial<LoggerConfig>): void {
		this.config = {
			...this.config,
			...config,
			formatter: config.formatter ?? this.config.formatter,
			handler: config.handler ?? this.config.handler
		};
	}

	/**
	 * Gets the current log level.
	 */
	getLevel(): LogLevel {
		return this.config.level;
	}

	/**
	 * Sets the log level.
	 */
	setLevel(level: LogLevel): void {
		this.config.level = level;
	}

	/**
	 * Checks if a log level should be output based on current configuration.
	 */
	private shouldLog(level: LogLevel): boolean {
		return this.config.level !== LogLevel.OFF && level >= this.config.level;
	}

	/**
	 * Default log handler that outputs to console.
	 */
	private defaultHandler(entry: LogEntry): void {
		if (!this.config.console) return;

		const formatted = this.config.formatter(entry);

		switch (entry.level) {
			case LogLevel.ERROR:
				console.error(formatted);
				break;
			case LogLevel.WARN:
				console.warn(formatted);
				break;
			case LogLevel.DEBUG:
				console.debug(formatted);
				break;
			default:
				console.log(formatted);
				break;
		}
	}

	/**
	 * Core logging method.
	 */
	private log(level: LogLevel, message: string, context?: string, data?: any): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			message,
			context,
			data
		};

		this.config.handler(entry);
	}

	/**
	 * Logs a debug message.
	 */
	debug(message: string, context?: string, data?: any): void {
		this.log(LogLevel.DEBUG, message, context, data);
	}

	/**
	 * Logs an info message.
	 */
	info(message: string, context?: string, data?: any): void {
		this.log(LogLevel.INFO, message, context, data);
	}

	/**
	 * Logs a warning message.
	 */
	warn(message: string, context?: string, data?: any): void {
		this.log(LogLevel.WARN, message, context, data);
	}

	/**
	 * Logs an error message.
	 */
	error(message: string, context?: string, data?: any): void {
		this.log(LogLevel.ERROR, message, context, data);
	}
}

/**
 * Global logger instance for DataGateway.
 */
export const globalLogger = new Logger();

/**
 * Convenience function to get or create a logger with a specific context.
 */
export function getLogger(context?: string): {
	debug: (message: string, data?: any) => void;
	info: (message: string, data?: any) => void;
	warn: (message: string, data?: any) => void;
	error: (message: string, data?: any) => void;
} {
	return {
		debug: (message: string, data?: any) => globalLogger.debug(message, context, data),
		info: (message: string, data?: any) => globalLogger.info(message, context, data),
		warn: (message: string, data?: any) => globalLogger.warn(message, context, data),
		error: (message: string, data?: any) => globalLogger.error(message, context, data)
	};
}