import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel, globalLogger, getLogger } from './logger';

describe('Logger', () => {
	let consoleSpy: {
		log: any;
		warn: any;
		error: any;
		debug: any;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, 'log').mockImplementation(() => {}),
			warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
			error: vi.spyOn(console, 'error').mockImplementation(() => {}),
			debug: vi.spyOn(console, 'debug').mockImplementation(() => {})
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// Reset global logger to default state
		globalLogger.configure({ level: LogLevel.INFO, console: true });
	});

	describe('LogLevel filtering', () => {
		it('should respect OFF level and not log anything', () => {
			const logger = new Logger({ level: LogLevel.OFF });

			logger.debug('debug message');
			logger.info('info message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.log).not.toHaveBeenCalled();
			expect(consoleSpy.warn).not.toHaveBeenCalled();
			expect(consoleSpy.error).not.toHaveBeenCalled();
			expect(consoleSpy.debug).not.toHaveBeenCalled();
		});

		it('should respect ERROR level and only log errors', () => {
			const logger = new Logger({ level: LogLevel.ERROR });

			logger.debug('debug message');
			logger.info('info message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.log).not.toHaveBeenCalled();
			expect(consoleSpy.warn).not.toHaveBeenCalled();
			expect(consoleSpy.debug).not.toHaveBeenCalled();
			expect(consoleSpy.error).toHaveBeenCalledOnce();
		});

		it('should respect WARN level and log warnings and errors', () => {
			const logger = new Logger({ level: LogLevel.WARN });

			logger.debug('debug message');
			logger.info('info message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.log).not.toHaveBeenCalled();
			expect(consoleSpy.debug).not.toHaveBeenCalled();
			expect(consoleSpy.warn).toHaveBeenCalledOnce();
			expect(consoleSpy.error).toHaveBeenCalledOnce();
		});

		it('should respect INFO level and log info, warnings and errors', () => {
			const logger = new Logger({ level: LogLevel.INFO });

			logger.debug('debug message');
			logger.info('info message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.debug).not.toHaveBeenCalled();
			expect(consoleSpy.log).toHaveBeenCalledOnce();
			expect(consoleSpy.warn).toHaveBeenCalledOnce();
			expect(consoleSpy.error).toHaveBeenCalledOnce();
		});

		it('should respect ALL/DEBUG level and log everything', () => {
			const logger = new Logger({ level: LogLevel.ALL });

			logger.debug('debug message');
			logger.info('info message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.debug).toHaveBeenCalledOnce();
			expect(consoleSpy.log).toHaveBeenCalledOnce();
			expect(consoleSpy.warn).toHaveBeenCalledOnce();
			expect(consoleSpy.error).toHaveBeenCalledOnce();
		});
	});

	describe('Context and data logging', () => {
		it('should include context in log output', () => {
			const logger = new Logger({ level: LogLevel.INFO });

			logger.info('test message', 'TestContext');

			expect(consoleSpy.log).toHaveBeenCalledWith(
				expect.stringContaining('[TestContext] test message')
			);
		});

		it('should include data in log output', () => {
			const logger = new Logger({ level: LogLevel.INFO });
			const testData = { key: 'value', number: 42 };

			logger.info('test message', undefined, testData);

			expect(consoleSpy.log).toHaveBeenCalledWith(
				expect.stringContaining(JSON.stringify(testData))
			);
		});

		it('should include both context and data', () => {
			const logger = new Logger({ level: LogLevel.INFO });
			const testData = { key: 'value' };

			logger.info('test message', 'TestContext', testData);

			const logCall = consoleSpy.log.mock.calls[0][0];
			expect(logCall).toContain('[TestContext] test message');
			expect(logCall).toContain(JSON.stringify(testData));
		});
	});

	describe('Configuration', () => {
		it('should allow configuration changes', () => {
			const logger = new Logger({ level: LogLevel.ERROR });

			logger.info('should not log');
			expect(consoleSpy.log).not.toHaveBeenCalled();

			logger.configure({ level: LogLevel.INFO });
			logger.info('should log now');
			expect(consoleSpy.log).toHaveBeenCalledOnce();
		});

		it('should disable console output when configured', () => {
			const logger = new Logger({ level: LogLevel.INFO, console: false });

			logger.info('test message');
			logger.warn('warn message');
			logger.error('error message');

			expect(consoleSpy.log).not.toHaveBeenCalled();
			expect(consoleSpy.warn).not.toHaveBeenCalled();
			expect(consoleSpy.error).not.toHaveBeenCalled();
		});

		it('should use custom handler when provided', () => {
			const customHandler = vi.fn();
			const logger = new Logger({ level: LogLevel.INFO, handler: customHandler });

			logger.info('test message', 'Context', { data: 'value' });

			expect(customHandler).toHaveBeenCalledWith({
				timestamp: expect.any(Date),
				level: LogLevel.INFO,
				message: 'test message',
				context: 'Context',
				data: { data: 'value' }
			});
			expect(consoleSpy.log).not.toHaveBeenCalled();
		});

		it('should use custom formatter when provided', () => {
			const customFormatter = vi.fn().mockReturnValue('CUSTOM FORMAT');
			const logger = new Logger({ level: LogLevel.INFO, formatter: customFormatter });

			logger.info('test message');

			expect(customFormatter).toHaveBeenCalledWith({
				timestamp: expect.any(Date),
				level: LogLevel.INFO,
				message: 'test message',
				context: undefined,
				data: undefined
			});
			expect(consoleSpy.log).toHaveBeenCalledWith('CUSTOM FORMAT');
		});
	});

	describe('Global logger', () => {
		it('should have a global logger instance', () => {
			expect(globalLogger).toBeInstanceOf(Logger);
		});

		it('should allow global logger configuration', () => {
			globalLogger.configure({ level: LogLevel.ERROR });

			globalLogger.info('should not log');
			expect(consoleSpy.log).not.toHaveBeenCalled();

			globalLogger.error('should log');
			expect(consoleSpy.error).toHaveBeenCalledOnce();
		});
	});

	describe('getLogger helper', () => {
		it('should create a logger with context', () => {
			const logger = getLogger('TestModule');

			logger.info('test message');

			expect(consoleSpy.log).toHaveBeenCalledWith(
				expect.stringContaining('[TestModule] test message')
			);
		});

		it('should create a logger without context', () => {
			const logger = getLogger();

			logger.info('test message');

			expect(consoleSpy.log).toHaveBeenCalledWith(
				expect.stringContaining('test message')
			);
			expect(consoleSpy.log).toHaveBeenCalledWith(
				expect.not.stringContaining('[')
			);
		});
	});

	describe('Level management', () => {
		it('should get and set log level', () => {
			const logger = new Logger({ level: LogLevel.WARN });

			expect(logger.getLevel()).toBe(LogLevel.WARN);

			logger.setLevel(LogLevel.DEBUG);
			expect(logger.getLevel()).toBe(LogLevel.DEBUG);
		});
	});
});