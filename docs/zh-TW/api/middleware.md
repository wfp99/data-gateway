# Middleware 使用說明

## 什麼是 Middleware？

Middleware (中介軟體) 是一個強大的功能，它允許您在查詢實際執行之前或之後，攔截並處理查詢流程。這使得在不修改核心 [`Repository`](./repository.md) 邏輯的情況下，可以輕鬆地加入日誌記錄、權限驗證、快取、查詢改寫等自訂功能。

Middleware 的設計遵循了常見的「洋蔥模型」，每個 Middleware 都可以對傳入的 [`Query`](./query-object.md) 物件進行操作，然後透過呼叫 `next` 函式將控制權交給下一個 Middleware，最後到達核心的查詢執行邏輯。當核心邏輯或其他 Middleware 完成後，結果會沿著呼叫鏈反向傳回。

## `Middleware` 型別定義

```typescript
type Middleware = (
  query: Query,
  next: (query: Query) => Promise<QueryResult>
) => Promise<QueryResult>;
```

一個 Middleware 是一個函式，它接收兩個參數：

- **`query`**: [`Query`](./query-object.md) 物件，包含了當前的查詢請求資訊。您可以在此階段檢查或修改這個物件。
- **`next`**: 一個函式，用於將控制權傳遞給處理鏈中的下一個 Middleware。您必須呼叫 `next(query)` 並 `await` 其結果，才能繼續執行流程。您也可以傳遞一個修改過的 `Query` 物件給 `next`。如果不呼叫 `next`，則查詢流程會在此中斷。

函式必須回傳一個 `Promise<QueryResult>`。

## 範例：日誌 Middleware

這是一個簡單的日誌 Middleware，它會在查詢執行前後印出 `Query` 物件和 `QueryResult`。

```typescript
import { Middleware, Query, QueryResult } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query: Query, next: (q: Query) => Promise<QueryResult>) => {
  console.log('Executing query:', JSON.stringify(query, null, 2));

  const startTime = Date.now();
  const result = await next(query); // 將控制權交給下一個 middleware 或核心查詢邏輯
  const duration = Date.now() - startTime;

  console.log(`Query finished in ${duration}ms. Result:`, result);

  return result;
};
```

## 範例：快取 Middleware (概念)

這是一個更進階的範例，展示如何使用 Middleware 實現一個簡單的記憶體快取。

```typescript
import { Middleware, Query, QueryResult } from '@wfp99/data-gateway';

const cache = new Map<string, QueryResult>();

const cachingMiddleware: Middleware = async (query, next) => {
  // 只快取 SELECT 查詢
  if (query.type !== 'SELECT') {
    return next(query);
  }

  const cacheKey = JSON.stringify(query);

  if (cache.has(cacheKey)) {
    console.log('Cache hit!');
    return cache.get(cacheKey)!;
  }

  console.log('Cache miss, executing query...');
  const result = await next(query);

  // 將結果存入快取，並設定 5 分鐘後過期
  if (!result.error) {
    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);
  }

  return result;
};
```

## 如何設定 Middleware

在 [`DataGateway`](./data-gateway.md) 的設定檔中，針對特定的 `Repository` 指定要使用的 `middlewares` 陣列。

```typescript
const config = {
  // ... providers ...
  repositories: {
    user: {
      provider: 'mysql',
      table: 'users',
      middlewares: [loggingMiddleware, cachingMiddleware] // Middleware 會依照陣列順序執行
    },
    product: {
      provider: 'mysql',
      table: 'products',
      middlewares: [loggingMiddleware] // product repo 只使用日誌
    }
  }
};
```
Middleware 會嚴格按照您在陣列中提供的順序執行。

---

更多進階用法請見 [Repository 文件](./repository.md)。
