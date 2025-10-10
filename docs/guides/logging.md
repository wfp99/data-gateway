# 日誌功能使用指南

DataGateway 現在支援可配置的日誌輸出功能，提供不同的日誌級別以便於調試和監控。

## 日誌級別

系統支援以下日誌級別（按優先級排序）：

- `LogLevel.ALL` (0) - 記錄所有訊息（debug、info、warn、error）
- `LogLevel.DEBUG` (10) - 記錄 debug、info、warn、error 訊息
- `LogLevel.INFO` (20) - 記錄 info、warn、error 訊息（預設級別）
- `LogLevel.WARN` (30) - 僅記錄 warn 和 error 訊息
- `LogLevel.ERROR` (40) - 僅記錄 error 訊息
- `LogLevel.OFF` (50) - 關閉所有日誌

## 基本使用

### 1. 在 DataGateway 配置中設定日誌

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

const config = {
  // 配置日誌
  logging: {
    level: LogLevel.INFO,     // 設定日誌級別
    console: true            // 是否輸出到控制台（預設：true）
  },

  providers: {
    // ... 你的 provider 配置
  },

  repositories: {
    // ... 你的 repository 配置
  }
};

const gateway = await DataGateway.build(config);
```

### 2. 使用全域日誌設定

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

// 直接配置全域日誌
DataGateway.configureLogger({
  level: LogLevel.WARN,
  console: true
});

// 或者只設定日誌級別
DataGateway.setLoggerLevel(LogLevel.ERROR);

// 取得目前日誌級別
const currentLevel = DataGateway.getLoggerLevel();
console.log(`目前日誌級別: ${LogLevel[currentLevel]}`);
```

### 3. 在應用程式中使用日誌

```typescript
import { getLogger } from '@wfp99/data-gateway';

// 建立具有上下文的日誌記錄器
const logger = getLogger('MyModule');

// 記錄不同級別的訊息
logger.debug('調試訊息', { userId: 123 });
logger.info('操作完成', { operation: 'createUser' });
logger.warn('警告：配置檔案不存在', { configPath: '/path/to/config' });
logger.error('錯誤：資料庫連線失敗', { error: 'Connection timeout' });
```

### 4. 自訂日誌格式

```typescript
import { Logger, LogLevel } from '@wfp99/data-gateway';

const customLogger = new Logger({
  level: LogLevel.INFO,
  console: true,

  // 自訂格式化函數
  formatter: (entry) => {
    const time = entry.timestamp.toLocaleTimeString();
    const level = LogLevel[entry.level];
    const context = entry.context ? `[${entry.context}] ` : '';
    return `${time} ${level}: ${context}${entry.message}`;
  }
});

customLogger.info('自訂格式的日誌訊息', 'CustomContext');
```

### 5. 自訂日誌處理器

```typescript
import { Logger, LogLevel } from '@wfp99/data-gateway';

const fileLogger = new Logger({
  level: LogLevel.INFO,
  console: false,  // 不輸出到控制台

  // 自訂處理器，例如寫入檔案
  handler: (entry) => {
    const logMessage = `${entry.timestamp.toISOString()} [${LogLevel[entry.level]}] ${entry.message}`;

    // 這裡可以實作寫入檔案、發送到遠端日誌服務等
    fs.appendFileSync('app.log', logMessage + '\n');
  }
});
```

## 實際範例

### 開發環境配置（詳細日誌）

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

### 生產環境配置（僅錯誤日誌）

```typescript
const prodConfig = {
  logging: {
    level: LogLevel.ERROR,
    console: true,

    // 生產環境可能會使用自訂處理器發送到日誌監控服務
    handler: (entry) => {
      if (entry.level >= LogLevel.ERROR) {
        // 發送到錯誤監控服務
        sendToErrorMonitoring(entry);
      }
    }
  },
  providers: {
    // ... 生產環境配置
  },
  repositories: {
    // ... 生產環境配置
  }
};
```

### 動態調整日誌級別

```typescript
// 應用程式運行時動態調整日誌級別
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
      console.warn(`未知的日誌級別: ${level}`);
  }
}

// 例如通過環境變數設定
setLogLevel(process.env.LOG_LEVEL || 'info');
```

## 注意事項

1. **效能考量**：在生產環境中，建議使用 `LogLevel.WARN` 或 `LogLevel.ERROR` 以避免過多的日誌輸出影響效能。

2. **敏感資料**：避免在日誌中記錄敏感資料如密碼、令牌等。

3. **結構化日誌**：使用 `data` 參數傳遞結構化資料，有助於日誌分析和查詢。

4. **上下文資訊**：建議為每個模組或功能建立具有適當上下文的日誌記錄器。

5. **日誌輪替**：在生產環境中使用自訂處理器時，記得實作日誌輪替以避免日誌檔案過大。