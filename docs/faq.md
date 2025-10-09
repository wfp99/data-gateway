# 常見問題 FAQ

本文件收集了 Data Gateway 使用過程中的常見問題和解答。

## 安裝與設定

### Q: 為什麼安裝後報錯找不到資料庫驅動程式？

**A:** Data Gateway 使用懶載入機制，您需要手動安裝對應的資料庫驅動程式：

```bash
# MySQL
npm install mysql2

# PostgreSQL
npm install pg @types/pg

# SQLite
npm install sqlite sqlite3
```

如果您只使用 Remote API Provider，則不需要安裝任何額外的驅動程式。

### Q: Node.js 版本要求是什麼？

**A:** Data Gateway 要求 Node.js 18.0.0 或更高版本。您可以用以下命令檢查版本：

```bash
node --version
```

如果版本過低，請升級到支援的版本。

### Q: 如何在 TypeScript 專案中使用？

**A:** Data Gateway 內建 TypeScript 支援，直接導入即可：

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

// 使用泛型指定資料類型
interface User {
  id: number;
  name: string;
  email: string;
}

const userRepo = gateway.getRepository<User>('users');
```

## 連線與Provider

### Q: 為什麼連線失敗？

**A:** 常見的連線失敗原因和解決方法：

1. **資料庫伺服器未運行**
   ```bash
   # 檢查 MySQL
   sudo systemctl status mysql

   # 檢查 PostgreSQL
   sudo systemctl status postgresql
   ```

2. **連線參數錯誤**
   ```typescript
   // 檢查主機、埠、使用者名稱、密碼是否正確
   const config = {
     providers: {
       mysql: {
         type: 'mysql',
         options: {
           host: 'localhost',  // 確認主機地址
           port: 3306,         // 確認埠號
           user: 'root',       // 確認使用者名稱
           password: 'correct_password',  // 確認密碼
           database: 'existing_database'  // 確認資料庫存在
         }
       }
     }
   };
   ```

3. **防火牆阻擋**
   - 檢查資料庫伺服器防火牆設定
   - 確認資料庫允許遠端連線

### Q: 如何設定 SSL 連線？

**A:** 各 Provider 的 SSL 設定方法：

```typescript
// MySQL SSL
mysql: {
  type: 'mysql',
  options: {
    host: 'secure-db.example.com',
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}

// PostgreSQL SSL
postgresql: {
  type: 'postgresql',
  options: {
    host: 'secure-db.example.com',
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('server-ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}
```

### Q: 可以同時使用多個相同類型的 Provider 嗎？

**A:** 可以，您可以配置多個相同類型但連接不同資料庫的 Provider：

```typescript
const config = {
  providers: {
    mainDB: {
      type: 'mysql',
      options: { host: 'main-db.example.com', database: 'main' }
    },
    analyticsDB: {
      type: 'mysql',
      options: { host: 'analytics-db.example.com', database: 'analytics' }
    },
    userDB: {
      type: 'postgresql',
      options: { host: 'user-db.example.com', database: 'users' }
    },
    orderDB: {
      type: 'postgresql',
      options: { host: 'order-db.example.com', database: 'orders' }
    }
  },
  repositories: {
    users: { provider: 'userDB', table: 'users' },
    orders: { provider: 'orderDB', table: 'orders' },
    products: { provider: 'mainDB', table: 'products' },
    analytics: { provider: 'analyticsDB', table: 'user_analytics' }
  }
};
```

## 連線池

### Q: 連線池的最佳設定是什麼？

**A:** 連線池設定應根據您的具體需求調整：

```typescript
// 高流量生產環境
pool: {
  usePool: true,
  connectionLimit: 20,      // 根據資料庫 max_connections 調整
  queueLimit: 100,         // 防止無限排隊
  acquireTimeout: 30000,   // 30 秒超時
  timeout: 300000,         // 5 分鐘閒置超時
  preConnect: true         // 啟動時預先測試連線
}

// 開發環境
pool: {
  usePool: true,
  connectionLimit: 5,
  acquireTimeout: 60000,
  timeout: 600000
}

// 低負載環境
pool: {
  usePool: false  // 可以停用連線池使用單一連線
}
```

### Q: 如何監控連線池狀態？

**A:** 使用內建的監控方法：

```typescript
// 取得特定 Provider 的連線池狀態
const status = gateway.getProviderPoolStatus('mysql');
if (status) {
  console.log(`使用中: ${status.activeConnections}/${status.maxConnections}`);
  console.log(`閒置: ${status.idleConnections}`);
}

// 監控所有連線池
const allStatuses = gateway.getAllPoolStatuses();
for (const [name, status] of allStatuses) {
  const utilization = (status.activeConnections / status.maxConnections * 100).toFixed(1);
  console.log(`${name}: ${utilization}% 使用率`);
}

// 設定定期監控
setInterval(() => {
  const statuses = gateway.getAllPoolStatuses();
  for (const [name, status] of statuses) {
    if (status.activeConnections / status.maxConnections > 0.8) {
      console.warn(`警告: ${name} 連線池使用率過高`);
    }
  }
}, 30000);
```

### Q: SQLite 為什麼連線池功能有限？

**A:** SQLite 的架構特性決定了其連線池限制：

- **寫入限制**: SQLite 同時只能有一個寫入操作，因此寫入操作使用單一連線
- **讀取優化**: 可以使用多個讀取連線提升併發讀取效能
- **WAL 模式**: 啟用 WAL 模式可以改善讀寫併發性

```typescript
sqlite: {
  type: 'sqlite',
  options: {
    filename: './database.db',
    pool: {
      usePool: true,              // 啟用讀取連線池
      maxReadConnections: 3,      // 最多 3 個讀取連線
      enableWAL: true            // 啟用 WAL 模式
    }
  }
}
```

## 查詢與資料操作

### Q: 如何執行複雜的 JOIN 查詢？

**A:** 目前版本的 Data Gateway 主要專注於單表操作。如需複雜 JOIN，建議：

1. **分別查詢後在應用層合併**
   ```typescript
   // 分別查詢
   const users = await userRepo.findMany();
   const orders = await orderRepo.findMany({ field: 'user_id', op: 'IN', values: userIds });

   // 應用層合併
   const usersWithOrders = users.map(user => ({
     ...user,
     orders: orders.filter(order => order.user_id === user.id)
   }));
   ```

2. **使用資料庫視圖 (View)**
   ```sql
   CREATE VIEW user_order_summary AS
   SELECT u.id, u.name, COUNT(o.id) as order_count
   FROM users u LEFT JOIN orders o ON u.id = o.user_id
   GROUP BY u.id, u.name;
   ```

   ```typescript
   // 查詢視圖
   const summaryRepo = gateway.getRepository('user_order_summary');
   const summary = await summaryRepo.findMany();
   ```

### Q: 如何處理大結果集？

**A:** 使用分頁和流式處理：

```typescript
// 分頁處理
async function processLargeDataset() {
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await userRepo.find({
      limit: pageSize,
      offset: offset,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length < pageSize) {
      hasMore = false;
    }

    // 處理這批資料
    await processBatch(batch.rows);

    offset += pageSize;
  }
}

// 使用游標分頁（更高效）
async function cursorPagination() {
  let lastId = 0;
  const pageSize = 1000;

  while (true) {
    const batch = await userRepo.find({
      where: { field: 'id', op: '>', value: lastId },
      limit: pageSize,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length === 0) {
      break;
    }

    await processBatch(batch.rows);
    lastId = batch.rows[batch.rows.length - 1].id;
  }
}
```

### Q: 如何實現事務 (Transaction)？

**A:** 目前版本不直接支援跨 Provider 事務，但可以在單一 Provider 層面實現：

```typescript
// 對於需要事務的操作，直接使用 Provider
const mysqlProvider = gateway.getProvider('mysql');

// 示例：手動事務控制（需要自行實現）
async function transferBalance(fromUserId: number, toUserId: number, amount: number) {
  // 注意：這只是概念性示例，實際實現需要根據具體 Provider 來做
  try {
    // 開始事務
    await mysqlProvider.query({ type: 'RAW', sql: 'START TRANSACTION' });

    // 扣除來源帳戶
    await mysqlProvider.query({
      type: 'UPDATE',
      table: 'accounts',
      data: { balance: `balance - ${amount}` },
      where: { field: 'user_id', op: '=', value: fromUserId }
    });

    // 增加目標帳戶
    await mysqlProvider.query({
      type: 'UPDATE',
      table: 'accounts',
      data: { balance: `balance + ${amount}` },
      where: { field: 'user_id', op: '=', value: toUserId }
    });

    // 提交事務
    await mysqlProvider.query({ type: 'RAW', sql: 'COMMIT' });

  } catch (error) {
    // 回滾事務
    await mysqlProvider.query({ type: 'RAW', sql: 'ROLLBACK' });
    throw error;
  }
}
```

## 中介軟體 (Middleware)

### Q: 中介軟體的執行順序是什麼？

**A:** 中介軟體按照陣列順序執行，形成洋蔥模式：

```typescript
const middlewares = [middleware1, middleware2, middleware3];

// 執行順序：
// 請求: middleware1 -> middleware2 -> middleware3 -> provider
// 回應: provider -> middleware3 -> middleware2 -> middleware1
```

### Q: 如何在中介軟體中修改查詢？

**A:** 在 `next()` 前修改查詢物件：

```typescript
const queryModifierMiddleware: Middleware = async (query, next) => {
  // 自動添加軟刪除條件
  if (query.type === 'SELECT' && query.table === 'users') {
    query.where = query.where ? {
      and: [
        query.where,
        { field: 'deleted_at', op: 'IS NULL' }
      ]
    } : { field: 'deleted_at', op: 'IS NULL' };
  }

  // 自動添加更新時間
  if (query.type === 'UPDATE') {
    query.data = {
      ...query.data,
      updated_at: new Date()
    };
  }

  return next(query);
};
```

### Q: 如何在中介軟體中處理錯誤？

**A:** 使用 try-catch 包裝 `next()` 呼叫：

```typescript
const errorHandlingMiddleware: Middleware = async (query, next) => {
  try {
    return await next(query);
  } catch (error) {
    // 記錄錯誤
    console.error(`查詢失敗 [${query.type}] ${query.table}:`, error);

    // 重新拋出或轉換錯誤
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('資料重複，請檢查唯一性約束');
    }

    throw error;
  }
};
```

## Remote API Provider

### Q: Remote API 的回應格式有什麼要求？

**A:** Remote API 必須回傳符合 `QueryResult` 格式的 JSON：

```json
// SELECT 查詢回應
{
  "rows": [
    {"id": 1, "name": "John", "email": "john@example.com"},
    {"id": 2, "name": "Jane", "email": "jane@example.com"}
  ]
}

// INSERT 查詢回應
{
  "insertId": 123
}

// UPDATE/DELETE 查詢回應
{
  "affectedRows": 2
}

// 錯誤回應
{
  "error": "錯誤訊息"
}
```

### Q: 如何處理 API 認證？

**A:** 使用 `bearerToken` 或自訂標頭：

```typescript
// Bearer Token 認證
remote: {
  type: 'remote',
  options: {
    endpoint: 'https://api.example.com/data',
    bearerToken: process.env.API_TOKEN
  }
}

// 自訂標頭認證
remote: {
  type: 'remote',
  options: {
    endpoint: 'https://api.example.com/data',
    headers: {
      'X-API-Key': process.env.API_KEY,
      'Authorization': `Basic ${btoa('username:password')}`
    }
  }
}
```

### Q: 如何處理 API 速率限制？

**A:** 在中介軟體中實現速率限制：

```typescript
const rateLimitMiddleware: Middleware = (() => {
  const requests = new Map();
  const limit = 100; // 每分鐘 100 次請求
  const window = 60000; // 1 分鐘

  return async (query, next) => {
    const now = Date.now();
    const windowStart = Math.floor(now / window) * window;

    if (!requests.has(windowStart)) {
      requests.set(windowStart, 0);
      // 清理舊的計數器
      for (const [time] of requests) {
        if (time < windowStart) {
          requests.delete(time);
        }
      }
    }

    const count = requests.get(windowStart);
    if (count >= limit) {
      throw new Error('API 請求速率超限，請稍後再試');
    }

    requests.set(windowStart, count + 1);
    return next(query);
  };
})();
```

## 效能優化

### Q: 如何提升查詢效能？

**A:** 多種優化策略：

1. **使用索引欄位查詢**
   ```typescript
   // 好：使用索引欄位
   const user = await userRepo.findOne({ field: 'email', op: '=', value: 'user@example.com' });

   // 避免：在非索引欄位上使用 LIKE
   const users = await userRepo.findMany({ field: 'description', op: 'LIKE', value: '%keyword%' });
   ```

2. **限制結果數量**
   ```typescript
   // 總是使用 limit
   const recentUsers = await userRepo.find({
     orderBy: [{ field: 'created_at', direction: 'DESC' }],
     limit: 50
   });
   ```

3. **只查詢需要的欄位**
   ```typescript
   // 好：指定欄位
   const users = await userRepo.find({
     fields: ['id', 'name', 'email']
   });

   // 避免：查詢所有欄位
   const users = await userRepo.findMany();
   ```

4. **批次操作**
   ```typescript
   // 好：批次查詢
   const users = await userRepo.findMany({
     field: 'id',
     op: 'IN',
     values: [1, 2, 3, 4, 5]
   });

   // 避免：循環查詢
   const users = [];
   for (const id of [1, 2, 3, 4, 5]) {
     const user = await userRepo.findOne({ field: 'id', op: '=', value: id });
     users.push(user);
   }
   ```

### Q: 記憶體使用過高怎麼辦？

**A:** 檢查以下幾點：

1. **連線池設定**
   ```typescript
   // 適當的連線池大小
   pool: {
     connectionLimit: 10,  // 不要設定過大
     queueLimit: 50       // 限制排隊請求
   }
   ```

2. **結果集大小**
   ```typescript
   // 使用分頁處理大結果集
   const batch = await repo.find({
     limit: 1000,
     offset: 0
   });
   ```

3. **及時關閉連線**
   ```typescript
   // 在應用程式結束時清理
   process.on('SIGTERM', async () => {
     await gateway.disconnectAll();
     process.exit(0);
   });
   ```

## 故障排除

### Q: 如何啟用詳細日誌？

**A:** 使用日誌中介軟體：

```typescript
const verboseLoggingMiddleware: Middleware = async (query, next) => {
  console.log(`[${new Date().toISOString()}] Query:`, JSON.stringify(query, null, 2));

  const startTime = Date.now();
  try {
    const result = await next(query);
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Success (${duration}ms):`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Error (${duration}ms):`, error);
    throw error;
  }
};
```

### Q: 遇到 "Connection timeout" 錯誤怎麼辦？

**A:** 檢查和調整超時設定：

```typescript
// MySQL
mysql: {
  type: 'mysql',
  options: {
    // ...其他設定
    pool: {
      acquireTimeout: 60000,  // 增加連線取得超時
      timeout: 600000         // 增加閒置超時
    }
  }
}

// PostgreSQL
postgresql: {
  type: 'postgresql',
  options: {
    // ...其他設定
    connectionTimeoutMillis: 60000,  // 連線超時
    pool: {
      connectionTimeoutMillis: 60000  // 連線池超時
    }
  }
}
```

如果問題持續，請檢查：
- 網路延遲
- 資料庫伺服器負載
- 防火牆設定

### Q: 如何除錯查詢問題？

**A:** 使用除錯工具和技巧：

```typescript
// 1. 啟用查詢日誌
const debugMiddleware: Middleware = async (query, next) => {
  console.log('執行查詢:', query);
  return next(query);
};

// 2. 檢查生成的 SQL（MySQL 範例）
const mysqlProvider = gateway.getProvider('mysql') as MySQLProvider;
// 注意：這需要根據實際 Provider 實現來調整

// 3. 使用資料庫日誌
// MySQL: 啟用 general_log
// PostgreSQL: 設定 log_statement = 'all'

// 4. 效能分析
const performanceMiddleware: Middleware = async (query, next) => {
  const start = process.hrtime.bigint();
  const result = await next(query);
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // 轉換為毫秒

  if (duration > 1000) { // 超過 1 秒的查詢
    console.warn(`慢查詢警告 (${duration.toFixed(2)}ms):`, query);
  }

  return result;
};
```

如果您還有其他問題，請在 [GitHub Issues](https://github.com/wfp99/data-gateway/issues) 中提出。