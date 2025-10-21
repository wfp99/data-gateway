# SQLite Provider

SQLite Provider 是專為 SQLite 資料庫設計的 Data Gateway 資料提供者。它實現了 `DataProvider` 介面，支援檔案和記憶體資料庫、連線池以及高效的查詢建構。

## 安裝

SQLite Provider 需要 `@sqlite/sqlite3` 套件作為同級依賴：

```bash
npm install @sqlite/sqlite3
```

對於開發環境，也可以使用 `sqlite3`：

```bash
npm install sqlite3
```

## 基本使用

### 檔案資料庫設定

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',  // 資料庫檔案路徑
        // 可選設定
        mode: 'OPEN_READWRITE | OPEN_CREATE',
        verbose: false
      },
    },
  },
  repositories: {
    users: {
      provider: 'sqlite',
      table: 'users',
    },
  },
});
```

### 記憶體資料庫設定

```typescript
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: ':memory:',  // 記憶體資料庫
        verbose: true         // 開發時可啟用詳細日誌
      },
    },
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' },
    cache: { provider: 'sqlite', table: 'cache_entries' },
  },
});
```

### 讀取池設定

SQLite Provider 支援讀取連線池，適合讀取密集的應用：

```typescript
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './app.db',
        pool: {
          usePool: true,              // 啟用讀取連線池
          readPoolSize: 5,           // 讀取連線池大小（預設：3）
          writeConnection: 'single', // 寫入連線模式（預設：'single'）
          acquireTimeout: 30000,     // 連線取得超時（預設：30000ms）
          idleTimeout: 300000,       // 閒置連線超時（預設：300000ms）
          preConnect: false,         // 啟動時預先建立連線（預設：false）
        },
      },
    },
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' },
  },
});
```

## 連線選項

SQLite Provider 支援多種連線選項：

```typescript
interface SQLiteProviderOptions {
  // 資料庫檔案路徑
  filename: string;  // 檔案路徑或 ':memory:' 或 ':memory:shared'

  // 開啟模式
  mode?: string;     // 'OPEN_READONLY' | 'OPEN_READWRITE' | 'OPEN_CREATE' 等

  // 除錯選項
  verbose?: boolean; // 啟用 SQL 語句日誌

  // 連線池設定（僅讀取池）
  pool?: {
    usePool: boolean;              // 是否啟用讀取連線池
    readPoolSize?: number;         // 讀取連線池大小（預設：3）
    writeConnection?: 'single';    // 寫入連線模式（僅支援 'single'）
    acquireTimeout?: number;       // 連線取得超時（預設：30000ms）
    idleTimeout?: number;          // 閒置連線超時（預設：300000ms）
    preConnect?: boolean;          // 啟動時預先建立連線（預設：false）
  };
}
```

### 檔案模式說明

```typescript
// 唯讀模式
sqlite: {
  type: 'sqlite',
  options: {
    filename: './readonly.db',
    mode: 'OPEN_READONLY'
  }
}

// 讀寫模式（如果不存在則建立）
sqlite: {
  type: 'sqlite',
  options: {
    filename: './readwrite.db',
    mode: 'OPEN_READWRITE | OPEN_CREATE'  // 預設模式
  }
}

// 共享快取記憶體資料庫
sqlite: {
  type: 'sqlite',
  options: {
    filename: ':memory:shared',  // 多個連線共享同一記憶體資料庫
    mode: 'OPEN_READWRITE | OPEN_CREATE'
  }
}
```

## 查詢功能

### 基本 CRUD 操作

```typescript
const userRepo = gateway.getRepository('users');

// 建立使用者（SQLite 自動生成 rowid）
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  created_at: Date.now()  // SQLite 支援 Unix 時間戳
});

// 查詢使用者
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// 更新使用者
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com', updated_at: Date.now() },
  { field: 'rowid', op: '=', value: userId }
);

// 刪除使用者
const deletedRows = await userRepo.delete({
  field: 'rowid',
  op: '=',
  value: userId,
});
```

### SQLite 特有查詢

```typescript
// 使用 GLOB 模式匹配（SQLite 特有）
const users = await userRepo.findMany({
  field: 'name',
  op: 'GLOB',
  value: 'John*'
});

// 使用 REGEXP（需要啟用 REGEXP 擴展）
const emailUsers = await userRepo.findMany({
  field: 'email',
  op: 'REGEXP',
  value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
});

// JSON 查詢（SQLite 3.45+）
const userPrefs = await userRepo.findMany({
  field: 'preferences',
  op: '->>',
  value: '$.theme'  // JSON 路徑查詢
});
```

### 複雜查詢

```typescript
// 全文搜索（需要 FTS5 擴展）
const searchResults = await gateway.query(`
  SELECT * FROM users_fts
  WHERE users_fts MATCH ?
  ORDER BY rank
`, ['John OR engineer']);

// 視窗函數查詢
const rankedUsers = await gateway.query(`
  SELECT
    name,
    department,
    salary,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank
  FROM users
  WHERE rank <= 3
`);

// Common Table Expression (CTE)
const departmentHierarchy = await gateway.query(`
  WITH RECURSIVE dept_tree AS (
    SELECT id, name, parent_id, 0 as level
    FROM departments
    WHERE parent_id IS NULL

    UNION ALL

    SELECT d.id, d.name, d.parent_id, dt.level + 1
    FROM departments d
    JOIN dept_tree dt ON d.parent_id = dt.id
  )
  SELECT * FROM dept_tree ORDER BY level, name
`);
```

### 聚合和統計

```typescript
// 基本統計
const stats = await userRepo.find({
  fields: [
    { type: 'COUNT', field: '*', alias: 'total_users' },
    { type: 'AVG', field: 'age', alias: 'avg_age' },
    { type: 'MIN', field: 'created_at', alias: 'first_user' },
    { type: 'MAX', field: 'created_at', alias: 'latest_user' }
  ]
});

// 分組統計
const departmentStats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: '*', alias: 'count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
});

// 中位數計算（SQLite 特有函數）
const medianSalary = await gateway.query(`
  SELECT
    department,
    AVG(salary) as median_salary
  FROM (
    SELECT
      department,
      salary,
      ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary) as row_num,
      COUNT(*) OVER (PARTITION BY department) as total_count
    FROM users
  )
  WHERE row_num IN ((total_count + 1) / 2, (total_count + 2) / 2)
  GROUP BY department
`);
```

## 讀取連線池

SQLite Provider 的讀取連線池專為讀取密集型應用設計：

```typescript
// 高讀取負載設定
sqlite: {
  type: 'sqlite',
  options: {
    filename: './high_read_load.db',
    pool: {
      usePool: true,
      readPoolSize: 10,          // 增加讀取連線數
      acquireTimeout: 5000,      // 較短的取得超時
      idleTimeout: 60000,        // 較短的閒置超時
      preConnect: true           // 預先建立連線
    }
  }
}

// 監控讀取池狀態
const poolStatus = gateway.getProviderPoolStatus('sqlite');
if (poolStatus) {
  console.log('SQLite 讀取池狀態:');
  console.log(`活躍讀取連線: ${poolStatus.activeConnections}`);
  console.log(`閒置讀取連線: ${poolStatus.idleConnections}`);
  console.log(`總讀取連線: ${poolStatus.totalConnections}`);
  console.log(`最大讀取連線: ${poolStatus.maxConnections}`);
}

// 讀寫操作示例
const userRepo = gateway.getRepository('users');

// 寫入操作（使用單一寫入連線）
await userRepo.insert({ name: 'New User', email: 'new@example.com' });

// 讀取操作（使用連線池中的讀取連線）
const users = await userRepo.findMany();
const userCount = await userRepo.find({
  fields: [{ type: 'COUNT', field: '*', alias: 'count' }]
});
```

## 效能優化

### WAL 模式

SQLite Provider 建議在生產環境中使用 WAL (Write-Ahead Logging) 模式：

```typescript
// 啟用 WAL 模式（提升並發效能）
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './app.db',
        pool: { usePool: true, readPoolSize: 5 }
      }
    }
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' }
  }
});

// 設定 WAL 模式和其他優化選項
await gateway.query('PRAGMA journal_mode = WAL');
await gateway.query('PRAGMA synchronous = NORMAL');
await gateway.query('PRAGMA cache_size = 10000');
await gateway.query('PRAGMA temp_store = MEMORY');
await gateway.query('PRAGMA mmap_size = 268435456'); // 256MB
```

### 索引優化

```typescript
// 建立索引提升查詢效能
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_department_salary ON users(department, salary);
  CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
`);

// 複合索引範例
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_status_dept_salary
  ON users(status, department, salary DESC);
`);

// 部分索引（SQLite 特有）
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_active_users
  ON users(email) WHERE status = 'active';
`);

// 表達式索引
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users(LOWER(email));
`);
```

### 批次操作

```typescript
// 批次插入優化
const users = [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' }
];

// 使用交易批次插入
await gateway.query('BEGIN TRANSACTION');
try {
  for (const user of users) {
    await userRepo.insert(user);
  }
  await gateway.query('COMMIT');
} catch (error) {
  await gateway.query('ROLLBACK');
  throw error;
}

// 或使用批次 INSERT
const placeholders = users.map(() => '(?, ?)').join(', ');
const values = users.flatMap(user => [user.name, user.email]);
await gateway.query(`
  INSERT INTO users (name, email) VALUES ${placeholders}
`, values);
```

### 記憶體使用優化

```typescript
// 記憶體優化設定
await gateway.query('PRAGMA cache_size = 2000');        // 減少快取大小
await gateway.query('PRAGMA temp_store = FILE');        // 臨時表使用檔案
await gateway.query('PRAGMA mmap_size = 67108864');     // 64MB mmap
await gateway.query('PRAGMA page_size = 4096');         // 4KB 頁面大小

// 定期清理
setInterval(async () => {
  await gateway.query('PRAGMA optimize');               // 優化查詢計劃
  await gateway.query('VACUUM');                        // 整理資料庫檔案
}, 3600000); // 每小時執行一次
```

## 資料類型處理

### SQLite 資料類型

```typescript
// SQLite 動態類型範例
await userRepo.insert({
  // 整數
  id: 1,
  age: 30,

  // 實數
  salary: 75000.50,
  rating: 4.8,

  // 文字
  name: 'John Doe',
  email: 'john@example.com',

  // BLOB
  avatar: Buffer.from('binary data'),

  // 布林值（存為整數）
  is_active: true,    // 存為 1
  is_deleted: false,  // 存為 0

  // 日期（多種格式）
  created_at: new Date(),           // ISO 字串
  updated_at: Date.now(),           // Unix 時間戳
  birth_date: '1990-01-01',         // 日期字串

  // JSON（存為文字）
  preferences: JSON.stringify({ theme: 'dark', lang: 'zh-TW' }),

  // NULL
  deleted_at: null
});
```

### 日期時間處理

```typescript
// 日期時間查詢範例
const recentUsers = await userRepo.findMany({
  field: 'created_at',
  op: '>',
  value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 天前
});

// 使用 SQLite 日期函數
const thisMonth = await gateway.query(`
  SELECT * FROM users
  WHERE DATE(created_at) >= DATE('now', 'start of month')
`);

// 日期格式化
const formatted = await gateway.query(`
  SELECT
    name,
    STRFTIME('%Y-%m-%d', created_at) as creation_date,
    STRFTIME('%H:%M', created_at) as creation_time
  FROM users
`);
```

### JSON 資料處理

```typescript
// JSON 資料操作（SQLite 3.45+）
await userRepo.insert({
  name: 'John',
  preferences: JSON.stringify({
    theme: 'dark',
    notifications: {
      email: true,
      push: false
    },
    languages: ['en', 'zh-TW']
  })
});

// JSON 查詢
const darkThemeUsers = await gateway.query(`
  SELECT name, preferences
  FROM users
  WHERE JSON_EXTRACT(preferences, '$.theme') = 'dark'
`);

// JSON 陣列查詢
const multilingualUsers = await gateway.query(`
  SELECT name, preferences
  FROM users
  WHERE JSON_ARRAY_LENGTH(JSON_EXTRACT(preferences, '$.languages')) > 1
`);
```

## 全文搜索

### FTS5 設定

```typescript
// 建立 FTS5 全文搜索表
await gateway.query(`
  CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(
    name,
    email,
    bio,
    content='users',
    content_rowid='rowid'
  );
`);

// 建立觸發器同步資料
await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_insert AFTER INSERT ON users
  BEGIN
    INSERT INTO users_fts(rowid, name, email, bio)
    VALUES (NEW.rowid, NEW.name, NEW.email, NEW.bio);
  END;
`);

await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_update AFTER UPDATE ON users
  BEGIN
    UPDATE users_fts SET name=NEW.name, email=NEW.email, bio=NEW.bio
    WHERE rowid = NEW.rowid;
  END;
`);

await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_delete AFTER DELETE ON users
  BEGIN
    DELETE FROM users_fts WHERE rowid = OLD.rowid;
  END;
`);

// 全文搜索查詢
const searchResults = await gateway.query(`
  SELECT users.*, users_fts.rank
  FROM users_fts
  JOIN users ON users.rowid = users_fts.rowid
  WHERE users_fts MATCH ?
  ORDER BY users_fts.rank
`, ['engineer OR developer']);

// 片語搜索
const phraseSearch = await gateway.query(`
  SELECT * FROM users_fts WHERE users_fts MATCH '"software engineer"'
`);

// 鄰近搜索
const proximitySearch = await gateway.query(`
  SELECT * FROM users_fts WHERE users_fts MATCH 'NEAR(software engineer, 5)'
`);
```

## 錯誤處理

SQLite Provider 提供詳細的錯誤處理：

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('SQLite 操作失敗:', error.message);

  if (error.code) {
    switch (error.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
        console.error('唯一性約束違反');
        break;
      case 'SQLITE_CONSTRAINT_NOTNULL':
        console.error('非空約束違反');
        break;
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        console.error('外鍵約束違反');
        break;
      case 'SQLITE_BUSY':
        console.error('資料庫忙碌中，請稍後重試');
        break;
      case 'SQLITE_LOCKED':
        console.error('資料庫被鎖定');
        break;
      case 'SQLITE_READONLY':
        console.error('資料庫是唯讀模式');
        break;
      case 'SQLITE_IOERR':
        console.error('I/O 錯誤，請檢查檔案權限');
        break;
      case 'SQLITE_CORRUPT':
        console.error('資料庫檔案損壞');
        break;
      case 'SQLITE_CANTOPEN':
        console.error('無法開啟資料庫檔案');
        break;
      default:
        console.error('未知 SQLite 錯誤:', error.code, error.message);
    }
  }
}
```

常見錯誤代碼：
- `SQLITE_CONSTRAINT_*`: 約束違反
- `SQLITE_BUSY`: 資料庫忙碌
- `SQLITE_LOCKED`: 資料庫被鎖定
- `SQLITE_READONLY`: 唯讀模式
- `SQLITE_IOERR`: I/O 錯誤
- `SQLITE_CORRUPT`: 檔案損壞
- `SQLITE_CANTOPEN`: 無法開啟檔案

## 安全性考量

### 檔案權限

```typescript
// 設定適當的檔案權限
import fs from 'fs';
import path from 'path';

const dbPath = './app.db';
const dbDir = path.dirname(dbPath);

// 確保目錄存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { mode: 0o750, recursive: true });
}

// 設定資料庫檔案權限
if (fs.existsSync(dbPath)) {
  fs.chmodSync(dbPath, 0o640);  // rw-r-----
}
```

### 參數化查詢

```typescript
// SQLite Provider 自動使用參數化查詢
const safeQuery = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput  // 自動轉義，防止 SQL 注入
});

// 自定義查詢也應使用參數
const customResult = await gateway.query(`
  SELECT * FROM users
  WHERE department = ? AND salary > ?
`, [userDepartment, minSalary]);  // 參數化查詢
```

### 存取控制

```typescript
// 限制檔案存取
const secureConfig = {
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: process.env.DB_PATH || './secure.db',
        mode: 'OPEN_READWRITE',  // 不自動建立檔案
        verbose: process.env.NODE_ENV === 'development'
      }
    }
  }
};

// 開發與生產環境分離
const config = process.env.NODE_ENV === 'production'
  ? productionConfig
  : developmentConfig;
```

## 備份與恢復

### 線上備份

```typescript
// 使用 SQLite 線上備份 API
import sqlite3 from '@sqlite/sqlite3';

async function backupDatabase(sourcePath: string, backupPath: string): Promise<void> {
  const source = new sqlite3.Database(sourcePath);
  const backup = new sqlite3.Database(backupPath);

  return new Promise((resolve, reject) => {
    source.backup(backup, (err) => {
      source.close();
      backup.close();

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// 定期備份
setInterval(async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await backupDatabase('./app.db', `./backups/app-${timestamp}.db`);
    console.log(`備份完成: app-${timestamp}.db`);
  } catch (error) {
    console.error('備份失敗:', error);
  }
}, 3600000); // 每小時備份
```

### VACUUM 與優化

```typescript
// 定期維護
async function maintainDatabase() {
  try {
    // 分析統計資訊
    await gateway.query('ANALYZE');

    // 重建資料庫（清理空間）
    await gateway.query('VACUUM');

    // 優化查詢計劃
    await gateway.query('PRAGMA optimize');

    console.log('資料庫維護完成');
  } catch (error) {
    console.error('資料庫維護失敗:', error);
  }
}

// 每週執行維護
setInterval(maintainDatabase, 7 * 24 * 60 * 60 * 1000);
```

## 完整範例

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';
import fs from 'fs';
import path from 'path';

async function sqliteExample() {
  // 確保資料庫目錄存在
  const dbDir = './data';
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { mode: 0o750, recursive: true });
  }

  const gateway = await DataGateway.build({
    providers: {
      sqlite: {
        type: 'sqlite',
        options: {
          filename: path.join(dbDir, 'app.db'),
          verbose: process.env.NODE_ENV === 'development',
          pool: {
            usePool: true,
            readPoolSize: 5,
            acquireTimeout: 30000,
            idleTimeout: 300000,
            preConnect: true
          }
        } as SQLiteProviderOptions
      }
    },
    repositories: {
      users: { provider: 'sqlite', table: 'users' },
      posts: { provider: 'sqlite', table: 'posts' },
      cache: { provider: 'sqlite', table: 'cache_entries' }
    }
  });

  try {
    // 初始化資料庫結構
    await gateway.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        department TEXT,
        salary REAL,
        preferences TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await gateway.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // 建立索引
    await gateway.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
    `);

    // 設定 WAL 模式和優化
    await gateway.query('PRAGMA journal_mode = WAL');
    await gateway.query('PRAGMA synchronous = NORMAL');
    await gateway.query('PRAGMA cache_size = 10000');
    await gateway.query('PRAGMA temp_store = MEMORY');

    const userRepo = gateway.getRepository('users');
    const postRepo = gateway.getRepository('posts');

    // 插入測試資料
    const userId = await userRepo?.insert({
      name: 'Alice Chen',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering',
      salary: 75000,
      preferences: JSON.stringify({
        theme: 'dark',
        notifications: { email: true, push: false }
      }),
      created_at: new Date().toISOString()
    });

    console.log(`新使用者 ID: ${userId}`);

    // 複雜查詢範例
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email', 'salary'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'is_active', op: '=', value: 1 },
          { field: 'salary', op: '>', value: 50000 }
        ]
      },
      orderBy: [{ field: 'salary', direction: 'DESC' }],
      limit: 10
    });

    console.log('工程部門使用者:', engineeringUsers?.rows);

    // JSON 查詢範例
    const darkThemeUsers = await gateway.query(`
      SELECT name, email, preferences
      FROM users
      WHERE JSON_EXTRACT(preferences, '$.theme') = 'dark'
    `);

    console.log('深色主題使用者:', darkThemeUsers);

    // 統計查詢
    const stats = await userRepo?.find({
      fields: [
        'department',
        { type: 'COUNT', field: '*', alias: 'employee_count' },
        { type: 'AVG', field: 'salary', alias: 'avg_salary' },
        { type: 'MAX', field: 'salary', alias: 'max_salary' }
      ],
      groupBy: ['department'],
      orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
    });

    console.log('部門統計:', stats?.rows);

    // 監控連線池狀態
    const poolStatus = gateway.getProviderPoolStatus('sqlite');
    if (poolStatus) {
      console.log(`SQLite 連線池狀態: ${poolStatus.activeConnections}/${poolStatus.maxConnections}`);
    }

    // 資料庫維護
    await gateway.query('PRAGMA optimize');
    console.log('資料庫優化完成');

  } catch (error) {
    console.error('SQLite 操作錯誤:', error);
  } finally {
    await gateway.disconnectAll();
  }
}

sqliteExample().catch(console.error);
```

## 最佳實踐

1. **使用 WAL 模式**：提升並發讀取效能
2. **建立適當索引**：根據查詢模式建立索引
3. **啟用讀取連線池**：適合讀取密集型應用
4. **定期維護**：執行 VACUUM 和 ANALYZE
5. **監控檔案大小**：定期清理和壓縮
6. **備份策略**：實施定期備份
7. **錯誤處理**：妥善處理檔案和權限錯誤
8. **安全設定**：適當的檔案權限和存取控制

## 相關連結

- [SQLite 官方文件](https://www.sqlite.org/docs.html)
- [@sqlite/sqlite3 套件文件](https://github.com/sqlite/sqlite3)
- [DataGateway API 文件](../api/data-gateway.zh-TW.md)
- [連線池管理指南](../advanced/connection-pooling.zh-TW.md)