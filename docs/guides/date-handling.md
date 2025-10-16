# Date 物件處理指南

本指南說明 data-gateway 如何處理 JavaScript Date 物件與資料庫之間的轉換。

## 概述

data-gateway 的各個 Provider 會自動處理 JavaScript Date 物件與資料庫時間欄位之間的轉換，讓開發者可以無縫使用 Date 物件進行資料操作。

## 各 Provider 的 Date 處理方式

### MySQL Provider

MySQL Provider 使用 `mysql2` 驅動，該驅動會自動處理 Date 物件：

- **寫入時**：JavaScript Date 物件會自動轉換為 MySQL 的 DATETIME 或 TIMESTAMP 格式
- **讀取時**：資料庫的 DATETIME/TIMESTAMP 欄位會自動轉換為 JavaScript Date 物件

```typescript
// 插入 Date 物件
await userRepo.insert({
  name: 'John Doe',
  createdAt: new Date('2024-01-15T10:30:00.000Z')
});

// 查詢結果會自動轉換回 Date 物件
const users = await userRepo.find({
  field: 'createdAt',
  op: '>',
  value: new Date('2024-01-01T00:00:00.000Z')
});
// users[0].createdAt 是 Date 物件
```

### PostgreSQL Provider

PostgreSQL Provider 使用 `pg` 驅動，該驅動也會自動處理 Date 物件：

- **寫入時**：JavaScript Date 物件會自動轉換為 PostgreSQL 的 TIMESTAMP 格式
- **讀取時**：資料庫的 TIMESTAMP 欄位會自動轉換為 JavaScript Date 物件

```typescript
// 與 MySQL 相同的使用方式
await eventRepo.insert({
  title: 'Important Meeting',
  eventDate: new Date('2024-06-20T15:00:00.000Z')
});

const events = await eventRepo.find({
  field: 'eventDate',
  op: '>=',
  value: new Date('2024-06-01T00:00:00.000Z')
});
```

### SQLite Provider

SQLite 本身不支援原生的 Date 類型，data-gateway 的 SQLite Provider 實作了自動轉換機制：

- **寫入時**：JavaScript Date 物件會轉換為 ISO 8601 字串格式（例如：`2024-01-15T10:30:00.000Z`）
- **讀取時**：符合 ISO 8601 格式的字串會自動轉換回 JavaScript Date 物件

```typescript
// 插入 Date 物件（會儲存為 ISO 字串）
await logRepo.insert({
  message: 'System started',
  timestamp: new Date()
});

// 查詢結果會自動轉換回 Date 物件
const logs = await logRepo.find({
  field: 'timestamp',
  op: '>=',
  value: new Date('2024-01-01T00:00:00.000Z')
});
// logs[0].timestamp 是 Date 物件
```

**注意事項**：
- SQLite 將日期儲存為 TEXT 類型
- 只有符合 ISO 8601 格式（`YYYY-MM-DDTHH:mm:ss.sssZ`）的字串才會被轉換回 Date 物件
- 其他格式的字串會保持原樣，不會被轉換

### Remote Provider

Remote Provider 透過網路傳輸 JSON 資料時，實作了特殊的序列化/反序列化機制：

- **寫入時**：Date 物件會轉換為帶有類型標記的特殊格式：
  ```json
  { "__type": "Date", "__value": "2024-01-15T10:30:00.000Z" }
  ```
- **讀取時**：帶有 `__type: "Date"` 標記的物件會自動還原為 JavaScript Date 物件

```typescript
// Date 物件會在 JSON 序列化時被標記
await remoteRepo.insert({
  title: 'Remote Event',
  eventDate: new Date('2024-12-25T00:00:00.000Z')
});

// 從遠端 API 回傳的 Date 會被自動還原
const events = await remoteRepo.find({
  field: 'eventDate',
  op: 'IN',
  values: [
    new Date('2024-12-24T00:00:00.000Z'),
    new Date('2024-12-25T00:00:00.000Z')
  ]
});
```

**優點**：
- 保持完整的 Date 資訊（包括時區）
- 可以處理巢狀物件和陣列中的 Date 物件
- 不影響其他資料類型

## 使用範例

### 基本 CRUD 操作

```typescript
const gateway = await DataGateway.build({
  providers: {
    db: {
      type: 'sqlite',
      options: { filename: './data.db' }
    }
  },
  repositories: {
    event: { provider: 'db', table: 'events' }
  }
});

const eventRepo = gateway.getRepository<Event>('event');

// 1. 插入包含 Date 的資料
await eventRepo.insert({
  title: 'Product Launch',
  eventDate: new Date('2024-12-31T23:59:59.000Z'),
  createdAt: new Date()
});

// 2. 使用 Date 進行查詢
const upcomingEvents = await eventRepo.find({
  field: 'eventDate',
  op: '>',
  value: new Date()
});

// 3. 更新 Date 欄位
await eventRepo.update(
  { eventDate: new Date('2025-01-01T00:00:00.000Z') },
  { field: 'title', op: '=', value: 'Product Launch' }
);

// 4. 使用 Date 陣列的 IN 查詢
const specificDates = await eventRepo.find({
  field: 'eventDate',
  op: 'IN',
  values: [
    new Date('2024-12-24T00:00:00.000Z'),
    new Date('2024-12-25T00:00:00.000Z')
  ]
});
```

### 複雜條件查詢

```typescript
// 查詢特定時間範圍內的事件
const events = await eventRepo.find({
  and: [
    {
      field: 'eventDate',
      op: '>=',
      value: new Date('2024-01-01T00:00:00.000Z')
    },
    {
      field: 'eventDate',
      op: '<=',
      value: new Date('2024-12-31T23:59:59.999Z')
    }
  ]
});
```

### 與 EntityFieldMapper 配合使用

```typescript
interface Event {
  id: number;
  title: string;
  eventDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const fieldMapper = new MappingFieldMapper<Event>({
  eventDate: 'event_date',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const gateway = await DataGateway.build({
  providers: {
    db: { type: 'sqlite', options: { filename: './data.db' } }
  },
  repositories: {
    event: {
      provider: 'db',
      table: 'events',
      fieldMapper
    }
  }
});

// Date 物件會自動轉換，欄位名稱也會被映射
const eventRepo = gateway.getRepository<Event>('event');
await eventRepo.insert({
  title: 'Meeting',
  eventDate: new Date(),  // 會轉換並映射到 event_date
  createdAt: new Date(),  // 會轉換並映射到 created_at
  updatedAt: new Date()   // 會轉換並映射到 updated_at
});
```

## 最佳實踐

### 1. 始終使用 UTC 時間

建議在應用程式中統一使用 UTC 時間，避免時區轉換的問題：

```typescript
// 好的做法 ✓
const event = {
  title: 'Meeting',
  eventDate: new Date('2024-12-25T10:00:00.000Z')  // UTC 時間
};

// 需要注意的做法 ⚠️
const event = {
  title: 'Meeting',
  eventDate: new Date('2024-12-25T10:00:00')  // 本地時間，可能造成混淆
};
```

### 2. 驗證日期有效性

在插入或更新資料前，驗證 Date 物件的有效性：

```typescript
function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

// 使用驗證
const eventDate = new Date(userInput);
if (isValidDate(eventDate)) {
  await eventRepo.insert({ title: 'Event', eventDate });
} else {
  throw new Error('Invalid date');
}
```

### 3. 處理時區顯示

在 UI 層面處理時區轉換，而不是在資料層：

```typescript
// 資料層：統一使用 UTC
const events = await eventRepo.findAll();

// UI 層：根據使用者時區顯示
events.forEach(event => {
  // 使用 Intl.DateTimeFormat 或日期函式庫（如 date-fns, dayjs）
  console.log(event.eventDate.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei'
  }));
});
```

### 4. SQLite 的注意事項

使用 SQLite 時，確保資料庫欄位類型設定正確：

```sql
-- 推薦：使用 TEXT 類型儲存 ISO 8601 字串
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,  -- 將儲存 ISO 8601 格式
  created_at TEXT NOT NULL
);

-- 不推薦：使用 INTEGER 儲存 Unix timestamp
-- 因為 data-gateway 會轉換為 ISO 字串，不是數字
```

### 5. 效能考量

對於需要大量日期查詢的應用，建議在資料庫層面建立索引：

```sql
-- MySQL
CREATE INDEX idx_event_date ON events(event_date);

-- PostgreSQL
CREATE INDEX idx_event_date ON events(event_date);

-- SQLite
CREATE INDEX idx_event_date ON events(event_date);
```

## 疑難排解

### 問題 1：SQLite 的日期沒有轉換為 Date 物件

**原因**：儲存的字串格式不符合 ISO 8601 標準

**解決方案**：確保儲存的是標準 ISO 8601 格式（`YYYY-MM-DDTHH:mm:ss.sssZ`）

```typescript
// 正確 ✓
new Date().toISOString() // "2024-01-15T10:30:00.000Z"

// 不會被轉換 ✗
"2024-01-15 10:30:00"
"01/15/2024"
```

### 問題 2：Remote Provider 的 Date 丟失

**原因**：遠端 API 沒有正確處理 Date 的特殊標記格式

**解決方案**：確保遠端 API 也實作相同的序列化/反序列化機制，或考慮在應用層面處理

### 問題 3：時區不一致

**原因**：不同環境使用不同的時區

**解決方案**：
1. 統一使用 UTC 時間
2. 在資料庫層面使用 TIMESTAMP WITH TIME ZONE（PostgreSQL）
3. 在應用層面明確處理時區轉換

## 相關資源

- [JavaScript Date 物件文件](https://developer.mozilla.org/zh-TW/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [ISO 8601 標準](https://en.wikipedia.org/wiki/ISO_8601)
- [MySQL DATETIME 與 TIMESTAMP](https://dev.mysql.com/doc/refman/8.0/en/datetime.html)
- [PostgreSQL Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [SQLite Date And Time Functions](https://www.sqlite.org/lang_datefunc.html)
