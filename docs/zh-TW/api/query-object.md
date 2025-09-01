# QueryObject 格式與範例

## 什麼是 QueryObject？

`QueryObject` 是 Data Gateway 中用來描述所有資料操作（包括查詢、新增、更新、刪除）的統一資料結構。它是一個標準化的物件，讓您可以用宣告式的方式來定義複雜的資料庫操作，而無需關心底層 [`DataProvider`](./data-provider.md) 的具體 SQL 方言或 API 格式。

[`Repository`](./repository.md) 的所有方法內部都會建構並使用 `QueryObject` 來執行操作。

## `Query` 介面詳解

```typescript
interface Query {
  /** 操作類型 */
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'RAW';

  /** 目標資料表名稱 */
  table: string;

  /** 當 type 為 'RAW' 時，執行的原生 SQL 語句 */
  sql?: string;

  /**
   * 要查詢或操作的欄位。
   * 可以是欄位名稱字串，或是 Aggregate 物件。
   */
  fields?: (string | Aggregate)[];

  /**
   * 用於 'INSERT' 或 'UPDATE' 的資料。
   * 是一個 key-value 物件，key 為欄位名，value 為對應的值。
   */
  values?: Record<string, any>;

  /** 查詢條件 */
  where?: Condition;

  /** JOIN 設定 */
  joins?: Join[];

  /** GROUP BY 的欄位 */
  groupBy?: string[];

  /** 排序設定 */
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];

  /** 限制回傳的資料筆數 */
  limit?: number;

  /** 資料偏移量，用於分頁 */
  offset?: number;
}
```

## `Condition` 條件詳解

`Condition` 用於描述 `WHERE` 子句，支援巢狀結構和多種運算子。

- **基本比較**: `{ field: 'age', op: '>', value: 18 }`
  - `op`: `'=' | '!=' | '>' | '<' | '>=' | '<='`

- **IN / NOT IN (使用值陣列)**: `{ field: 'status', op: 'IN', values: ['active', 'pending'] }`

- **IN / NOT IN (使用子查詢)**: `{ field: 'id', op: 'IN', subquery: { type: 'SELECT', table: '...', ... } }`

- **LIKE**: `{ like: { field: 'name', pattern: 'John%' } }`

- **複合條件**:
  - `{ and: [condition1, condition2] }`
  - `{ or: [condition1, condition2] }`
  - `{ not: condition1 }`

## 其他相關介面

### `Aggregate`
用於描述聚合函式。
```typescript
interface Aggregate {
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  field: string;
  alias?: string; // 結果的別名
}
```

### `Join`
用於描述 JOIN 操作。
```typescript
interface Join {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string; // 要 JOIN 的資料表
  on: Condition; // JOIN 的條件
}
```

### `QueryResult<T>`
所有 [`DataProvider`](./data-provider.md) 的 `query` 方法的回傳格式。
```typescript
interface QueryResult<T = any> {
  rows?: T[]; // SELECT 的結果
  affectedRows?: number; // INSERT, UPDATE, DELETE 影響的行數
  insertId?: number | string; // INSERT 操作回傳的新增 ID
  error?: string; // 錯誤訊息
}
```

## 綜合範例

### 複雜的 SELECT 查詢
查詢 18 歲以上、狀態為 "active" 的使用者，並計算總人數，按建立時間降序排列，取前 10 筆。
```typescript
{
  type: 'SELECT',
  table: 'users',
  fields: ['id', 'name', { type: 'COUNT', field: 'id', alias: 'total' }],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  groupBy: ['id', 'name'],
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10,
  offset: 0
}
```

### INSERT 操作
```typescript
{
  type: 'INSERT',
  table: 'users',
  values: { name: 'Jane Doe', age: 30, status: 'active' }
}
```

### UPDATE 操作
```typescript
{
  type: 'UPDATE',
  table: 'users',
  values: { status: 'inactive' },
  where: { field: 'lastLogin', op: '<', value: '2023-01-01' }
}
```

---

`QueryObject` 是 Data Gateway 的核心，理解其結構有助於您充分利用 [`Repository`](./repository.md) 的所有功能。
