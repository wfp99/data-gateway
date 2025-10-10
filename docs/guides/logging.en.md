# Logging Functionality Guide

DataGateway now supports configurable logging output with different log levels for debugging and monitoring purposes.

## Log Levels

The system supports the following log levels (in order of priority):

- `LogLevel.ALL` (0) - Log all messages (debug, info, warn, error)
- `LogLevel.DEBUG` (10) - Log debug, info, warn, and error messages
- `LogLevel.INFO` (20) - Log info, warn, and error messages (default level)
- `LogLevel.WARN` (30) - Log only warn and error messages
- `LogLevel.ERROR` (40) - Log only error messages
- `LogLevel.OFF` (50) - Disable all logging

## Basic Usage

### 1. Configure Logging in DataGateway Config

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

const config = {
  // Configure logging
  logging: {
    level: LogLevel.INFO,     // Set log level
    console: true            // Output to console (default: true)
  },

  providers: {
    // ... your provider configuration
  },

  repositories: {
    // ... your repository configuration
  }
};

const gateway = await DataGateway.build(config);
```

### 2. Use Global Logger Configuration

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

// Configure global logger directly
DataGateway.configureLogger({
  level: LogLevel.WARN,
  console: true
});

// Or just set the log level
DataGateway.setLoggerLevel(LogLevel.ERROR);

// Get current log level
const currentLevel = DataGateway.getLoggerLevel();
console.log(`Current log level: ${LogLevel[currentLevel]}`);
```

### 3. Use Logger in Application Code

```typescript
import { getLogger } from '@wfp99/data-gateway';

// Create a logger with context
const logger = getLogger('MyModule');

// Log messages at different levels
logger.debug('Debug message', { userId: 123 });
logger.info('Operation completed', { operation: 'createUser' });
logger.warn('Warning: Config file missing', { configPath: '/path/to/config' });
logger.error('Error: Database connection failed', { error: 'Connection timeout' });
```

### 4. Custom Log Formatter

```typescript
import { Logger, LogLevel } from '@wfp99/data-gateway';

const customLogger = new Logger({
  level: LogLevel.INFO,
  console: true,

  // Custom formatter function
  formatter: (entry) => {
    const time = entry.timestamp.toLocaleTimeString();
    const level = LogLevel[entry.level];
    const context = entry.context ? `[${entry.context}] ` : '';
    return `${time} ${level}: ${context}${entry.message}`;
  }
});

customLogger.info('Custom formatted log message', 'CustomContext');
```

### 5. Custom Log Handler

```typescript
import { Logger, LogLevel } from '@wfp99/data-gateway';
import fs from 'fs';

const fileLogger = new Logger({
  level: LogLevel.INFO,
  console: false,  // Don't output to console

  // Custom handler, e.g., write to file
  handler: (entry) => {
    const logMessage = `${entry.timestamp.toISOString()} [${LogLevel[entry.level]}] ${entry.message}`;

    // You can implement file writing, sending to remote logging service, etc.
    fs.appendFileSync('app.log', logMessage + '\n');
  }
});
```

## Practical Examples

### Development Environment Configuration (Verbose Logging)

```typescript
const devConfig = {
  logging: {
    level: LogLevel.DEBUG,
    console: true
  },
  providers: {
    db: {
      type: 'sqlite',
      options: { database: ':memory:' }
    }
  },
  repositories: {
    users: {
      provider: 'db',
      table: 'users'
    }
  }
};

const gateway = await DataGateway.build(devConfig);
```

### Production Environment Configuration (Error-only Logging)

```typescript
const prodConfig = {
  logging: {
    level: LogLevel.ERROR,
    console: true,

    // In production, you might use a custom handler to send to monitoring service
    handler: (entry) => {
      if (entry.level >= LogLevel.ERROR) {
        // Send to error monitoring service
        sendToErrorMonitoring(entry);
      }
    }
  },
  providers: {
    // ... production configuration
  },
  repositories: {
    // ... production configuration
  }
};
```

### Dynamic Log Level Adjustment

```typescript
// Dynamically adjust log level at runtime
function setLogLevel(level: string) {
  switch (level.toLowerCase()) {
    case 'debug':
    case 'all':
      DataGateway.setLoggerLevel(LogLevel.ALL);
      break;
    case 'info':
      DataGateway.setLoggerLevel(LogLevel.INFO);
      break;
    case 'warn':
    case 'warning':
      DataGateway.setLoggerLevel(LogLevel.WARN);
      break;
    case 'error':
      DataGateway.setLoggerLevel(LogLevel.ERROR);
      break;
    case 'off':
      DataGateway.setLoggerLevel(LogLevel.OFF);
      break;
    default:
      console.warn(`Unknown log level: ${level}`);
  }
}

// For example, set via environment variable
setLogLevel(process.env.LOG_LEVEL || 'info');
```

## Best Practices

1. **Performance Considerations**: In production environments, consider using `LogLevel.WARN` or `LogLevel.ERROR` to avoid excessive logging that could impact performance.

2. **Sensitive Data**: Avoid logging sensitive data such as passwords, tokens, or personal information.

3. **Structured Logging**: Use the `data` parameter to pass structured data for better log analysis and querying.

4. **Context Information**: Create loggers with appropriate context for each module or feature.

5. **Log Rotation**: When using custom handlers in production, remember to implement log rotation to prevent log files from becoming too large.

## API Reference

### Logger Class

```typescript
class Logger {
  constructor(config?: LoggerConfig)
  configure(config: Partial<LoggerConfig>): void
  getLevel(): LogLevel
  setLevel(level: LogLevel): void
  debug(message: string, context?: string, data?: any): void
  info(message: string, context?: string, data?: any): void
  warn(message: string, context?: string, data?: any): void
  error(message: string, context?: string, data?: any): void
}
```

### LoggerConfig Interface

```typescript
interface LoggerConfig {
  level?: LogLevel;
  console?: boolean;
  formatter?: (entry: LogEntry) => string;
  handler?: (entry: LogEntry) => void;
}
```

### Global Functions

```typescript
// Get a logger with optional context
function getLogger(context?: string): ContextLogger

// Global logger instance
const globalLogger: Logger

// DataGateway static methods
DataGateway.configureLogger(config: LoggerConfig): void
DataGateway.getLoggerLevel(): LogLevel
DataGateway.setLoggerLevel(level: LogLevel): void
```