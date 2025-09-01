# EntityFieldMapper 欄位對應

## 什麼是 EntityFieldMapper？

`EntityFieldMapper` 是一個關鍵的轉換層，它負責在應用程式的物件（Entity）屬性名稱與資料庫的欄位（Column）名稱之間建立橋樑。透過它，您可以在撰寫查詢、排序或條件時，統一使用物件的屬性名稱（例如 `userName`），而 `EntityFieldMapper` 會在與資料庫互動時，自動將其轉換為對應的欄位名稱（例如 `user_name`），反之亦然。

這使得您的應用程式碼可以與資料庫的具體命名慣例解耦，提高程式碼的可讀性和可維護性。

## `EntityFieldMapper<T>` 介面定義

所有欄位對應器都必須實作此介面。

- **`T`**: 泛型參數，代表 [Repository](./repository.md) 所操作的實體物件類型。

```typescript
interface EntityFieldMapper<T> {
  /**
   * 將物件屬性名稱轉換為資料庫欄位名稱。
   * @param field 物件屬性名稱。
   * @returns 對應的資料庫欄位名稱。
   */
  toDbField(field: string): string;

  /**
   * 將資料庫欄位名稱轉換為物件屬性名稱。
   * @param column 資料庫欄位名稱。
   * @returns 對應的物件屬性名稱。
   */
  fromDbField(column: string): string;

  /**
   * 將從資料庫讀取的單筆原始資料（Record<string, any>）轉換為應用程式的物件實體 T。
   * @param dbRow 從資料庫查詢到的原始資料列。
   * @returns 轉換後的物件實體 T。
   */
  fromDb(dbRow: Record<string, any>): Promise<T>;

  /**
   * 將應用程式的物件實體（或其部分）轉換為準備寫入資料庫的格式。
   * @param entity 準備寫入的物件實體（可以是部分更新）。
   * @returns 轉換後，準備傳給 DataProvider 的資料。
   */
  toDb(entity: Partial<T>): Promise<Record<string, any>>;
}
```

## 內建實作

### `DefaultFieldMapper<T>`
這是預設的欄位對應器。它不進行任何名稱轉換，直接使用物件屬性作為資料庫欄位名稱。如果您的物件屬性命名與資料庫欄位命名完全一致，則無需任何額外設定，[`Repository`](./repository.md) 會自動使用它。

**用法範例：**
```typescript
// entity.name <-> 資料庫 "name" 欄位
// entity.orderId <-> 資料庫 "orderId" 欄位
```

### `MappingFieldMapper<T>`
這是最常用的欄位對應器。它允許您透過一個簡單的對應物件，來自訂屬性與欄位之間的對應關係。非常適合處理常見的命名風格差異，例如駝峰式（camelCase）與蛇底式（snake_case）。

**建構函式：**
- `constructor(mapping: Record<string, string>)`
  - **`mapping`**: 一個對應物件，其中 `key` 是應用程式的物件屬性名稱，`value` 是對應的資料庫欄位名稱。

**用法範例：**
```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  userName: 'user_name',
  createdAt: 'created_at'
});

// 在 Repository 中使用
// new Repository(provider, 'users', userMapper);

// 之後的操作：
// entity.userName <-> 資料庫 "user_name" 欄位
// entity.createdAt <-> 資料庫 "created_at" 欄位
```

## 自訂 EntityFieldMapper 範例

除了名稱對應，您還可以自訂 `EntityFieldMapper` 來實現更複雜的資料轉換邏輯，例如日期格式處理、資料加解密、或是將多個欄位組合成一個物件等。

以下範例展示如何建立一個自訂的 Mapper，它會在讀取資料時將資料庫中的日期字串轉換為 JavaScript 的 `Date` 物件，並在寫入時進行反向轉換。

```typescript
import { DefaultFieldMapper, EntityFieldMapper } from '@wfp99/data-gateway';

// 假設 User 物件的型別
interface User {
  id: number;
  name: string;
  birthday?: Date;
}

// 繼承 DefaultFieldMapper 以重用其基本行為
class CustomDateMapper extends DefaultFieldMapper<User> {

  // 覆寫 fromDb 方法
  async fromDb(dbRow: Record<string, any>): Promise<User> {
    // 先呼叫父類別的 fromDb 進行基本轉換
    const user = await super.fromDb(dbRow);

    // 進行特殊的日期轉換
    if (user.birthday) {
      user.birthday = new Date(dbRow.birthday);
    }
    return user;
  }

  // 覆寫 toDb 方法
  async toDb(entity: Partial<User>): Promise<Record<string, any>> {
    const dbValues = { ...entity };

    // 進行特殊的日期轉換
    if (dbValues.birthday instanceof Date) {
      dbValues.birthday = dbValues.birthday.toISOString().slice(0, 10); // 轉為 'YYYY-MM-DD' 格式
    }

    return super.toDb(dbValues);
  }
}
```

## 如何設定 Mapper

在 [`DataGateway`](./data-gateway.md) 的設定檔中，為需要特殊對應的 `Repository` 指定 `mapper` 實例。如果未指定，則會使用預設的 `DefaultFieldMapper`。

```typescript
const config = {
  // ... providers ...
  repositories: {
    user: {
      provider: 'mysql',
      table: 'users',
      mapper: new MappingFieldMapper({ userName: 'user_name' })
    },
    post: {
      provider: 'mysql',
      table: 'posts',
      mapper: new CustomDateMapper()
    },
    log: {
      provider: 'sqlite',
      table: 'logs'
      // 未指定 mapper，將使用 DefaultFieldMapper
    }
  }
};
```
