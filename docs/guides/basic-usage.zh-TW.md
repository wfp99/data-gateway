# 基本使用指南

[English](./basic-usage.md) | 中文版

Data Gateway 功能和使用模式的完整指南。

## 目錄

- [CRUD 操作](#crud-操作)
- [查詢功能](#查詢功能)
- [中介軟體](#中介軟體)
- [欄位對映](#欄位對映)
- [多資料來源](#多資料來源)
- [效能優化](#效能優化)

## CRUD 操作

### 新增資料

```typescript
const userRepo = gateway.getRepository('users');

const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active'
});
```

### 讀取資料

```typescript
// 查詢全部
const users = await userRepo.findMany();

// 條件查詢
const activeUsers = await userRepo.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// 查詢單筆
const user = await userRepo.findOne({
  field: 'id',
  op: '=',
  value: 1
});

// 複雜查詢
const result = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20
});
```

### 更新資料

```typescript
// 更新單筆
const count = await userRepo.update(
  { status: 'inactive' },
  { field: 'id', op: '=', value: userId }
);

// 批次更新
await userRepo.update(
  { last_login: new Date() },
  { field: 'status', op: '=', value: 'active' }
);
```

### 刪除資料

```typescript
// 刪除單筆
const deleted = await userRepo.delete({
  field: 'id',
  op: '=',
  value: userId
});

// 條件刪除
await userRepo.delete({
  and: [
    { field: 'status', op: '=', value: 'inactive' },
    { field: 'last_login', op: '<', value: oneYearAgo }
  ]
});
```

## 查詢功能

### 運算子

```typescript
// 比較運算
{ field: 'age', op: '>', value: 18 }
{ field: 'age', op: '<=', value: 65 }

// 字串比對 (LIKE)
{ like: { field: 'name', pattern: 'John%' } }

// 陣列運算
{ field: 'status', op: 'IN', values: ['active', 'pending'] }
{ field: 'role', op: 'NOT IN', values: ['admin'] }

// Null 檢查
{ field: 'deleted_at', op: 'IS NULL' }
{ field: 'email', op: 'IS NOT NULL' }
```

### 複雜條件

```typescript
// AND/OR 條件
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

### 排序與分頁

```typescript
// 排序
const users = await userRepo.find({
  orderBy: [
    { field: 'created_at', direction: 'DESC' },
    { field: 'name', direction: 'ASC' }
  ],
  limit: 20,
  offset: 0
});

// 分頁輔助函數
function paginate(page: number, pageSize: number = 20) {
  return {
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

const page2 = await userRepo.find({
  ...paginate(2, 10),
  orderBy: [{ field: 'id', direction: 'ASC' }]
});
```

### 聚合查詢

```typescript
// 分組與聚合
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  }
});
```

### 欄位選擇

```typescript
// 選擇特定欄位
const users = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: { field: 'status', op: '=', value: 'active' }
});

// 排除敏感欄位
const publicUsers = await userRepo.find({
  fields: ['id', 'name', 'avatar']
  // 排除 password, email
});
```

## 中介軟體

### 記錄中介軟體

```typescript
import { Middleware } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query, next) => {
  const start = Date.now();
  console.log(`[${query.type}] ${query.table}`);

  try {
    const result = await next(query);
    console.log(`✓ 完成，耗時 ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`✗ 失敗: ${error.message}`);
    throw error;
  }
};

const config = {
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      middlewares: [loggingMiddleware]
    }
  }
};
```

### 驗證中介軟體

```typescript
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    if (!query.data.email || !query.data.email.includes('@')) {
      throw new Error('電子郵件格式錯誤');
    }
    if (query.data.age && (query.data.age < 0 || query.data.age > 150)) {
      throw new Error('年齡範圍錯誤');
    }
  }
  return next(query);
};
```

### 軟刪除中介軟體

```typescript
const softDeleteMiddleware: Middleware = async (query, next) => {
  // 將 DELETE 轉換為 UPDATE
  if (query.type === 'DELETE') {
    query.type = 'UPDATE';
    query.data = { deleted_at: new Date() };
  }

  // 在 SELECT 時過濾已刪除記錄
  if (query.type === 'SELECT') {
    query.where = query.where ? {
      and: [query.where, { field: 'deleted_at', op: 'IS NULL' }]
    } : { field: 'deleted_at', op: 'IS NULL' };
  }

  return next(query);
};
```

### 快取中介軟體

```typescript
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();
  const TTL = 5 * 60 * 1000; // 5 分鐘

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

## 欄位對映

### 基本對映

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  name: 'full_name',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
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

// 使用應用程式欄位名稱
const users = await userRepo.find({
  fields: ['id', 'name', 'createdAt'],
  where: { field: 'createdAt', op: '>', value: lastWeek }
});
```

### 自訂對映器

```typescript
class UserMapper extends MappingFieldMapper {
  transformToDatabase(data: Partial<User>): Record<string, any> {
    const mapped = super.transformToDatabase(data);

    // 轉換布林值為資料庫格式
    if ('isActive' in data) {
      mapped.status = data.isActive ? 'active' : 'inactive';
      delete mapped.isActive;
    }

    // 加密敏感欄位
    if (data.ssn) {
      mapped.ssn = encrypt(data.ssn);
    }

    return mapped;
  }

  transformFromDatabase(data: Record<string, any>): Partial<User> {
    const mapped = super.transformFromDatabase(data);

    // 轉換資料庫格式為布林值
    if ('status' in data) {
      mapped.isActive = data.status === 'active';
    }

    // 解密敏感欄位
    if (data.ssn) {
      mapped.ssn = decrypt(data.ssn);
    }

    return mapped;
  }
}
```

## 多資料來源

### 配置

```typescript
const config = {
  providers: {
    mainDB: {
      type: 'mysql',
      options: {
        host: 'main-db.example.com',
        database: 'production',
        pool: { connectionLimit: 10 }
      }
    },
    analyticsDB: {
      type: 'postgresql',
      options: {
        host: 'analytics-db.example.com',
        database: 'analytics',
        pool: { connectionLimit: 5 }
      }
    },
    cacheDB: {
      type: 'sqlite',
      options: {
        filename: './cache.db'
      }
    },
    remoteAPI: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: process.env.API_TOKEN
      }
    }
  },
  repositories: {
    users: { provider: 'mainDB', table: 'users' },
    stats: { provider: 'analyticsDB', table: 'user_stats' },
    sessions: { provider: 'cacheDB', table: 'sessions' },
    products: { provider: 'remoteAPI', table: 'products' }
  }
};

const gateway = new DataGateway(config);
```

### 跨來源查詢

```typescript
// 從不同來源查詢
const user = await gateway.getRepository('users').findOne({
  field: 'id',
  op: '=',
  value: userId
});

const stats = await gateway.getRepository('stats').findOne({
  field: 'user_id',
  op: '=',
  value: userId
});

const session = await gateway.getRepository('sessions').findOne({
  field: 'user_id',
  op: '=',
  value: userId
});

// 在應用層合併資料
const userProfile = {
  ...user,
  stats,
  session
};
```

## 效能優化

### 查詢優化

```typescript
// ✅ 好：使用索引欄位
const user = await userRepo.findOne({
  field: 'email', // 已建立索引
  op: '=',
  value: 'user@example.com'
});

// ✅ 好：限制結果數量
const recent = await userRepo.find({
  limit: 100,
  orderBy: [{ field: 'created_at', direction: 'DESC' }]
});

// ✅ 好：只查詢需要的欄位
const list = await userRepo.find({
  fields: ['id', 'name', 'avatar']
});

// ✅ 好：批次操作
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5]
});

// ❌ 避免：非索引 LIKE 查詢
const users = await userRepo.find({
  where: { like: { field: 'biography', pattern: '%keyword%' } }
});

// ❌ 避免：無限制查詢
const all = await userRepo.findMany(); // 沒有限制！
```

### 連線池

```typescript
// 生產環境配置
const prodConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        pool: {
          usePool: true,
          connectionLimit: 20,
          queueLimit: 100,
          acquireTimeout: 30000,
          timeout: 300000,
          preConnect: true
        }
      }
    }
  }
};

// 監控連線池狀態
const status = gateway.getProviderPoolStatus('mysql');
console.log(`連線池: ${status.activeConnections}/${status.maxConnections}`);

// 檢查所有連線池
const allStatuses = gateway.getAllPoolStatuses();
for (const [name, status] of allStatuses) {
  console.log(`${name}: ${status.activeConnections}/${status.maxConnections}`);
}
```

### 批次處理

```typescript
// 使用分頁處理大型資料集
async function processAllUsers(batchSize = 1000) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await userRepo.find({
      limit: batchSize,
      offset,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length < batchSize) {
      hasMore = false;
    }

    await processBatch(batch.rows);
    offset += batchSize;
  }
}

// 游標分頁（更高效）
async function processCursorPagination(pageSize = 1000) {
  let lastId = 0;

  while (true) {
    const batch = await userRepo.find({
      where: { field: 'id', op: '>', value: lastId },
      limit: pageSize,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length === 0) break;

    await processBatch(batch.rows);
    lastId = batch.rows[batch.rows.length - 1].id;
  }
}
```

## 錯誤處理

```typescript
// 基本錯誤處理
try {
  const user = await userRepo.findOne({
    field: 'id',
    op: '=',
    value: userId
  });
} catch (error) {
  console.error('查詢失敗:', error.message);
}

// Provider 特定錯誤
try {
  await userRepo.insert(data);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw new Error('電子郵件已存在');
  } else if (error.code === '23505') {
    throw new Error('唯一性約束違反');
  }
  throw error;
}

// 優雅關閉
async function shutdown() {
  await gateway.disconnectAll();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

## 最佳實踐

1. **使用連線池**於生產環境
2. **總是限制**查詢結果
3. **選擇特定欄位**而非 `*`
4. **使用批次操作**處理多筆記錄
5. **實作錯誤處理**和重試機制
6. **定期監控**連線池狀態
7. **使用中介軟體**處理橫切關注點
8. **對映欄位**實現乾淨分離
9. **關閉連線**於程式結束時

## 下一步

- [欄位對映指南](./field-mapping.zh-TW.md)
- [中介軟體指南](./middleware.zh-TW.md)
- [效能調校](../advanced/performance.zh-TW.md)
- [Provider 文件](../providers/)
- [FAQ](../faq.zh-TW.md)
