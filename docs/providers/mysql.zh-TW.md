# MySQL Provider

MySQL Provider 是專為 MySQL 和 MariaDB 資料庫設計的 Data Gateway 資料提供者。它實現了 `DataProvider` 介面，支援連線池、查詢建構和錯誤處理。

## 安裝

MySQL Provider 需要 `mysql2` 套件作為同級依賴：

```bash
npm install mysql2
```

## 基本使用

### 連線設定

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
      },
    },
  },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
    },
  },
});
```

### 連線池設定

MySQL Provider 預設啟用連線池，可透過 `pool` 選項設定：

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: true,              // 啟用連線池（預設：true）
          connectionLimit: 10,        // 最大連線數（預設：10）
          queueLimit: 0,             // 最大排隊請求數（預設：0，無限制）
          acquireTimeout: 60000,     // 連線取得超時（預設：60000ms）
          timeout: 600000,           // 閒置連線超時（預設：600000ms）
          preConnect: false,         // 啟動時預先建立連線（預設：false）
        },
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

### 停用連線池

如需使用單一連線而非連線池：

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: false,  // 停用連線池
        },
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

## 連線選項

MySQL Provider 支援 `mysql2/promise` 的所有 `ConnectionOptions`：

```typescript
interface MySQLProviderOptions extends ConnectionOptions {
  // 基本連線選項
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  charset?: string;
  timezone?: string;

  // SSL 設定
  ssl?: string | (tls.SecureContextOptions & {
    rejectUnauthorized?: boolean;
  });

  // 連線行為
  connectTimeout?: number;
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;

  // 其他選項
  multipleStatements?: boolean;
  dateStrings?: boolean | Array<'TIMESTAMP' | 'DATETIME' | 'DATE'>;
  supportBigNumbers?: boolean;
  bigNumberStrings?: boolean;
  insertIdAsNumber?: boolean;
  decimalNumbers?: boolean;

  // 連線池設定
  pool?: ConnectionPoolConfig;
}
```

## 字符集與編碼設定

### UTF8MB4 字符集（強烈建議）

**重要：** MySQL Provider 預設使用 `utf8mb4` 字符集，這是支援完整 Unicode 字符（包括 emoji、稀有漢字等）的必要設定。

#### 為什麼需要 UTF8MB4？

MySQL 的 `utf8` 字符集只支援 3 字節的 UTF-8 字符，無法正確儲存：
- Emoji 表情符號：😀、🎉、❤️
- 某些稀有漢字：𠮷、𨋢
- 部分符號：𝕏、🇹🇼

而 `utf8mb4` 支援完整的 4 字節 UTF-8 編碼，可以正確處理所有 Unicode 字符。

#### 應用程式層級配置

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'app_user',
        password: 'password',
        database: 'mydb',
        charset: 'utf8mb4',  // 預設值，支援完整 Unicode
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

#### 資料庫層級配置

除了應用程式配置外，還需要確保 MySQL 資料庫和資料表使用正確的字符集：

```sql
-- 1. 建立資料庫時指定字符集
CREATE DATABASE mydb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. 修改現有資料庫字符集
ALTER DATABASE mydb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 3. 建立資料表時指定字符集
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  bio TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 修改現有資料表字符集
ALTER TABLE users
  CONVERT TO CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

#### 驗證字符集配置

```sql
-- 檢查資料庫字符集
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'mydb';

-- 檢查資料表字符集
SHOW CREATE TABLE users;

-- 檢查欄位字符集
SELECT COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'mydb' AND TABLE_NAME = 'users';
```

#### 測試 UTF8MB4 支援

```typescript
// 測試寫入包含 emoji 和多語言字符的資料
const userRepo = gateway.getRepository('users');

await userRepo.insert({
  name: '張三',
  bio: '我是一名工程師 👨‍💻，喜歡旅遊 🌍',
  status: '活躍中 ✨'
});

// 讀取資料並驗證
const user = await userRepo.findOne({
  field: 'name',
  op: '=',
  value: '張三'
});

console.log(user.bio); // 應該正確顯示：我是一名工程師 👨‍💻，喜歡旅遊 🌍
```

#### 常見問題

**Q: 為什麼我的 emoji 顯示為 `????`？**

A: 這通常是因為：
1. 資料庫或資料表未使用 `utf8mb4` 字符集
2. 連線時未指定 `charset: 'utf8mb4'`
3. VARCHAR 欄位長度不足（utf8mb4 每字符最多 4 字節）

**Q: VARCHAR 欄位長度如何計算？**

A: 在 `utf8mb4` 中，VARCHAR(100) 表示最多 100 個字符，但：
- 每個 ASCII 字符佔 1 字節
- 每個中文字符佔 3 字節
- 每個 emoji 佔 4 字節

如果需要儲存 100 個中文字符，需要確保資料表定義允許足夠的字節數。

**Q: 如何在舊專案中遷移到 utf8mb4？**

A: 建議步驟：
1. 備份現有資料
2. 修改資料庫字符集
3. 修改資料表字符集（使用 `ALTER TABLE ... CONVERT TO`）
4. 更新應用程式連線設定
5. 測試資料完整性

#### 字符集相關警告

如果您明確指定了非 `utf8mb4` 的字符集，Provider 會在日誌中記錄警告訊息：

```
[WARN] MySQL charset is not utf8mb4. Emoji and some Unicode characters may not be stored correctly.
```

建議始終使用 `utf8mb4` 以確保完整的 Unicode 支援。

## 查詢功能

### 基本 CRUD 操作

```typescript
const userRepo = gateway.getRepository('users');

// 建立使用者
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  created_at: new Date()
});

// 查詢使用者
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// 更新使用者
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com', updated_at: new Date() },
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
    { field: 'status', op: '=', value: 'active' },
    { field: 'age', op: '>=', value: 18 },
  ],
});

// LIKE 查詢
const johnUsers = await userRepo.find({
  where: { like: { field: 'name', pattern: 'John%' } }
});

// IN 查詢
const specificUsers = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5],
});

// NULL 檢查
const deletedUsers = await userRepo.find({
  where: { field: 'deleted_at', op: 'IS NOT NULL' }
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
    { type: 'MIN', field: 'salary', alias: 'min_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  },
  orderBy: [{ field: 'user_count', direction: 'DESC' }]
});
```

### 分頁查詢

```typescript
// 第一頁
const page1 = await userRepo.find({
  where: { field: 'status', op: '=', value: 'active' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

// 第二頁
const page2 = await userRepo.find({
  where: { field: 'status', op: '=', value: 'active' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 20
});
```

## 進階查詢功能

### 子查詢支援

```typescript
// 找出薪水高於平均值的使用者
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

// 找出有訂單的使用者
const usersWithOrders = await userRepo.find({
  where: {
    field: 'id',
    op: 'IN',
    subquery: {
      type: 'SELECT',
      table: 'orders',
      fields: ['user_id'],
      where: {
        field: 'status',
        op: '=',
        value: 'completed'
      }
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
          { field: 'department', op: '=', value: 'Product' },
          { field: 'department', op: '=', value: 'Design' }
        ]
      },
      {
        and: [
          { field: 'status', op: '=', value: 'active' },
          { field: 'salary', op: '>', value: 50000 },
          {
            or: [
              { field: 'experience_years', op: '>=', value: 3 },
              { field: 'has_certification', op: '=', value: true }
            ]
          }
        ]
      }
    ]
  }
});
```

## 連線池監控

MySQL Provider 提供豐富的連線池狀態監控：

```typescript
// 取得特定提供者的連線池狀態
const poolStatus = gateway.getProviderPoolStatus('mysql');
if (poolStatus) {
  console.log('MySQL 連線池狀態:');
  console.log(`總連線數: ${poolStatus.totalConnections}`);
  console.log(`使用中連線: ${poolStatus.activeConnections}`);
  console.log(`閒置連線: ${poolStatus.idleConnections}`);
  console.log(`最大連線數: ${poolStatus.maxConnections}`);

  // 計算使用率
  const utilizationRate = (poolStatus.activeConnections / poolStatus.maxConnections * 100).toFixed(1);
  console.log(`使用率: ${utilizationRate}%`);
}

// 設定連線池監控
setInterval(() => {
  const status = gateway.getProviderPoolStatus('mysql');
  if (status) {
    const utilization = status.activeConnections / status.maxConnections;

    if (utilization > 0.8) {
      console.warn(`MySQL 連線池使用率過高: ${Math.round(utilization * 100)}%`);
    }

    if (status.activeConnections === status.maxConnections) {
      console.error('MySQL 連線池已滿，可能需要增加 connectionLimit');
    }
  }
}, 30000); // 每 30 秒檢查一次
```

## MySQL 特定功能

### 處理大數值

```typescript
// 設定大數值處理
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... 其他設定
    supportBigNumbers: true,      // 支援大數值
    bigNumberStrings: true,       // 將大數值轉為字串
    insertIdAsNumber: true,       // INSERT ID 為數字類型
    decimalNumbers: true          // 小數點數值為數字類型
  }
}

// 處理 BIGINT 欄位
const result = await userRepo.insert({
  name: 'Test User',
  big_number_field: '9223372036854775807'  // BIGINT 最大值
});
```

### 處理日期和時間

```typescript
// 設定日期字串處理
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... 其他設定
    dateStrings: ['DATE', 'DATETIME'],  // 指定欄位類型返回字串
    timezone: 'local'                   // 設定時區
  }
}

// 處理日期欄位
await userRepo.insert({
  name: 'Test User',
  birth_date: '1990-01-01',           // DATE 欄位
  created_at: new Date(),             // DATETIME 欄位
  updated_at: new Date().toISOString() // ISO 格式
});
```

### 多語句查詢

```typescript
// 啟用多語句查詢（謹慎使用）
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... 其他設定
    multipleStatements: true  // 啟用多語句
  }
}
```

## 錯誤處理

MySQL Provider 提供詳細的錯誤資訊：

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('插入失敗:', error.message);

  if (error.code) {
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        console.error('資料重複，請檢查唯一性約束');
        break;
      case 'ER_NO_SUCH_TABLE':
        console.error('表格不存在');
        break;
      case 'ER_ACCESS_DENIED_ERROR':
        console.error('存取被拒絕，請檢查使用者權限');
        break;
      case 'ECONNREFUSED':
        console.error('連線被拒絕，請檢查 MySQL 伺服器是否運行');
        break;
      case 'ER_BAD_DB_ERROR':
        console.error('資料庫不存在');
        break;
      default:
        console.error('未知錯誤:', error.code, error.message);
    }
  }
}
```

常見錯誤代碼：
- `ER_DUP_ENTRY`: 重複鍵值
- `ER_NO_SUCH_TABLE`: 表格不存在
- `ER_ACCESS_DENIED_ERROR`: 存取拒絕
- `ER_BAD_DB_ERROR`: 資料庫不存在
- `ECONNREFUSED`: 連線被拒絕
- `PROTOCOL_CONNECTION_LOST`: 連線中斷

## 效能優化

### 連線池調校

```typescript
// 高流量生產環境
pool: {
  usePool: true,
  connectionLimit: 50,        // 根據伺服器容量調整
  queueLimit: 200,           // 防止無限排隊
  acquireTimeout: 30000,     // 30 秒連線超時
  timeout: 300000,           // 5 分鐘閒置超時
  preConnect: true           // 啟動時預先建立連線
}

// 中等流量環境
pool: {
  usePool: true,
  connectionLimit: 20,
  queueLimit: 100,
  acquireTimeout: 60000,
  timeout: 600000,
  preConnect: false
}

// 低流量或開發環境
pool: {
  usePool: true,
  connectionLimit: 5,
  acquireTimeout: 60000,
  timeout: 600000
}
```

### 查詢優化

```typescript
// 使用索引欄位
const users = await userRepo.findMany({
  field: 'email',  // 確保 email 欄位有索引
  op: '=',
  value: 'user@example.com'
});

// 限制結果數量
const recentUsers = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 100  // 限制結果
});

// 只查詢需要的欄位
const userList = await userRepo.find({
  fields: ['id', 'name', 'email'],  // 只查詢必要欄位
  where: { field: 'status', op: '=', value: 'active' }
});

// 批次操作
const userIds = [1, 2, 3, 4, 5];
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: userIds  // 一次查詢多筆
});
```

## 安全性考量

### 參數化查詢

MySQL Provider 自動使用參數化查詢防止 SQL 注入：

```typescript
// 安全查詢（自動參數化）
const user = await userRepo.findOne({
  field: 'email',
  op: '=',
  value: userInput  // 自動轉義，防止 SQL 注入
});

// 複雜條件也會自動參數化
const users = await userRepo.find({
  where: {
    and: [
      { field: 'department', op: '=', value: userDepartment },
      { field: 'salary', op: '>', value: minSalary },
      { like: { field: 'name', pattern: `${searchTerm}%` } }
    ]
  }
});
```

### SSL 連線

```typescript
// SSL 連線設定
mysql: {
  type: 'mysql',
  options: {
    host: 'secure-db.example.com',
    port: 3306,
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'production_db',
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}

// 或使用簡化的 SSL 設定
mysql: {
  type: 'mysql',
  options: {
    host: 'secure-db.example.com',
    // ... 其他設定
    ssl: 'Amazon RDS'  // 預設的 SSL 設定
  }
}
```

### 連線安全

```typescript
// 安全的連線設定
mysql: {
  type: 'mysql',
  options: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',              // 支援完整的 UTF-8
    timezone: 'Z',                   // 使用 UTC 時區
    multipleStatements: false,       // 禁用多語句（安全考量）
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: true
    } : false
  }
}
```

## 高可用性設定

### 讀寫分離

```typescript
// 主從分離設定範例
const config = {
  providers: {
    // 主資料庫（寫入）
    mysqlMaster: {
      type: 'mysql',
      options: {
        host: 'master-db.example.com',
        user: 'app_user',
        password: process.env.MASTER_DB_PASSWORD,
        database: 'app_db',
        pool: {
          connectionLimit: 10
        }
      }
    },

    // 從資料庫（讀取）
    mysqlSlave: {
      type: 'mysql',
      options: {
        host: 'slave-db.example.com',
        user: 'readonly_user',
        password: process.env.SLAVE_DB_PASSWORD,
        database: 'app_db',
        pool: {
          connectionLimit: 20  // 讀取通常更多
        }
      }
    }
  },

  repositories: {
    // 寫入操作使用主資料庫
    usersWrite: { provider: 'mysqlMaster', table: 'users' },
    // 讀取操作使用從資料庫
    usersRead: { provider: 'mysqlSlave', table: 'users' }
  }
};

// 使用範例
const writeRepo = gateway.getRepository('usersWrite');
const readRepo = gateway.getRepository('usersRead');

// 寫入操作
await writeRepo.insert({ name: 'New User', email: 'new@example.com' });

// 讀取操作
const users = await readRepo.findMany();
```

### 連線重試

```typescript
// 帶重試機制的連線設定
mysql: {
  type: 'mysql',
  options: {
    host: 'db.example.com',
    // ... 其他設定
    reconnect: true,           // 啟用自動重連
    pool: {
      usePool: true,
      connectionLimit: 10,
      acquireTimeout: 30000,   // 連線取得超時
      timeout: 600000,         // 閒置超時
      preConnect: true         // 預先測試連線
    }
  }
}
```

## 完整範例

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';
import fs from 'fs';

async function mysqlExample() {
  const gateway = await DataGateway.build({
    providers: {
      mysql: {
        type: 'mysql',
        options: {
          host: 'localhost',
          port: 3306,
          user: 'app_user',
          password: process.env.MYSQL_PASSWORD,
          database: 'ecommerce',
          charset: 'utf8mb4',
          timezone: 'Z',
          pool: {
            usePool: true,
            connectionLimit: 15,
            queueLimit: 100,
            acquireTimeout: 30000,
            timeout: 300000,
            preConnect: true
          },
          ssl: process.env.NODE_ENV === 'production' ? {
            rejectUnauthorized: true,
            ca: fs.readFileSync('mysql-ca.pem')
          } : false
        } as MySQLProviderOptions
      }
    },
    repositories: {
      users: { provider: 'mysql', table: 'users' },
      orders: { provider: 'mysql', table: 'orders' },
      products: { provider: 'mysql', table: 'products' }
    }
  });

  try {
    const userRepo = gateway.getRepository('users');
    const orderRepo = gateway.getRepository('orders');

    // 建立使用者
    const userId = await userRepo?.insert({
      name: 'Alice Wang',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering',
      salary: 75000,
      created_at: new Date()
    });

    console.log(`新使用者 ID: ${userId}`);

    // 複雜查詢
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email', 'salary'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'age', op: '>=', value: 25 },
          { field: 'salary', op: '>', value: 60000 }
        ]
      },
      orderBy: [{ field: 'salary', direction: 'DESC' }],
      limit: 10
    });

    console.log('工程部門高薪使用者:', engineeringUsers?.rows);

    // 聚合查詢
    const departmentStats = await userRepo?.find({
      fields: [
        'department',
        { type: 'COUNT', field: 'id', alias: 'employee_count' },
        { type: 'AVG', field: 'salary', alias: 'avg_salary' },
        { type: 'MAX', field: 'salary', alias: 'max_salary' }
      ],
      groupBy: ['department'],
      having: {
        field: { type: 'COUNT', field: 'id' },
        op: '>',
        value: 5
      },
      orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
    });

    console.log('部門統計:', departmentStats?.rows);

    // 監控連線池
    const poolStatus = gateway.getProviderPoolStatus('mysql');
    if (poolStatus) {
      console.log(`MySQL 連線池狀態: ${poolStatus.activeConnections}/${poolStatus.maxConnections} 使用中`);
    }

  } catch (error) {
    console.error('MySQL 操作錯誤:', error);
  } finally {
    await gateway.disconnectAll();
  }
}

mysqlExample().catch(console.error);
```

## 相關連結

- [MySQL 官方文件](https://dev.mysql.com/doc/)
- [mysql2 套件文件](https://github.com/sidorares/node-mysql2)
- [DataGateway API 文件](../api/data-gateway.zh-TW.md)
- [連線池管理指南](../advanced/connection-pooling.zh-TW.md)