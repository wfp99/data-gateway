# 基本使用方法

這份指南將詳細介紹 Data Gateway 的各種功能和使用方法，幫助您充分利用這個強大的資料存取閘道。

## 目錄

- [CRUD 操作](#crud-操作)
- [查詢功能](#查詢功能)
- [中介軟體使用](#中介軟體使用)
- [欄位對應](#欄位對應)
- [多資料來源切換](#多資料來源切換)
- [錯誤處理](#錯誤處理)
- [效能最佳化](#效能最佳化)

## CRUD 操作

### 建立資料 (Create)

```typescript
const userRepo = gateway.getRepository('users');

// 插入完整資料
const newUserId = await userRepo?.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active',
  created_at: new Date()
});

// 插入部分資料（允許資料庫預設值）
const anotherUserId = await userRepo?.insert({
  name: 'Jane Smith',
  email: 'jane@example.com'
  // age 和 status 將使用資料庫預設值
});

console.log(`新使用者 ID: ${newUserId}`);
```

### 讀取資料 (Read)

```typescript
// 查詢所有資料
const allUsers = await userRepo?.findMany();

// 條件查詢
const activeUsers = await userRepo?.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// 查詢單筆資料
const user = await userRepo?.findOne({
  field: 'id',
  op: '=',
  value: 1
});

// 複雜查詢
const adultActiveUsers = await userRepo?.find({
  fields: ['id', 'name', 'email'],  // 指定欄位
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});
```

### 更新資料 (Update)

```typescript
// 更新特定記錄
const updatedRows = await userRepo?.update(
  { status: 'inactive', updated_at: new Date() },  // 要更新的資料
  { field: 'id', op: '=', value: userId }          // 條件
);

// 批量更新
const batchUpdated = await userRepo?.update(
  { last_login: new Date() },
  {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  }
);

console.log(`更新了 ${updatedRows} 筆記錄`);
```

### 刪除資料 (Delete)

```typescript
// 刪除特定記錄
const deletedRows = await userRepo?.delete({
  field: 'id',
  op: '=',
  value: userId
});

// 條件刪除
const batchDeleted = await userRepo?.delete({
  and: [
    { field: 'status', op: '=', value: 'inactive' },
    { field: 'last_login', op: '<', value: oneYearAgo }
  ]
});

console.log(`刪除了 ${deletedRows} 筆記錄`);
```

## 查詢功能

### 查詢操作符

Data Gateway 支援多種查詢操作符：

```typescript
// 等於
await userRepo?.findMany({ field: 'status', op: '=', value: 'active' });

// 不等於
await userRepo?.findMany({ field: 'status', op: '!=', value: 'deleted' });

// 大於/小於
await userRepo?.findMany({ field: 'age', op: '>', value: 18 });
await userRepo?.findMany({ field: 'age', op: '<=', value: 65 });

// LIKE 模糊查詢
await userRepo?.findMany({ field: 'name', op: 'LIKE', value: 'John%' });

// IN 查詢
await userRepo?.findMany({ field: 'status', op: 'IN', values: ['active', 'pending'] });

// NOT IN 查詢
await userRepo?.findMany({ field: 'role', op: 'NOT IN', values: ['admin', 'super_admin'] });

// 空值檢查
await userRepo?.findMany({ field: 'deleted_at', op: 'IS NULL' });
await userRepo?.findMany({ field: 'email_verified_at', op: 'IS NOT NULL' });
```

### 複雜查詢條件

```typescript
// AND 條件
const result1 = await userRepo?.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 },
      { field: 'email_verified', op: '=', value: true }
    ]
  }
});

// OR 條件
const result2 = await userRepo?.find({
  where: {
    or: [
      { field: 'role', op: '=', value: 'admin' },
      { field: 'role', op: '=', value: 'moderator' }
    ]
  }
});

// 巢狀條件
const result3 = await userRepo?.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      {
        or: [
          { field: 'subscription', op: '=', value: 'premium' },
          { field: 'trial_expires', op: '>', value: new Date() }
        ]
      }
    ]
  }
});
```

### 排序和分頁

```typescript
// 單一欄位排序
const users = await userRepo?.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10
});

// 多欄位排序
const sortedUsers = await userRepo?.find({
  orderBy: [
    { field: 'status', direction: 'ASC' },
    { field: 'last_login', direction: 'DESC' },
    { field: 'name', direction: 'ASC' }
  ]
});

// 分頁查詢
const page1 = await userRepo?.find({
  orderBy: [{ field: 'id', direction: 'ASC' }],
  limit: 20,   // 每頁 20 筆
  offset: 0    // 第一頁
});

const page2 = await userRepo?.find({
  orderBy: [{ field: 'id', direction: 'ASC' }],
  limit: 20,   // 每頁 20 筆
  offset: 20   // 第二頁
});
```

### 聚合查詢

```typescript
// 統計查詢
const stats = await userRepo?.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'total_users' },
    { type: 'AVG', field: 'age', alias: 'average_age' },
    { type: 'MIN', field: 'salary', alias: 'min_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'total_users', direction: 'DESC' }]
});

console.log('部門統計:', stats?.rows);
```

## 中介軟體使用

中介軟體允許您在查詢執行前後插入自訂邏輯。

### 建立中介軟體

```typescript
import { Middleware } from '@wfp99/data-gateway';

// 日誌中介軟體
const loggingMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 執行查詢:`, query.type, query.table);

  try {
    const result = await next(query);
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] 查詢完成，耗時: ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] 查詢失敗，耗時: ${duration}ms`, error);
    throw error;
  }
};

// 驗證中介軟體
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    // 驗證必要欄位
    if (!query.data.name || !query.data.email) {
      throw new Error('缺少必要欄位: name, email');
    }

    // 驗證 email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(query.data.email)) {
      throw new Error('無效的 email 格式');
    }
  }

  return next(query);
};

// 快取中介軟體
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();

  return async (query, next) => {
    // 只快取查詢操作
    if (query.type !== 'SELECT') {
      return next(query);
    }

    const cacheKey = JSON.stringify(query);

    // 檢查快取
    if (cache.has(cacheKey)) {
      console.log('從快取取得資料');
      return cache.get(cacheKey);
    }

    // 執行查詢
    const result = await next(query);

    // 儲存到快取（5 分鐘過期）
    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);

    return result;
  };
})();
```

### 使用中介軟體

```typescript
const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: { /* 設定 */ }
    }
  },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      middlewares: [
        validationMiddleware,  // 先驗證
        loggingMiddleware,     // 再記錄
        cacheMiddleware        // 最後快取
      ]
    }
  }
};
```

## 欄位對應

欄位對應讓您在應用程式層使用友好的欄位名稱，自動對應到資料庫欄位。

### 建立欄位對應器

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

// 定義欄位對應
const userFieldMapper = new MappingFieldMapper({
  // 應用程式欄位 -> 資料庫欄位
  id: 'user_id',
  name: 'full_name',
  email: 'email_address',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  isActive: 'status'  // 布林值對應到狀態
});

// 在儲存庫中使用
const config = {
  providers: { /* 提供者設定 */ },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      mapper: userFieldMapper  // 使用欄位對應器
    }
  }
};
```

### 使用對應後的欄位

```typescript
// 使用應用程式層的欄位名稱
const users = await userRepo?.find({
  fields: ['id', 'name', 'email', 'createdAt'],  // 自動對應到資料庫欄位
  where: {
    and: [
      { field: 'isActive', op: '=', value: true },     // 對應到 status = 'active'
      { field: 'createdAt', op: '>', value: lastWeek } // 對應到 created_at
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]  // 對應到 created_at
});

// 插入時也會自動對應
await userRepo?.insert({
  name: 'John Doe',      // 對應到 full_name
  email: 'john@example.com',  // 對應到 email_address
  isActive: true         // 對應到 status = 'active'
});
```

## 多資料來源切換

Data Gateway 的一個強大功能是可以在同一個應用程式中使用多個資料來源。

### 設定多個資料來源

```typescript
const config = {
  providers: {
    // 主要資料庫（使用者資料）
    mainDB: {
      type: 'mysql',
      options: {
        host: 'main-db.example.com',
        database: 'app_main'
      }
    },

    // 分析資料庫（只讀）
    analyticsDB: {
      type: 'postgresql',
      options: {
        host: 'analytics-db.example.com',
        database: 'analytics'
      }
    },

    // 快取資料庫
    cache: {
      type: 'sqlite',
      options: {
        filename: './cache.db'
      }
    },

    // 外部 API
    externalAPI: {
      type: 'remote',
      options: {
        endpoint: 'https://api.external.com/data',
        bearerToken: process.env.EXTERNAL_API_TOKEN
      }
    }
  },

  repositories: {
    // 主要業務資料
    users: { provider: 'mainDB', table: 'users' },
    orders: { provider: 'mainDB', table: 'orders' },

    // 分析資料
    userStats: { provider: 'analyticsDB', table: 'user_statistics' },
    orderAnalytics: { provider: 'analyticsDB', table: 'order_analytics' },

    // 快取資料
    sessions: { provider: 'cache', table: 'user_sessions' },
    tempData: { provider: 'cache', table: 'temporary_data' },

    // 外部資料
    externalProducts: { provider: 'externalAPI', table: 'products' }
  }
};
```

### 跨資料來源查詢

```typescript
async function crossDataSourceExample() {
  const gateway = await DataGateway.build(config);

  try {
    // 從主資料庫取得使用者
    const userRepo = gateway.getRepository('users');
    const user = await userRepo?.findOne({ field: 'id', op: '=', value: 123 });

    // 從分析資料庫取得統計
    const statsRepo = gateway.getRepository('userStats');
    const stats = await statsRepo?.findOne({ field: 'user_id', op: '=', value: 123 });

    // 從快取取得會話
    const sessionRepo = gateway.getRepository('sessions');
    const session = await sessionRepo?.findOne({ field: 'user_id', op: '=', value: 123 });

    // 從外部 API 取得產品
    const productRepo = gateway.getRepository('externalProducts');
    const products = await productRepo?.findMany({ field: 'category', op: '=', value: 'electronics' });

    // 合併資料
    const completeUserProfile = {
      user,
      statistics: stats,
      session,
      recommendedProducts: products
    };

    return completeUserProfile;

  } finally {
    await gateway.disconnectAll();
  }
}
```

## 錯誤處理

### 統一錯誤處理

```typescript
async function robustDataAccess() {
  let gateway: DataGateway | null = null;

  try {
    gateway = await DataGateway.build(config);
    const userRepo = gateway.getRepository('users');

    if (!userRepo) {
      throw new Error('無法取得使用者儲存庫');
    }

    const result = await userRepo.findMany();
    return result;

  } catch (error) {
    console.error('資料存取錯誤:', error);

    if (error instanceof Error) {
      // 連線錯誤
      if (error.message.includes('connection')) {
        console.error('資料庫連線失敗，請檢查網路或設定');
      }
      // 認證錯誤
      else if (error.message.includes('authentication') || error.message.includes('401')) {
        console.error('認證失敗，請檢查使用者名稱和密碼');
      }
      // 查詢錯誤
      else if (error.message.includes('query') || error.message.includes('syntax')) {
        console.error('查詢語法錯誤，請檢查查詢條件');
      }
      // 未知錯誤
      else {
        console.error('未知錯誤:', error.message);
      }
    }

    throw error;

  } finally {
    if (gateway) {
      await gateway.disconnectAll();
    }
  }
}
```

### 重試機制

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      console.warn(`操作失敗，${delay}ms 後重試 (${attempt}/${maxRetries}):`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // 指數退避
    }
  }

  throw new Error('不應該到達這裡');
}

// 使用重試機制
const users = await withRetry(async () => {
  const gateway = await DataGateway.build(config);
  const userRepo = gateway.getRepository('users');
  const result = await userRepo?.findMany();
  await gateway.disconnectAll();
  return result;
});
```

## 效能最佳化

### 連線池最佳化

```typescript
// 根據負載調整連線池設定
const optimizedConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        // ... 其他設定
        pool: {
          usePool: true,
          connectionLimit: process.env.NODE_ENV === 'production' ? 20 : 5,
          acquireTimeout: 30000,
          timeout: 300000,
          preConnect: process.env.NODE_ENV === 'production'
        }
      }
    }
  }
};
```

### 查詢最佳化

```typescript
// 使用索引欄位查詢
const users = await userRepo?.findMany({
  field: 'email',  // 確保 email 欄位有索引
  op: '=',
  value: 'user@example.com'
});

// 限制查詢結果
const recentOrders = await orderRepo?.find({
  fields: ['id', 'total', 'created_at'],  // 只查詢需要的欄位
  where: { field: 'status', op: '=', value: 'completed' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 50  // 限制結果數量
});

// 使用批次操作
const userIds = [1, 2, 3, 4, 5];
const users = await userRepo?.findMany({
  field: 'id',
  op: 'IN',
  values: userIds  // 一次查詢多筆，而非循環查詢
});
```

### 監控和調校

```typescript
async function monitorPerformance() {
  const gateway = await DataGateway.build(config);

  // 監控連線池狀態
  setInterval(() => {
    const allStatuses = gateway.getAllPoolStatuses();

    for (const [providerName, status] of allStatuses) {
      const utilizationRate = status.activeConnections / status.maxConnections;

      if (utilizationRate > 0.8) {
        console.warn(`${providerName} 連線池使用率過高: ${Math.round(utilizationRate * 100)}%`);
      }

      console.log(`${providerName}: ${status.activeConnections}/${status.maxConnections} 連線使用中`);
    }
  }, 30000); // 每 30 秒檢查

  return gateway;
}
```

這些基本使用方法應該能幫助您充分利用 Data Gateway 的強大功能。如需更深入的內容，請參考 [API 參考文件](../api/README.md) 和 [進階功能指南](../advanced/README.md)。