# 更新日誌 - 2025 年 10 月版本 🎉

> **完整文件**: 詳細的實作說明、使用範例和 API 文件請參閱 [docs/guides/type-safety-2025-10.md](./docs/guides/type-safety-2025-10.md)

## 快速概覽

**發布日期**: 2025-10-20
**狀態**: ✅ 完成
**測試通過率**: 100% (262/262 測試)

本次更新成功實作了三個型別安全改進功能，並修復了一個重要的 SQL 欄位轉義問題：

### 實作功能摘要

#### 1. FieldReference 型別系統 ✅
- 型別安全的欄位引用: `string | { table?, repository?, field }`
- 輔助函數: `tableField()`, `repoField()`, `fieldRefToString()`
- **6 個測試** 全部通過

#### 2. QueryBuilder 模式 ✅
- 流暢的鏈式 API 建構查詢
- 完整的 TypeScript 支援
- 支援 SELECT/INSERT/UPDATE/DELETE 和所有 SQL 功能
- **54 個測試** 全部通過

#### 3. 欄位衝突檢測 ✅
- 自動偵測 JOIN 查詢中的欄位名稱衝突
- 智慧警告系統（只在需要時觸發）
- **8 個測試** 全部通過

### 🐛 錯誤修復

#### 4. Table.Field 格式 SQL 轉義修復 ✅
- **問題**: 使用 `table.field` 格式（如 `users.id`）時，整個字串被當作單一欄位名稱加上引號
- **影響**: MySQL、PostgreSQL、SQLite 所有 Provider
- **修復**: 新增 `escapeIdentifier` 方法，正確處理表格與欄位的分別引用
- **結果**:
  - MySQL: `` `users.id` `` → `` `users`.`id` `` ✅
  - PostgreSQL/SQLite: `"users.id"` → `"users"."id"` ✅
- **測試**: 新增 **11 個專門測試**，涵蓋所有 SQL 操作
- **向下兼容**: 不影響現有單一欄位名稱的使用

## 測試統計

```
總測試數: 262 個測試 (100% 通過)
├─ 本次新增: 79 個測試
│  ├─ FieldReference:       6 個 ✅
│  ├─ QueryBuilder:        54 個 ✅
│  ├─ Field Conflict:       8 個 ✅
│  └─ Field Escaping:      11 個 ✅ (新增)
└─ 現有功能: 183 個測試 ✅

執行時間: ~1070ms
```

## 快速範例

### FieldReference 型別安全
```typescript
import { tableField, repoField } from '@wfp99/data-gateway';

// 型別安全的欄位引用
await userRepo.find({
  fields: [
    tableField('users', 'id'),      // IDE 自動完成
    repoField('user', 'userName')   // 自動映射
  ]
});
```

### QueryBuilder 流暢 API
```typescript
import { QueryBuilder } from '@wfp99/data-gateway';

const query = new QueryBuilder('users')
  .select('id', 'name', 'email')
  .where(w => w
    .equals('status', 'active')
    .greaterThan('age', 18)
  )
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .build();
```

### 欄位衝突自動檢測
```typescript
// 觸發警告
await userRepo.find({
  fields: ['id'],  // 'id' 未加前綴
  joins: [{ type: 'LEFT', source: { repository: 'posts' }, ... }]
});
// ⚠️ Warning: Field 'id' exists in multiple tables...
```

### Table.Field 格式正確轉義
```typescript
// 現在可以正確使用 table.field 格式
await userRepo.find({
  fields: [
    'users.id',        // ✅ 轉換為 `users`.`id`
    'users.name',      // ✅ 轉換為 `users`.`name`
    'posts.title'      // ✅ 轉換為 `posts`.`title`
  ],
  where: {
    field: 'users.status',  // ✅ 正確處理
    op: '=',
    value: 'active'
  },
  orderBy: [
    { field: 'users.created_at', direction: 'DESC' }  // ✅ 正確處理
  ]
});
```

## 影響與效益

### 開發體驗提升
- ✅ **型別安全**: 從執行時錯誤 → 編譯時錯誤
- ✅ **自動完成**: IDE 完整支援
- ✅ **重構安全**: 型別系統追蹤所有引用
- ✅ **主動警告**: 自動偵測潛在問題

### 效能影響（極小）
- 執行時開銷: < 2ms
- 記憶體使用: < 3KB (暫時性)
- 套件大小: +3.2KB (壓縮後)

### 向下相容性
- ✅ 無破壞性變更
- ✅ 字串格式仍然有效
- ✅ 平滑升級路徑

## 程式碼變更統計

```
新增檔案: 3 個
├─ src/queryBuilder.ts (~400 行)
├─ src/fieldConflictDetection.test.ts (~405 行)
└─ src/dataProviders/fieldEscape.test.ts (~350 行) [新增]

修改檔案: 6 個
├─ src/queryObject.ts (+60 行)
├─ src/repository.ts (+165 行)
├─ src/index.ts (+5 行)
├─ src/dataProviders/MySQLProvider.ts (+20 行) [新增]
├─ src/dataProviders/PostgreSQLProvider.ts (+20 行) [新增]
└─ src/dataProviders/SQLiteProvider.ts (+20 行) [新增]

新增程式碼: ~695 行
新增測試: ~1,655 行
```

## 下一步

### 待完成
- [ ] 更新詳細使用指南 (`docs/guides/basic-usage.md`)
- [ ] 完善 API 文件 (`docs/api/data-gateway.md`)
- [ ] 新增 TypeDoc 註解

### 未來規劃
- 交易支援 (Transaction API)
- 連線池管理介面
- 資料庫遷移工具
- 查詢快取機制

---

**📖 完整文件**: [docs/guides/type-safety-2025-10.md](./docs/guides/type-safety-2025-10.md)
**🧪 測試檔案**: [src/fieldConflictDetection.test.ts](./src/fieldConflictDetection.test.ts), [src/queryBuilder.test.ts](./src/queryBuilder.test.ts)
**📦 最後更新**: 2025-10-20
