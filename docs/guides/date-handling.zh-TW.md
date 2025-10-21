# 日期處理指南

Data Gateway 自動處理不同資料庫的 Date 物件轉換。

## Provider 專屬處理

### MySQL & PostgreSQL

兩者都透過驅動程式（`mysql2` 和 `pg`）原生支援 Date 物件：

**自動轉換**：
- **寫入**: Date 物件 → DATETIME/TIMESTAMP
- **讀取**: DATETIME/TIMESTAMP → Date 物件

```typescript
// 插入 Date
await userRepo.insert({
  name: 'John Doe',
  createdAt: new Date('2024-01-15T10:30:00.000Z')
});

// 查詢 Date（結果為 Date 物件）
const users = await userRepo.find({
  field: 'createdAt',
  op: '>',
  value: new Date('2024-01-01')
});
```

### SQLite

SQLite 沒有原生 Date 類型，我們實作自動轉換：

**自動轉換**：
- **寫入**: Date 物件 → ISO 8601 字串（`2024-01-15T10:30:00.000Z`）
- **讀取**: ISO 8601 字串 → Date 物件

```typescript
await logRepo.insert({
  message: '系統啟動',
  timestamp: new Date()
});

const logs = await logRepo.find({
  field: 'timestamp',
  op: '>=',
  value: new Date('2024-01-01')
});
```

**重要**：僅轉換 ISO 8601 格式字串，其他格式保持為字串。

### Remote Provider

使用類型標記進行 JSON 傳輸：

**格式**：
```json
{ "__type": "Date", "__value": "2024-01-15T10:30:00.000Z" }
```

```typescript
await remoteRepo.insert({
  title: '遠端事件',
  eventDate: new Date('2024-12-25')
});

// 日期自動還原
const events = await remoteRepo.find({
  field: 'eventDate',
  op: 'IN',
  values: [new Date('2024-12-24'), new Date('2024-12-25')]
});
```

## 使用範例

### 基本 CRUD

```typescript
const eventRepo = gateway.getRepository<Event>('event');

// 建立
await eventRepo.insert({
  title: '產品發表',
  eventDate: new Date('2024-12-31T23:59:59.000Z'),
  createdAt: new Date()
});

// 查詢
const upcoming = await eventRepo.find({
  field: 'eventDate',
  op: '>',
  value: new Date()
});

// 更新
await eventRepo.update(
  { eventDate: new Date('2025-01-01') },
  { field: 'id', op: '=', value: 1 }
);
```

### 日期範圍查詢

```typescript
const events = await eventRepo.find({
  and: [
    { field: 'eventDate', op: '>=', value: new Date('2024-01-01') },
    { field: 'eventDate', op: '<=', value: new Date('2024-12-31') }
  ]
});
```

### 搭配欄位對應

```typescript
interface Event {
  id: number;
  title: string;
  eventDate: Date;
  createdAt: Date;
}

const fieldMapper = new MappingFieldMapper<Event>({
  eventDate: 'event_date',
  createdAt: 'created_at'
});

const gateway = await DataGateway.build({
  providers: {
    db: { type: 'sqlite', options: { filename: './data.db' } }
  },
  repositories: {
    event: { provider: 'db', table: 'events', fieldMapper }
  }
});

// 日期自動轉換且欄位名稱已對應
await eventRepo.insert({
  title: '會議',
  eventDate: new Date(),  // → event_date
  createdAt: new Date()   // → created_at
});
```

## 最佳實務

### 1. 統一使用 UTC

```typescript
// 推薦 ✓
const event = {
  eventDate: new Date('2024-12-25T10:00:00.000Z')
};

// 避免 ⚠️
const event = {
  eventDate: new Date('2024-12-25T10:00:00')  // 本地時間
};
```

### 2. 驗證日期

```typescript
function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

const eventDate = new Date(userInput);
if (isValidDate(eventDate)) {
  await eventRepo.insert({ title: '事件', eventDate });
} else {
  throw new Error('無效日期');
}
```

### 3. 在 UI 層處理時區

資料庫保持 UTC，UI 層轉換：

```typescript
// 資料層：UTC
const events = await eventRepo.findAll();

// UI 層：使用者時區
events.forEach(event => {
  console.log(event.eventDate.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei'
  }));
});
```

### 4. SQLite Schema

```sql
-- 使用 TEXT 儲存 ISO 8601 字串
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,  -- ISO 8601 格式
  created_at TEXT NOT NULL
);
```

### 5. 建立索引

```sql
-- MySQL/PostgreSQL/SQLite
CREATE INDEX idx_event_date ON events(event_date);
```

## 疑難排解

### SQLite 日期未轉換

**原因**：非 ISO 8601 格式

**解決方案**：使用 ISO 8601 格式：

```typescript
// 正確 ✓
new Date().toISOString() // "2024-01-15T10:30:00.000Z"

// 不會轉換 ✗
"2024-01-15 10:30:00"
"01/15/2024"
```

### 遠端 API 日期遺失

**原因**：API 未處理類型標記

**解決方案**：確保遠端 API 使用相同序列化或手動處理

### 時區不一致

**解決方案**：
1. 統一使用 UTC
2. 使用 TIMESTAMP WITH TIME ZONE（PostgreSQL）
3. 在應用層明確處理轉換

## 資源

- [MySQL DATETIME](https://dev.mysql.com/doc/refman/8.0/en/datetime.html)
- [PostgreSQL Date/Time](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [SQLite Date Functions](https://www.sqlite.org/lang_datefunc.html)
- [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
