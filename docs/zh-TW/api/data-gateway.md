# DataGateway 與 DataGatewayConfig

## 什麼是 DataGateway？

DataGateway 是整個資料存取的中樞，統一管理多個資料來源（Provider）與儲存庫（Repository），並協助連線、斷線、CRUD 操作、欄位對應、Middleware 等。

- 支援多種資料庫（MySQL、SQLite、遠端 API、自訂 Provider）
- 可同時管理多個資料來源與多個資料表
- 提供統一的 Repository 介面
- 支援欄位自動對應與 Middleware

## DataGatewayConfig 結構

DataGatewayConfig 用於描述所有資料來源與儲存庫的設定：

```typescript
interface DataGatewayConfig {
  providers: {
    [name: string]:
      | { type: 'mysql'; options: MySQLProviderOptions }
      | { type: 'sqlite'; options: SQLiteProviderOptions }
      | { type: 'remote'; options: RemoteProviderOptions }
      | { type: 'custom'; options: { provider: DataProvider } }
      | { type: string; options: any };
  };
  repositories: {
    [name: string]: {
      provider: string; // 對應 providers 的名稱
      table: string;
      mapper?: EntityFieldMapper<any>; // 欄位對應器
      middlewares?: Middleware[]; // 查詢攔截器
    };
  };
}
```

## 常見用法

```typescript
import { DataGateway, MappingFieldMapper } from '@wfp99/data-gateway';

const config = {
  providers: {
    mainDb: {
      type: 'mysql',
      options: { host: 'localhost', user: 'root', password: 'pw', database: 'test' }
    }
  },
  repositories: {
    user: {
      provider: 'mainDb',
      table: 'users',
      mapper: new MappingFieldMapper({ userName: 'user_name' })
    }
  }
};

const gateway = await DataGateway.build(config);
const userRepo = gateway.getRepository('user');
const users = await userRepo.find();
```

## 主要方法

- `DataGateway.build(config)`：初始化所有 [Provider](./data-provider.md) 與 [Repository](./repository.md)
- `getRepository(name)`：取得指定 [Repository](./repository.md)
- `getProvider(name)`：取得指定 [Provider](./data-provider.md)
- `disconnectAll()`：斷開所有連線

---

詳細 [Provider](./data-provider.md)、[Repository](./repository.md)、[Middleware](./middleware.md)、[EntityFieldMapper](./entity-field-mapper.md) 請見對應文件。
