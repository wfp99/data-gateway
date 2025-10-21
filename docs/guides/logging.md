# Logging Guide

Configure logging output with different log levels for debugging and monitoring.

## Log Levels

- `LogLevel.ALL` (0) - All messages
- `LogLevel.DEBUG` (10) - Debug and above
- `LogLevel.INFO` (20) - Info and above (default)
- `LogLevel.WARN` (30) - Warnings and errors only
- `LogLevel.ERROR` (40) - Errors only
- `LogLevel.OFF` (50) - Disable logging

## Configuration

### In DataGateway Config

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

const config = {
  logging: {
    level: LogLevel.INFO,
    format: 'pretty'  // 'pretty' or 'json'
  },
  providers: { /* ... */ },
  repositories: { /* ... */ }
};

const gateway = await DataGateway.build(config);
```

### Global Logger Configuration

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

// Configure logger
DataGateway.configureLogger({
  level: LogLevel.WARN,
  format: 'pretty'
});

// Or just set level
DataGateway.setLoggerLevel(LogLevel.ERROR);

// Get current level
const level = DataGateway.getLoggerLevel();
console.log(`Current level: ${LogLevel[level]}`);
```

### In Application Code

```typescript
import { getLogger } from '@wfp99/data-gateway';

const logger = getLogger('MyModule');

logger.debug('Debug message', { userId: 123 });
logger.info('Operation completed', { operation: 'createUser' });
logger.warn('Warning message', { configPath: '/path' });
logger.error('Error occurred', { error: 'timeout' });
```

## Environment-Specific Configuration

### Development (Verbose)

```typescript
const devConfig = {
  logging: {
    level: LogLevel.DEBUG,
    format: 'pretty'
  },
  // ...
};
```

### Production (Errors Only)

```typescript
const prodConfig = {
  logging: {
    level: LogLevel.ERROR,
    format: 'json'  // JSON for log analysis
  },
  // ...
};
```

### Dynamic Level Adjustment

```typescript
function setLogLevel(level: string) {
  const levelMap: Record<string, number> = {
    'debug': LogLevel.DEBUG,
    'info': LogLevel.INFO,
    'warn': LogLevel.WARN,
    'error': LogLevel.ERROR,
    'off': LogLevel.OFF
  };
  
  DataGateway.setLoggerLevel(levelMap[level.toLowerCase()] ?? LogLevel.INFO);
}

// Set from environment variable
setLogLevel(process.env.LOG_LEVEL || 'info');
```

## Best Practices

1. **Performance**: Use `LogLevel.WARN` or `LogLevel.ERROR` in production
2. **Security**: Never log passwords, tokens, or sensitive data
3. **Structure**: Use the `data` parameter for structured logging
4. **Context**: Create loggers with appropriate context per module
5. **Rotation**: Use external tools for log file rotation if needed

## Next Steps

- 📖 [Basic Usage](./basic-usage.md) - Learn core features
- 🏗️ [Architecture](../core/architecture.md) - Understand design
- 🔧 [Error Handling](../guides/basic-usage.md#error-handling) - Handle errors properly
