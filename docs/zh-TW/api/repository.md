# Repository 與查詢物件

## 什麼是 Repository？

`Repository` 封裝了對單一資料表（或資料集合）的資料存取邏輯，提供了一組通用的 CRUD (Create, Read, Update, Delete) 方法以及進階查詢功能。它隱藏了底層 [`DataProvider`](./data-provider.md) 的實作細節，並自動處理欄位名稱的對應（透過 [`EntityFieldMapper`](./entity-field-mapper.md)）以及查詢的攔截與處理（透過 [`Middleware`](./middleware.md)）。

泛型參數：
- `T`: Repository 所操作的實體物件類型。
- `M`: 實體欄位對應器 (`EntityFieldMapper`) 的類型，預設為 `EntityFieldMapper<T>`。

## Constructor

```typescript
constructor(
  provider: DataProvider,
  table: string,
  mapper: M = new DefaultFieldMapper<T>() as M,
  middlewares: Middleware[] = []
)
```
建立一個 `Repository` 實例。

- **`provider`**: [`DataProvider`](./data-provider.md) 實例，用於執行實際的資料庫查詢。
- **`table`**: 此 Repository 對應的資料表名稱。
- **`mapper`**: [`EntityFieldMapper`](./entity-field-mapper.md) 實例，用於在應用程式的物件屬性名稱與資料庫的欄位名稱之間進行轉換。預設使用 `DefaultFieldMapper`，不進行任何轉換。
- **`middlewares`**: 一個 [`Middleware`](./middleware.md) 陣列，用於在查詢執行前後進行攔截與處理。

## 主要方法

### `find(query?)`
查詢並回傳符合條件的多筆資料。

- **`query`** (可選): 一個 `Partial<Query>` 物件，用於定義查詢的各個部分，例如 `fields`、`where`、`orderBy`、`limit`、`offset` 等。您不需要在此指定 `type` 和 `table`。
- **回傳值**: `Promise<T[]>` - 一個包含查詢結果物件的陣列。

### `findOne(condition?)`
查詢並回傳符合條件的第一筆資料。

- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義查詢條件。
- **回傳值**: `Promise<T | null>` - 如果找到資料則回傳物件實體，否則回傳 `null`。

### `findMany(condition?, options?)`
根據條件查詢多筆資料，並支援分頁與排序。這是 `find` 方法的一個便利封裝。

- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義查詢條件。
- **`options`** (可選): 一個包含分頁與排序選項的物件。
    - `limit`: 回傳的資料筆數上限。
    - `offset`: 資料偏移量，用於分頁。
    - `orderBy`: 排序設定。
- **回傳值**: `Promise<T[]>` - 一個包含查詢結果物件的陣列。

### `count(field, condition?)`
計算符合條件的資料筆數。

- **`field`**: 要計算的欄位名稱。通常使用主鍵或 `*` (依賴 [`DataProvider`](./data-provider.md) 實作)。
- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義篩選條件。
- **回傳值**: `Promise<number>` - 符合條件的資料筆數。

### `sum(fields, condition?)`
計算指定欄位的總和。

- **`fields`**: 一個字串陣列，包含要計算總和的欄位名稱。
- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義篩選條件。
- **回傳值**: `Promise<Record<string, number>>` - 一個物件，其鍵為欄位名稱，值為對應的總和。

### `insert(entity)`
新增一筆資料。

- **`entity`**: 要新增的物件實體 `T`。
- **回傳值**: `Promise<number | string>` - 新增資料的 ID (通常是主鍵)，具體格式依賴 [`DataProvider`](./data-provider.md) 的實作。

### `update(values, condition?)`
更新符合條件的資料。

- **`values`**: 一個 `Partial<T>` 物件，包含要更新的欄位與值。
- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義要更新哪些資料。如果未提供，某些 [`DataProvider`](./data-provider.md) 可能會更新所有資料，請謹慎使用。
- **回傳值**: `Promise<number>` - 成功更新的資料筆數。

### `delete(condition?)`
刪除符合條件的資料。

- **`condition`** (可選): 一個 [`Condition`](./query-object.md#condition-條件詳解) 物件，用於定義要刪除哪些資料。如果未提供，某些 [`DataProvider`](./data-provider.md) 可能會刪除所有資料，請謹慎使用。
- **回傳值**: `Promise<number>` - 成功刪除的資料筆數。

## 查詢物件範例

所有查詢方法都基於統一的 [`QueryObject`](./query-object.md) 格式，這讓複雜的查詢變得簡單且一致。

```typescript
const users = await userRepo.find({
  fields: ['id', 'name'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10
});
```

---

更多查詢格式請見 [QueryObject 文件](./query-object.md)。
