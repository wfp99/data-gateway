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

## JOIN 查詢

Data Gateway 支援資料表關聯查詢（JOIN），讓您可以從多個資料表中查詢相關資料。JOIN 功能支援兩種方式：使用 repository 名稱（推薦）或直接使用資料表名稱。

### 基本 JOIN 範例

#### 使用 Repository 名稱（推薦）

使用 repository 名稱可以自動利用欄位對應（EntityFieldMapper）功能，讓程式碼更簡潔。

```typescript
const orderRepo = gateway.getRepository('orders');

// INNER JOIN：查詢訂單及對應的使用者資訊
const ordersWithUsers = await orderRepo?.find({
  fields: ['id', 'order_date', 'total', 'user.name', 'user.email'],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },  // 引用另一個 repository
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ],
  where: { field: 'status', op: '=', value: 'completed' }
});

console.log('訂單及使用者資訊:', ordersWithUsers?.rows);
```

#### 直接使用資料表名稱

當您需要 JOIN 未定義為 repository 的資料表時，可以直接指定資料表名稱。

```typescript
// LEFT JOIN：查詢訂單及可能存在的使用者個人資料
const ordersWithProfiles = await orderRepo?.find({
  fields: ['id', 'order_date', 'total', 'profiles.address', 'profiles.phone'],
  joins: [
    {
      type: 'LEFT',
      source: { table: 'user_profiles' },  // 直接指定資料表名稱
      on: { field: 'user_id', op: '=', value: 'user_profiles.user_id' }
    }
  ]
});
```

### JOIN 類型說明

Data Gateway 支援四種標準的 JOIN 類型：

#### INNER JOIN（內部連接）

只返回兩個資料表中都有匹配記錄的資料。

```typescript
// 查詢有使用者資訊的訂單
const result = await orderRepo?.find({
  fields: ['orders.id', 'orders.total', 'users.name', 'users.email'],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ]
});
```

#### LEFT JOIN（左外連接）

返回左表（主表）的所有記錄，以及右表中匹配的記錄。如果右表沒有匹配，則相關欄位為 null。

```typescript
// 查詢所有訂單，包含可能不存在的使用者資訊
const result = await orderRepo?.find({
  fields: ['orders.id', 'orders.total', 'users.name'],
  joins: [
    {
      type: 'LEFT',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ]
});
```

#### RIGHT JOIN（右外連接）

返回右表的所有記錄，以及左表中匹配的記錄。如果左表沒有匹配，則相關欄位為 null。

```typescript
// 查詢所有使用者，包含他們可能沒有的訂單
const result = await userRepo?.find({
  fields: ['users.id', 'users.name', 'orders.total'],
  joins: [
    {
      type: 'RIGHT',
      source: { repository: 'orders' },
      on: { field: 'id', op: '=', value: 'orders.user_id' }
    }
  ]
});
```

#### FULL OUTER JOIN（完全外連接）

返回兩個資料表的所有記錄，無論是否有匹配。沒有匹配的欄位為 null。

**重要提示：** MySQL 和 SQLite 不支援 FULL OUTER JOIN，只有 PostgreSQL 支援。

```typescript
// PostgreSQL 專用：查詢所有使用者和訂單，無論是否有匹配
const result = await userRepo?.find({
  fields: ['users.id', 'users.name', 'orders.id', 'orders.total'],
  joins: [
    {
      type: 'FULL',
      source: { repository: 'orders' },
      on: { field: 'id', op: '=', value: 'orders.user_id' }
    }
  ]
});
```

### 多個 JOIN

您可以在一個查詢中使用多個 JOIN 來關聯多個資料表。

```typescript
// 查詢訂單、使用者和產品資訊
const orderRepo = gateway.getRepository('orders');
const result = await orderRepo?.find({
  fields: [
    'orders.id',
    'orders.order_date',
    'users.name',
    'users.email',
    'products.name',
    'products.price'
  ],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    },
    {
      type: 'LEFT',
      source: { repository: 'products' },
      on: { field: 'product_id', op: '=', value: 'products.id' }
    }
  ],
  where: {
    and: [
      { field: 'orders.status', op: '=', value: 'completed' },
      { field: 'orders.order_date', op: '>', value: new Date('2024-01-01') }
    ]
  },
  orderBy: [{ field: 'orders.order_date', direction: 'DESC' }]
});

console.log('訂單詳細資訊:', result?.rows);
```

### 結合欄位對應使用

當您的 repository 配置了 EntityFieldMapper 時，JOIN 查詢會自動使用欄位對應。

```typescript
// 假設 userRepo 配置了欄位對應
// 應用程式欄位 -> 資料庫欄位
// name -> full_name
// email -> email_address
// createdAt -> created_at

const orderRepo = gateway.getRepository('orders');
const result = await orderRepo?.find({
  fields: [
    'id',
    'orderDate',           // 自動對應到 order_date
    'user.name',           // 自動對應到 users.full_name
    'user.email'           // 自動對應到 users.email_address
  ],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },  // 自動使用 users repository 的欄位對應
      on: { field: 'userId', op: '=', value: 'users.id' }
    }
  ],
  where: {
    field: 'createdAt',    // 自動對應到 orders.created_at
    op: '>',
    value: lastWeek
  }
});
```

### JOIN 查詢最佳實務

#### 1. 優先使用 Repository 名稱

```typescript
// ✅ 推薦：使用 repository 名稱
joins: [
  {
    type: 'INNER',
    source: { repository: 'users' },  // 可利用欄位對應和其他 repository 設定
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }
]

// ⚠️ 只在必要時使用：直接指定資料表名稱
joins: [
  {
    type: 'INNER',
    source: { table: 'users' },  // 無法使用欄位對應
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }
]
```

#### 2. 明確指定所需欄位

```typescript
// ✅ 好的做法：只查詢需要的欄位
fields: ['orders.id', 'orders.total', 'users.name', 'users.email']

// ❌ 避免：使用 * 查詢所有欄位（除非真的需要）
fields: ['*']
```

#### 3. 注意資料庫的 JOIN 類型支援

```typescript
// ✅ 所有資料庫都支援
type: 'INNER' | 'LEFT' | 'RIGHT'

// ⚠️ 只有 PostgreSQL 支援
type: 'FULL'

// 建議：在使用 FULL OUTER JOIN 前檢查資料庫類型
const provider = gateway.getProvider('myProvider');
if (provider?.type === 'postgresql') {
  // 安全使用 FULL OUTER JOIN
  joins: [{ type: 'FULL', ... }]
}
```

#### 4. 使用 WHERE 條件過濾結果

```typescript
// ✅ 推薦：先過濾再 JOIN，提升效能
const result = await orderRepo?.find({
  fields: ['orders.id', 'users.name'],
  where: {
    and: [
      { field: 'orders.status', op: '=', value: 'completed' },  // 先過濾主表
      { field: 'orders.order_date', op: '>', value: lastMonth }
    ]
  },
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ]
});
```

### 常見問題

#### Q: 如何決定使用 repository 還是 table？

**A:** 優先使用 `repository`：
- ✅ 當該資料表已定義為 repository 時
- ✅ 需要使用欄位對應（EntityFieldMapper）時
- ✅ 想要保持程式碼的一致性和可維護性時

使用 `table` 的情況：
- ⚠️ 資料表未定義為 repository
- ⚠️ 需要 JOIN 的是臨時表或視圖

#### Q: JOIN 的效能如何優化？

**A:** 建議：
1. 確保 JOIN 條件中使用的欄位有建立索引
2. 只查詢需要的欄位，避免使用 `*`
3. 使用 WHERE 條件先過濾資料再 JOIN
4. 對於大量資料，考慮使用分頁（limit 和 offset）
5. 監控連線池狀態，確保有足夠的連線

#### Q: 為什麼我的 FULL OUTER JOIN 失敗了？

**A:** MySQL 和 SQLite 不支援 FULL OUTER JOIN。如果您需要此功能：
- 使用 PostgreSQL
- 或者使用兩個查詢（LEFT JOIN 和 RIGHT JOIN）的 UNION 來模擬

### 從舊版遷移

如果您的程式碼使用舊版的 JOIN 語法（直接使用 `table` 屬性），需要更新為新的 `source` 屬性：

```typescript
// ❌ 舊版語法（已棄用）
joins: [
  {
    type: 'INNER',
    table: 'users',  // 舊版直接使用 table 屬性
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }
]

// ✅ 新版語法
joins: [
  {
    type: 'INNER',
    source: { table: 'users' },  // 新版使用 source 物件
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }
]

// ✅ 推薦：使用 repository 名稱
joins: [
  {
    type: 'INNER',
    source: { repository: 'users' },  // 更好的選擇
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }
]
```

**遷移步驟：**
1. 將所有 `table: 'table_name'` 改為 `source: { table: 'table_name' }`
2. 如果該資料表已定義為 repository，建議改用 `source: { repository: 'repo_name' }`
3. 測試所有使用 JOIN 的查詢確保正常運作

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