# 常見問題 FAQ

[English](./faq.md) | 中文版

Data Gateway 常見問題與解決方案。

## 安裝與設定

### Q: 為什麼安裝後報錯找不到資料庫驅動程式？

**A:** 請手動安裝對應的資料庫驅動程式：

```bash
npm install mysql2              # MySQL
npm install pg @types/pg        # PostgreSQL
npm install sqlite sqlite3      # SQLite
```

Remote API Provider 不需要安裝額外驅動程式。

### Q: Node.js 版本要求是什麼？

**A:** 要求 Node.js 18.0.0 或更高版本。使用 `node --version` 檢查版本。

### Q: 如何在 TypeScript 專案中使用？

**A:** 內建 TypeScript 支援，可使用泛型：

```typescript
import { DataGateway } from '@wfp99/data-gateway';

interface User {
  id: number;
  name: string;
  email: string;
}

const userRepo = gateway.getRepository<User>('users');
```

## 連線與 Provider

### Q: 如何設定多個資料庫連線？

**A:** 配置多個 Provider：

```typescript
const config = {
  providers: {
    mainDB: {
      type: 'mysql',
      options: { host: 'main-db.example.com', database: 'main' }
    },
    analyticsDB: {
      type: 'postgresql',
      options: { host: 'analytics-db.example.com', database: 'analytics' }
    }
  },
  repositories: {
    users: { provider: 'mainDB', table: 'users' },
    stats: { provider: 'analyticsDB', table: 'user_stats' }
  }
};
```

### Q: 是否支援連線池？

**A:** 支援，各 Provider 有不同策略：

```typescript
mysql: {
  type: 'mysql',
  options: {
    pool: {
      usePool: true,
      connectionLimit: 10,
      acquireTimeout: 60000
    }
  }
}
```

監控連線池狀態：

```typescript
const status = gateway.getProviderPoolStatus('mysql');
console.log(`使用中: ${status?.activeConnections}/${status?.maxConnections}`);
```

### Q: 如何設定 SSL 連線？

**A:** 配置 SSL 選項：

```typescript
mysql: {
  type: 'mysql',
  options: {
    ssl: {
      ca: fs.readFileSync('ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}
```

### Q: 如何處理連線失敗？

**A:** 實作重試機制：

```typescript
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries reached');
}
```

## 查詢與資料操作

### Q: 支援哪些查詢運算子？

**A:** 完整的運算子支援：

```typescript
// 比較運算
{ field: 'age', op: '>', value: 18 }

// 字串比對
{ field: 'name', op: 'LIKE', value: 'John%' }

// 陣列運算
{ field: 'status', op: 'IN', values: ['active', 'pending'] }

// 範圍運算
{ field: 'age', op: 'BETWEEN', values: [18, 65] }

// Null 檢查
{ field: 'deleted_at', op: 'IS NULL' }
```

### Q: 如何執行複雜的 AND/OR 條件查詢？

**A:** 使用巢狀條件：

```typescript
const result = await userRepo.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      {
        or: [
          { field: 'role', op: '=', value: 'admin' },
          { field: 'role', op: '=', value: 'moderator' }
        ]
      }
    ]
  }
});
```

### Q: 如何實現分頁？

**A:** 使用 `limit` 和 `offset`：

```typescript
const page = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

const totalPages = Math.ceil((page.totalCount || 0) / 20);
```

### Q: 如何執行聚合查詢？

**A:** 使用聚合欄位：

```typescript
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  }
});
```

## 欄位對映

### Q: 如何對映應用程式欄位名稱到資料庫欄位名稱？

**A:** 使用 `MappingFieldMapper`：

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  name: 'full_name',
  createdAt: 'created_at'
});

const config = {
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      mapper: userMapper
    }
  }
};
```

### Q: 如何自訂欄位轉換？

**A:** 擴展 `MappingFieldMapper`：

```typescript
class CustomUserMapper extends MappingFieldMapper {
  transformToDatabase(data: Partial<User>): Record<string, any> {
    const mapped = super.transformToDatabase(data);
    
    if ('isActive' in data) {
      mapped.status = data.isActive ? 'active' : 'inactive';
      delete mapped.isActive;
    }
    
    return mapped;
  }
}
```

## 中介軟體

### Q: 如何實作請求記錄？

**A:** 建立記錄中介軟體：

```typescript
const loggingMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();
  console.log(`${query.type} ${query.table} 開始`);
  
  try {
    const result = await next(query);
    console.log(`完成，耗時 ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.error(`失敗，耗時 ${Date.now() - startTime}ms:`, error.message);
    throw error;
  }
};
```

### Q: 如何實作資料驗證？

**A:** 建立驗證中介軟體：

```typescript
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    if (!query.data.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('電子郵件格式錯誤');
    }
  }
  return next(query);
};
```

### Q: 如何實作快取？

**A:** 實作快取中介軟體：

```typescript
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();
  const TTL = 5 * 60 * 1000;
  
  return async (query, next) => {
    if (query.type !== 'SELECT') return next(query);
    
    const key = JSON.stringify(query);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.data;
    }
    
    const result = await next(query);
    cache.set(key, { data: result, timestamp: Date.now() });
    
    return result;
  };
})();
```

## 效能優化

### Q: 查詢優化技巧？

**A:** 遵循最佳實踐：

```typescript
// 1. 使用索引欄位
const user = await userRepo.findOne({
  field: 'email', // 已建立索引
  op: '=',
  value: 'user@example.com'
});

// 2. 限制結果數量
const users = await userRepo.find({
  limit: 100
});

// 3. 只查詢需要的欄位
const users = await userRepo.find({
  fields: ['id', 'name', 'email']
});

// 4. 批次操作
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5]
});
```

### Q: 如何調整連線池設定？

**A:** 根據環境調整：

```typescript
// 開發環境
pool: { connectionLimit: 3 }

// 生產環境（高流量）
pool: { 
  connectionLimit: 20,
  queueLimit: 100,
  preConnect: true
}

// 批次處理
pool: { 
  connectionLimit: 5,
  acquireTimeout: 120000
}
```

### Q: 如何監控效能？

**A:** 使用效能中介軟體：

```typescript
const performanceMiddleware: Middleware = async (query, next) => {
  const start = Date.now();
  const result = await next(query);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`慢查詢: ${query.type} ${query.table} (${duration}ms)`);
  }
  
  return result;
};
```

## 錯誤處理

### Q: 如何處理連線逾時？

**A:** 實作逾時處理：

```typescript
async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = 30000
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}
```

### Q: 如何處理資料庫特定錯誤？

**A:** 處理 Provider 特定錯誤：

```typescript
try {
  await userRepo.create(data);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw new Error('資料重複');
  } else if (error.code === '23505') {
    throw new Error('唯一性約束違反');
  }
  throw error;
}
```

## 安全性

### Q: 如何防止 SQL 注入攻擊？

**A:** Data Gateway 自動使用參數化查詢：

```typescript
// 自動參數化且安全
const users = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput // 自動轉義
});
```

### Q: 如何實作資料存取授權？

**A:** 使用授權中介軟體：

```typescript
const authMiddleware = (getUserContext: () => UserContext): Middleware => {
  return async (query, next) => {
    const user = getUserContext();
    
    if (query.table === 'admin_logs' && user.role !== 'admin') {
      throw new Error('存取被拒');
    }
    
    return next(query);
  };
};
```

## 故障排除

### Q: 應用程式關閉時卡住怎麼辦？

**A:** 實作優雅關閉：

```typescript
async function gracefulShutdown() {
  server.close();
  await new Promise(resolve => setTimeout(resolve, 5000));
  await gateway.disconnectAll();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

### Q: 遇到「連線數過多」錯誤怎麼辦？

**A:** 檢查並優化連線池設定：

```typescript
const status = gateway.getProviderPoolStatus('mysql');
console.log('連線池狀態:', status);

// 監控連線池使用率
setInterval(() => {
  const status = gateway.getProviderPoolStatus('mysql');
  if (status && status.activeConnections / status.maxConnections > 0.8) {
    console.warn('連線池使用率過高:', status);
  }
}, 10000);
```

### Q: 如何除錯慢查詢？

**A:** 啟用查詢除錯：

```typescript
const debugMiddleware: Middleware = async (query, next) => {
  console.log('查詢:', JSON.stringify(query, null, 2));
  
  const start = Date.now();
  const result = await next(query);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`慢查詢 (${duration}ms):`, query);
  }
  
  return result;
};
```

## Remote API Provider

### Q: API 回應格式有什麼要求？

**A:** 必須回傳 `QueryResult` JSON：

```json
{
  "rows": [{"id": 1, "name": "John"}]
}
```

### Q: 如何處理 API 認證？

**A:** 使用 `bearerToken` 或自訂標頭：

```typescript
remote: {
  type: 'remote',
  options: {
    endpoint: 'https://api.example.com/data',
    bearerToken: process.env.API_TOKEN
  }
}
```

### Q: 如何處理 API 速率限制？

**A:** 實作速率限制中介軟體：

```typescript
const rateLimitMiddleware: Middleware = (() => {
  const requests = new Map();
  const limit = 100; // 每分鐘
  
  return async (query, next) => {
    const now = Date.now();
    const window = Math.floor(now / 60000) * 60000;
    
    const count = requests.get(window) || 0;
    if (count >= limit) {
      throw new Error('超過速率限制');
    }
    
    requests.set(window, count + 1);
    return next(query);
  };
})();
```

## 更多資源

- [基本使用指南](./guides/basic-usage.zh-TW.md)
- [Provider 文件](./providers/)
- [GitHub Issues](https://github.com/wfp99/data-gateway/issues)
- [GitHub Discussions](https://github.com/wfp99/data-gateway/discussions)
