# 架構設計與核心概念

Data Gateway 採用模組化、可擴展的設計，核心組件如下：

## 架構圖

```
+-------------------+
|   DataGateway     |
+-------------------+
|  Repository Map   |
|  Provider Map     |
+-------------------+
        | 依賴
        v
+-------------------+
|   Repository<T>   |
+-------------------+
| CRUD/查詢邏輯      |
| EntityFieldMapper |
| Middleware        |
+-------------------+
        | 依賴
        v
+-------------------+
|   DataProvider    |
+-------------------+
| MySQL/SQLite/Remote|
| Custom Provider   |
+-------------------+
```

## 核心概念

- **[DataGateway](./api/data-gateway.md)**：整合多個資料來源與儲存庫的中樞，統一管理連線與 CRUD 操作。
- **[DataProvider](./api/data-provider.md)**：抽象資料來源介面，內建 MySQL、SQLite、RemoteProvider，也可自訂。
- **[Repository](./api/repository.md)**：封裝單一資料表的 CRUD 與查詢邏輯，支援 Middleware 與欄位對應。
- **[Middleware](./api/middleware.md)**：可插拔的查詢攔截器，支援日誌、驗證、快取等。
- **[EntityFieldMapper](./api/entity-field-mapper.md)**：欄位對應器，協助物件屬性與資料庫欄位自動轉換。
- **[QueryObject](./api/query-object.md)**：統一查詢物件格式，支援複雜條件、分頁、排序、聚合等。

## 主要流程

1. 使用者呼叫 [DataGateway](./api/data-gateway.md) 取得 [Repository](./api/repository.md)。
2. [Repository](./api/repository.md) 依據查詢物件，經 [EntityFieldMapper](./api/entity-field-mapper.md) 轉換欄位。
3. 查詢經 [Middleware](./api/middleware.md) 處理後，交由 [DataProvider](./api/data-provider.md) 執行。
4. 結果回傳並自動轉換為應用層物件。

---

詳細 API 與用法請見 [API 文件](./api/)。
