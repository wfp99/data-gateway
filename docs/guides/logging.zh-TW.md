# 日誌功能指南

配置不同日誌級別以便於調試和監控。

## 日誌級別

- `LogLevel.ALL` (0) - 所有訊息
- `LogLevel.DEBUG` (10) - Debug 及以上
- `LogLevel.INFO` (20) - Info 及以上（預設）
- `LogLevel.WARN` (30) - 僅警告和錯誤
- `LogLevel.ERROR` (40) - 僅錯誤
- `LogLevel.OFF` (50) - 關閉日誌

## 設定方式

### 在 DataGateway 設定中

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

const config = {
  logging: {
    level: LogLevel.INFO,
    format: 'pretty'  // 'pretty' 或 'json'
  },
  providers: { /* ... */ },
  repositories: { /* ... */ }
};

const gateway = await DataGateway.build(config);
```

### 全域日誌設定

```typescript
import { DataGateway, LogLevel } from '@wfp99/data-gateway';

// 配置日誌
DataGateway.configureLogger({
  level: LogLevel.WARN,
  format: 'pretty'
});

// 或僅設定級別
DataGateway.setLoggerLevel(LogLevel.ERROR);

// 取得目前級別
const level = DataGateway.getLoggerLevel();
console.log(`目前級別: ${LogLevel[level]}`);
```

### 在應用程式中使用

```typescript
import { getLogger } from '@wfp99/data-gateway';

const logger = getLogger('MyModule');

logger.debug('調試訊息', { userId: 123 });
logger.info('操作完成', { operation: 'createUser' });
logger.warn('警告訊息', { configPath: '/path' });
logger.error('發生錯誤', { error: 'timeout' });
```

## 環境別設定

### 開發環境（詳細日誌）

```typescript
const devConfig = {
  logging: {
    level: LogLevel.DEBUG,
    format: 'pretty'
  },
  // ...
};
```

### 生產環境（僅錯誤）

```typescript
const prodConfig = {
  logging: {
    level: LogLevel.ERROR,
    format: 'json'  // 使用 JSON 格式便於分析
  },
  // ...
};
```

### 動態調整級別

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

// 從環境變數設定
setLogLevel(process.env.LOG_LEVEL || 'info');
```

## 最佳實務

1. **效能**：生產環境使用 `LogLevel.WARN` 或 `LogLevel.ERROR`
2. **安全**：避免記錄密碼、令牌等敏感資料
3. **結構化**：使用 `data` 參數傳遞結構化資料
4. **上下文**：為每個模組建立具有適當上下文的日誌記錄器
5. **輪替**：若需寫入檔案，使用外部工具進行日誌輪替

## 下一步

- 📖 [基本使用](./basic-usage.zh-TW.md) - 了解核心功能
- 🏗️ [架構設計](../core/architecture.zh-TW.md) - 理解設計概念
- 🔧 [錯誤處理](../guides/basic-usage.zh-TW.md#錯誤處理) - 正確處理錯誤
