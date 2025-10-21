# PostgreSQL Provider

PostgreSQL Provider 是專為 PostgreSQL 資料庫設計的 Data Gateway 資料提供者。它實現了 `DataProvider` 介面，支援連線池、查詢建構和錯誤處理。

## 安裝

PostgreSQL Provider 需要 `pg` 套件作為同級依賴：

```bash
npm install pg @types/pg
```

## 基本使用

### 連線設定

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
      },
    },
  },
  repositories: {
    users: {
      provider: 'postgres',
      table: 'users',
    },
  },
});
```

### 連線池設定

PostgreSQL Provider 預設啟用連線池，可透過 `pool` 選項設定：

```typescript
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: true,                    // 啟用連線池（預設：true）
          max: 20,                         // 最大連線數（預設：10）
          min: 5,                          // 最小連線數（預設：0）
          idleTimeoutMillis: 30000,        // 閒置超時（預設：10000）
          connectionTimeoutMillis: 60000,  // 連線超時（預設：30000）
          allowExitOnIdle: false,          // 閒置時允許退出（預設：false）
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

### 停用連線池

如需使用單一連線而非連線池：

```typescript
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: false,  // 停用連線池
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

## 連線選項

PostgreSQL Provider 支援 `pg` 套件的所有 `ClientConfig` 選項：

```typescript
interface PostgreSQLProviderOptions extends ClientConfig {
  // 基本連線選項
  host?: string;
  port?: number;
  user?: string;
  password?: string | (() => string | Promise<string>);
  database?: string;
  connectionString?: string;

  // SSL 設定
  ssl?: boolean | ConnectionOptions;

  // 超時設定
  connectionTimeoutMillis?: number;
  statement_timeout?: false | number;
  query_timeout?: number;
  lock_timeout?: number;
  idle_in_transaction_session_timeout?: number;

  // 其他選項
  keepAlive?: boolean;
  keepAliveInitialDelayMillis?: number;
  application_name?: string;
  fallback_application_name?: string;
  client_encoding?: string;
  options?: string;

  // 連線池設定
  pool?: PostgreSQLConnectionPoolConfig;
}
```

## 查詢功能

### 基本 CRUD 操作

```typescript
const userRepo = gateway.getRepository('users');

// 建立使用者
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
});

// 查詢使用者
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// 更新使用者
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com' },
  { field: 'id', op: '=', value: userId }
);

// 刪除使用者
const deletedRows = await userRepo.delete({
  field: 'id',
  op: '=',
  value: userId,
});
```

### 複雜查詢

```typescript
// AND/OR 條件
const activeAdults = await userRepo.findMany({
  and: [
    { field: 'active', op: '=', value: true },
    { field: 'age', op: '>=', value: 18 },
  ],
});

// LIKE 查詢
const johnUsers = await userRepo.findMany({
  like: { field: 'name', pattern: 'John%' },
});

// IN 查詢
const specificUsers = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5],
});
```

### 聚合查詢

```typescript
// 統計查詢
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'age', alias: 'avg_age' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'department', direction: 'ASC' }],
});
```

### 分頁

```typescript
// 第一頁
const page1 = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10,
  offset: 0,
});

// 第二頁
const page2 = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10,
  offset: 10,
});
```

## 進階查詢功能

### 子查詢支援

PostgreSQL Provider 支援子查詢進行複雜篩選：

```typescript
// 找出部門員工數超過 10 人的使用者
const users = await userRepo.find({
  where: {
    field: 'department_id',
    op: 'IN',
    subquery: {
      type: 'SELECT',
      table: 'departments',
      fields: ['id'],
      where: {
        field: 'employee_count',
        op: '>',
        value: 10
      }
    }
  }
});

// 薪水高於平均值的使用者
const aboveAverageUsers = await userRepo.find({
  where: {
    field: 'salary',
    op: '>',
    subquery: {
      type: 'SELECT',
      table: 'users',
      fields: [{ type: 'AVG', field: 'salary' }]
    }
  }
});
```

### 複雜 AND/OR 條件

```typescript
// 巢狀條件的複雜篩選
const complexQuery = await userRepo.find({
  where: {
    and: [
      {
        or: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'department', op: '=', value: 'Product' }
        ]
      },
      {
        and: [
          { field: 'active', op: '=', value: true },
          { field: 'salary', op: '>', value: 50000 }
        ]
      }
    ]
  }
});
```

## 連線池監控

PostgreSQL Provider 提供連線池狀態監控：

```typescript
// 取得特定提供者的連線池狀態
const poolStatus = gateway.getProviderPoolStatus('postgres');
if (poolStatus) {
  console.log('連線池狀態:');
  console.log(`總連線數: ${poolStatus.totalConnections}`);
  console.log(`使用中連線: ${poolStatus.activeConnections}`);
  console.log(`閒置連線: ${poolStatus.idleConnections}`);
  console.log(`最大連線數: ${poolStatus.maxConnections}`);
  console.log(`最小連線數: ${poolStatus.minConnections}`);
}

// 取得所有提供者的連線池狀態
const allPoolStatuses = gateway.getAllPoolStatuses();
for (const [providerName, status] of allPoolStatuses) {
  console.log(`${providerName} 連線池狀態:`, status);
}
```

## PostgreSQL 特定資料類型

### 處理 JSON 資料

使用 PostgreSQL 的 JSON 功能時，將資料儲存為字串，在應用程式層處理 JSON 操作：

```typescript
// 插入 JSON 資料（儲存為文字）
await docRepo.insert({
  title: '產品資訊',
  metadata: JSON.stringify({
    version: '1.0',
    tags: ['product', 'info'],
    pricing: { currency: 'TWD', amount: 2990 }
  }),
});

// 查詢並解析 JSON 資料
const docs = await docRepo.find({
  fields: ['title', 'metadata'],
  where: {
    like: { field: 'metadata', pattern: '%"version":"1.0"%' }
  }
});

// 在應用程式層解析 JSON
const parsedDocs = docs.rows?.map(doc => ({
  ...doc,
  metadata: JSON.parse(doc.metadata)
}));
```

### 處理陣列

```typescript
// 將陣列資料儲存為 JSON 字串
await userRepo.insert({
  name: 'John',
  skills: JSON.stringify(['JavaScript', 'TypeScript', 'PostgreSQL']),
  scores: JSON.stringify([8.5, 9.2, 7.8]),
});

// 查詢並解析陣列資料
const users = await userRepo.find({
  where: {
    like: { field: 'skills', pattern: '%JavaScript%' }
  }
});

// 在應用程式層解析陣列
const parsedUsers = users.rows?.map(user => ({
  ...user,
  skills: JSON.parse(user.skills),
  scores: JSON.parse(user.scores)
}));
```

## 錯誤處理

PostgreSQL Provider 提供詳細的錯誤訊息：

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('插入失敗:', error.message);
  // 錯誤格式: [PostgreSQLProvider.query] 具體錯誤訊息
}
```

常見錯誤類型：
- 連線錯誤：資料庫無法連接
- SQL 語法錯誤：無效的查詢語法
- 約束違反：資料庫約束違反
- 權限錯誤：權限不足

## 效能優化

### 連線池調校

```typescript
// 高併發設定
pool: {
  max: 50,                        // 增加最大連線數
  min: 10,                        // 維持最小連線數
  idleTimeoutMillis: 60000,       // 較長的閒置超時
  connectionTimeoutMillis: 10000, // 較短的連線超時
}

// 低負載設定
pool: {
  max: 5,                         // 較少的最大連線數
  min: 1,                         // 最小連線數
  idleTimeoutMillis: 10000,       // 較短的閒置超時
}
```

### 查詢優化

```typescript
// 使用索引欄位進行查詢
const users = await userRepo.findMany({
  field: 'email',  // 確保 email 欄位有索引
  op: '=',
  value: 'user@example.com',
});

// 限制結果數量
const recentUsers = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 100,  // 限制結果
});

// 只查詢需要的欄位
const userNames = await userRepo.find({
  fields: ['id', 'name'],  // 只查詢需要的欄位
});
```

## 安全性考量

### 參數化查詢

PostgreSQL Provider 自動使用參數化查詢防止 SQL 注入：

```typescript
// 安全查詢（自動參數化）
const user = await userRepo.findOne({
  field: 'email',
  op: '=',
  value: userInput,  // 自動轉義
});

// 複雜安全查詢
const users = await userRepo.find({
  where: {
    and: [
      { field: 'department', op: '=', value: userDepartment },
      { field: 'salary', op: '>', value: minSalary }
    ]
  }
});

// 所有查詢物件都會自動防護 SQL 注入
```

### 連線安全

```typescript
// SSL 連線
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'secure-db.example.com',
        port: 5432,
        user: 'app_user',
        password: process.env.DB_PASSWORD,
        database: 'production_db',
        ssl: {
          rejectUnauthorized: true,
          ca: fs.readFileSync('server-ca.pem'),
          key: fs.readFileSync('client-key.pem'),
          cert: fs.readFileSync('client-cert.pem'),
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

## 完整範例

```typescript
import { DataGateway, PostgreSQLProviderOptions } from '@wfp99/data-gateway';

async function postgresExample() {
  const gateway = await DataGateway.build({
    providers: {
      postgres: {
        type: 'postgresql',
        options: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          database: 'testdb',
          pool: {
            usePool: true,
            max: 20,
            min: 5,
            idleTimeoutMillis: 30000,
          }
        } as PostgreSQLProviderOptions
      }
    },
    repositories: {
      users: { provider: 'postgres', table: 'users' },
      orders: { provider: 'postgres', table: 'orders' }
    }
  });

  try {
    const userRepo = gateway.getRepository('users');

    // 插入使用者
    const userId = await userRepo?.insert({
      name: 'Alice Wang',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering'
    });

    // 複雜查詢
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'age', op: '>=', value: 25 }
        ]
      },
      orderBy: [{ field: 'name', direction: 'ASC' }],
      limit: 10
    });

    console.log('工程部門使用者:', engineeringUsers);

    // 監控連線池
    const poolStatus = gateway.getProviderPoolStatus('postgres');
    console.log('PostgreSQL 連線池狀態:', poolStatus);

  } finally {
    await gateway.disconnectAll();
  }
}

postgresExample().catch(console.error);
```

## 相關連結

- [PostgreSQL 官方文件](https://www.postgresql.org/docs/)
- [node-postgres (pg) 文件](https://node-postgres.com/)
- [DataGateway API 文件](../api/data-gateway.zh-TW.md)
- [Repository API 文件](../api/repository.zh-TW.md)