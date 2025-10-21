# 快速入門指南

5 分鐘快速上手 Data Gateway！

## 安裝

```bash
# 安裝 Data Gateway
npm install @wfp99/data-gateway

# 安裝資料庫驅動程式（選擇您需要的）
npm install mysql2              # MySQL/MariaDB
npm install pg @types/pg        # PostgreSQL
npm install sqlite3             # SQLite
```

## 基本設定

建立 `app.ts`：

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'your_password',
        database: 'your_database'
      } as MySQLProviderOptions
    }
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' }
  }
};

export default config;
```

> **連線池設定**：連線池預設已啟用。詳細設定請參考 [連線池管理指南](../advanced/connection-pooling.zh-TW.md)。

## 使用範例

```typescript
async function main() {
  const gateway = await DataGateway.build(config);
  const userRepo = gateway.getRepository('users');

  if (userRepo) {
    // 建立
    const newId = await userRepo.insert({
      name: 'John Doe',
      email: 'john@example.com',
      status: 'active'
    });

    // 條件查詢
    const activeUsers = await userRepo.find({
      where: { field: 'status', op: '=', value: 'active' },
      orderBy: [{ field: 'name', direction: 'ASC' }],
      limit: 10
    });

    // 更新
    await userRepo.update(
      { status: 'inactive' },
      { field: 'id', op: '=', value: newId }
    );

    // 刪除
    await userRepo.delete({ field: 'id', op: '=', value: newId });
  }

  await gateway.disconnectAll();
}

main().catch(console.error);
```

## 多資料來源設定

```typescript
import {
  DataGateway,
  MySQLProviderOptions,
  PostgreSQLProviderOptions,
  SQLiteProviderOptions
} from '@wfp99/data-gateway';

const multiConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'main_db'
      } as MySQLProviderOptions
    },
    postgresql: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        user: 'postgres',
        password: 'password',
        database: 'analytics_db',
        port: 5432
      } as PostgreSQLProviderOptions
    },
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './local.db'
      } as SQLiteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
    analytics: { provider: 'postgresql', table: 'events' },
    cache: { provider: 'sqlite', table: 'cache' }
  }
};
```

## 錯誤處理

```typescript
try {
  const gateway = await DataGateway.build(config);
  const result = await gateway.getRepository('users')?.insert({ name: 'Test' });
  console.log('成功:', result);
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('connection')) {
      console.error('資料庫連線失敗');
    } else if (error.message.includes('Provider')) {
      console.error('驅動程式未安裝');
    }
  }
}
```

## 下一步

- 📖 [基本使用指南](./basic-usage.zh-TW.md) - 完整功能說明
- 🔧 [Provider 指南](../providers/) - 各資料庫專屬設定
- ⚡ [連線池管理](../advanced/connection-pooling.zh-TW.md) - 效能優化
- 🏗️ [架構設計](../core/architecture.zh-TW.md) - 設計概念
