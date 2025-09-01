# 安裝與快速入門

## 安裝

```bash
npm install @wfp99/data-gateway
# 安裝所需資料庫驅動
npm install mysql2
# 或
npm install sqlite sqlite3
```

## 快速入門範例

```typescript
import { DataGateway, MySQLProviderOptions, SQLiteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: { host: 'localhost', user: 'root', password: '', database: 'test' } as MySQLProviderOptions
    },
    sqlite: {
      type: 'sqlite',
      options: { filename: './test.db' } as SQLiteProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' },
    log: { provider: 'sqlite', table: 'logs' }
  }
};

(async () => {
  const gateway = await DataGateway.build(config);
  const userRepo = gateway.getRepository('user');
  if (userRepo) {
    const users = await userRepo.find({ where: { field: 'status', op: '=', value: 'active' } });
    console.log(users);
  }
  await gateway.disconnectAll();
})();
```

## 常見用法

- 查詢、分頁、排序、聚合、插入、更新、刪除
- 多資料來源切換
- 自訂 [Middleware](./api/middleware.md) 與 [欄位對應](./api/entity-field-mapper.md)

更多範例請見 [API 文件](./api/index.md)。
