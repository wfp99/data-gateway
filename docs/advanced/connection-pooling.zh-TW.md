# 連線池管理

Data Gateway 支援連線池功能，能有效提升效能和資源管理效率。對於需要處理大量資料庫操作的高流量應用程式特別有用。

## 概述

連線池允許多個資料庫連線被重複使用於不同的查詢操作，減少建立和關閉連線的開銷。這對以下情況特別重要：

- 高併發應用程式
- 頻繁進行資料庫操作的應用程式
- 有效能要求的生產環境

## 支援的提供者

### MySQL Provider

MySQL 提供者使用 `mysql2` 連線池提供完整的連線池功能：

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'myapp',
        pool: {
          usePool: true,              // 啟用連線池（預設：true）
          connectionLimit: 10,        // 連線池最大連線數（預設：10）
          queueLimit: 0,             // 最大排隊連線請求數（預設：0，無限制）
          acquireTimeout: 60000,     // 取得連線超時時間（預設：60000ms）
          timeout: 600000,           // 閒置連線超時時間（預設：600000ms）
          preConnect: false,         // 啟動時測試連線池（預設：false）
        }
      } as MySQLProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
```

### PostgreSQL Provider

PostgreSQL 提供者使用 `pg` 連線池提供企業級連線池功能：

```typescript
import { DataGateway, PostgreSQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    postgresql: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        user: 'postgres',
        password: 'password',
        database: 'myapp',
        port: 5432,
        pool: {
          usePool: true,                    // 啟用連線池（預設：true）
          max: 20,                         // 連線池最大連線數（預設：10）
          min: 5,                          // 維持的最小連線數（預設：0）
          idleTimeoutMillis: 30000,        // 閒置連線超時（預設：10000ms）
          connectionTimeoutMillis: 60000,  // 連線取得超時（預設：30000ms）
          allowExitOnIdle: false,          // 閒置時允許退出（預設：false）
        }
      } as PostgreSQLProviderOptions
    }
  },
  repositories: {
    order: { provider: 'postgresql', table: 'orders' }
  }
};

const gateway = await DataGateway.build(config);
```

### SQLite Provider

SQLite 提供者支援基本的連線管理，針對讀取操作提供多個連線：

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',
        pool: {
          usePool: true,              // 啟用讀取連線池（預設：false）
          maxReadConnections: 5,      // 最大唯讀連線數（預設：3）
          enableWAL: true,           // 啟用 WAL 模式提升併發性（預設：啟用池時為 true）
        }
      } as SQLiteProviderOptions
    }
  },
  repositories: {
    log: { provider: 'sqlite', table: 'logs' }
  }
};

const gateway = await DataGateway.build(config);
```

**注意**: SQLite 對併發寫入有固有限制，因此 SQLite 提供者使用：
- 一個主要連線處理所有寫入操作（INSERT、UPDATE、DELETE）
- 多個唯讀連線處理 SELECT 操作（當啟用池時）
- WAL（Write-Ahead Logging）模式提升併發性

### Remote Provider

Remote 提供者透過 HTTP/HTTPS 操作，不支援連線池：

```typescript
const remoteProvider = new RemoteProvider({
  endpoint: 'https://api.example.com/data'
});

console.log(remoteProvider.supportsConnectionPooling()); // false
```

## 監控連線池狀態

您可以監控連線池狀態來了解資源使用情況：

```typescript
// 取得特定提供者的連線池狀態
const mysqlPoolStatus = gateway.getProviderPoolStatus('mysql');
if (mysqlPoolStatus) {
  console.log(`MySQL 連線池 - 總計: ${mysqlPoolStatus.totalConnections}, 使用中: ${mysqlPoolStatus.activeConnections}, 閒置: ${mysqlPoolStatus.idleConnections}`);
}

// 取得所有提供者的連線池狀態
const allStatuses = gateway.getAllPoolStatuses();
for (const [providerName, status] of allStatuses) {
  console.log(`${providerName}: ${status.activeConnections}/${status.maxConnections} 個連線使用中`);
}

// 檢查提供者是否支援連線池
const provider = gateway.getProvider('mysql');
if (provider?.supportsConnectionPooling?.()) {
  console.log('提供者支援連線池');
}
```

## 連線池狀態介面

`ConnectionPoolStatus` 介面提供詳細的連線池狀態資訊：

```typescript
interface ConnectionPoolStatus {
  totalConnections: number;    // 連線池中的總連線數
  idleConnections: number;     // 閒置連線數
  activeConnections: number;   // 使用中連線數
  maxConnections: number;      // 最大允許連線數
  minConnections?: number;     // 維持的最小閒置連線數
}
```

## 最佳實務

### MySQL 設定

1. **連線限制**: 根據資料庫伺服器的 `max_connections` 設定和應用程式負載設定 `connectionLimit`
2. **排隊限制**: 使用 `queueLimit` 防止無限制的連線請求排隊
3. **超時設定**: 為應用程式需求設定適當的 `acquireTimeout` 和 `timeout` 值
4. **預先連線**: 在生產環境啟用 `preConnect` 提早發現連線問題

```typescript
// 生產環境設定範例
pool: {
  usePool: true,
  connectionLimit: 20,        // 基於資料庫容量
  queueLimit: 100,           // 防止記憶體問題
  acquireTimeout: 30000,     // 30 秒
  timeout: 300000,           // 5 分鐘閒置超時
  preConnect: true,          // 啟動時測試
}
```

### PostgreSQL 設定

1. **連線數量**: 根據預期併發負載設定 `max` 和 `min`
2. **超時管理**: 設定適當的 `idleTimeoutMillis` 和 `connectionTimeoutMillis`
3. **資源效率**: 在低負載環境減少 `min` 值節省資源

```typescript
// 高併發設定範例
pool: {
  max: 50,                        // 增加最大連線數
  min: 10,                        // 維持最小連線數
  idleTimeoutMillis: 60000,       // 較長的閒置超時
  connectionTimeoutMillis: 10000, // 較短的連線超時
}

// 低負載設定範例
pool: {
  max: 5,                         // 較少的最大連線數
  min: 1,                         // 最小連線數
  idleTimeoutMillis: 10000,       // 較短的閒置超時
}
```

### SQLite 設定

1. **讀取連線**: 根據預期併發讀取負載設定 `maxReadConnections`
2. **WAL 模式**: 保持 `enableWAL: true` 以獲得更好的併發性
3. **檔案位置**: 在生產環境使用絕對路徑

```typescript
// 生產環境設定範例
pool: {
  usePool: true,
  maxReadConnections: 5,     // 基於讀取併發需求
  enableWAL: true,          // 併發存取必備
}
```

## 從單一連線遷移

現有的無連線池設定的配置會繼續正常工作。要啟用連線池：

### MySQL 遷移

```typescript
// 之前（單一連線）
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    user: 'root',
    database: 'myapp'
  }
}

// 之後（含連線池）
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    user: 'root',
    database: 'myapp',
    pool: {
      usePool: true,
      connectionLimit: 10
    }
  }
}
```

### SQLite 遷移

```typescript
// 之前（單一連線）
sqlite: {
  type: 'sqlite',
  options: {
    filename: './database.db'
  }
}

// 之後（含讀取連線池）
sqlite: {
  type: 'sqlite',
  options: {
    filename: './database.db',
    pool: {
      usePool: true,
      maxReadConnections: 3
    }
  }
}
```

## 錯誤處理

連線池錯誤會被優雅地處理：

- **連線池耗盡**: 請求會排隊至 `queueLimit`（MySQL）
- **超時錯誤**: 當超過 `acquireTimeout` 時拋出
- **連線失敗**: 個別連線失敗不會影響整個連線池
- **優雅關閉**: `disconnectAll()` 會正確關閉所有池中連線

## 效能考量

- **連線池大小**: 從較小的連線池開始，基於監控結果增加
- **監控**: 定期檢查連線池狀態確保最佳資源使用
- **資源清理**: 應用程式關閉時總是呼叫 `disconnectAll()`

```typescript
// 優雅關閉範例
process.on('SIGTERM', async () => {
  await gateway.disconnectAll();
  process.exit(0);
});
```

## 進階連線池設定

### 動態連線池調整

```typescript
// 根據時間動態調整連線池（範例概念）
const isDaytime = new Date().getHours() > 8 && new Date().getHours() < 18;

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        // ... 其他設定
        pool: {
          usePool: true,
          connectionLimit: isDaytime ? 20 : 5,  // 白天更多連線
          timeout: isDaytime ? 30000 : 60000,   // 白天較短超時
        }
      }
    }
  }
};
```

### 連線池健康監控

```typescript
async function monitorPoolHealth(gateway: DataGateway) {
  const allStatuses = gateway.getAllPoolStatuses();

  for (const [providerName, status] of allStatuses) {
    const utilizationRate = status.activeConnections / status.maxConnections;

    if (utilizationRate > 0.8) {
      console.warn(`警告: ${providerName} 連線池使用率過高 (${Math.round(utilizationRate * 100)}%)`);
    }

    if (status.idleConnections === 0 && status.activeConnections === status.maxConnections) {
      console.error(`錯誤: ${providerName} 連線池已滿，可能需要增加容量`);
    }
  }
}

// 定期監控
setInterval(() => monitorPoolHealth(gateway), 30000); // 每 30 秒檢查一次
```