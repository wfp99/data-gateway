# 擴充與自訂開發

Data Gateway 支援高度擴充，您可以：

- 新增自訂 DataProvider（支援任何資料來源）
- 實作自訂 Middleware（如權限、快取、審計）
- 客製 EntityFieldMapper（複雜欄位對應、型別轉換）
- 擴充 Repository 方法

## 自訂 Provider 範例

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class MyProvider implements DataProvider {
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
  async query<T = any>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}
```

## 自訂 Middleware 範例

```typescript
const auditMiddleware: Middleware = async (query, next) => {
  // 審計邏輯
  return next(query);
};
```

## 進階：自訂 Repository

可繼承 Repository 並擴充方法：
```typescript
class UserRepository extends Repository<User> {
  async findActive() {
    return this.find({ where: { field: 'status', op: '=', value: 'active' } });
  }
}
```

---

更多細節請參考 [API 文件](./api/)。
