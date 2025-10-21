# Remote API Provider

Remote API Provider 是透過 HTTP/HTTPS 存取遠端 API 的資料提供者。它將查詢物件轉換為 HTTP 請求，適合整合第三方 API 或微服務架構。

## 特點

- 🌐 支援任何 RESTful API 端點
- 🔐 內建 Bearer Token 認證支援
- 📤 透過 POST 請求傳送查詢物件
- 🔄 統一的查詢介面，與其他 Provider 一致
- ⚡ 無需額外資料庫驅動程式

## 基本使用

### 簡單設定

```typescript
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data'
      } as RemoteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'api', table: 'users' },
    products: { provider: 'api', table: 'products' }
  }
};

const gateway = await DataGateway.build(config);
```

### 含認證的設定

```typescript
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: 'your-secret-api-token',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': 'v1',
          'X-Client-ID': 'data-gateway'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'api', table: 'users' }
  }
};
```

## 設定選項

```typescript
interface RemoteProviderOptions {
  /** API 端點 URL */
  endpoint: string;

  /** Bearer Token 認證（可選） */
  bearerToken?: string;

  /** 額外的 HTTP 標頭（可選） */
  headers?: Record<string, string>;

  /** 請求超時時間（毫秒，預設：30000） */
  timeout?: number;
}
```

## 工作原理

Remote Provider 將所有查詢操作轉換為 HTTP POST 請求：

### 請求格式

```http
POST /data HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer your-secret-api-token

{
  "type": "SELECT",
  "table": "users",
  "fields": ["id", "name", "email"],
  "where": {
    "field": "status",
    "op": "=",
    "value": "active"
  },
  "limit": 10
}
```

### 預期回應格式

遠端 API 應該回傳符合 `QueryResult` 格式的 JSON：

```json
{
  "rows": [
    {"id": 1, "name": "John", "email": "john@example.com"},
    {"id": 2, "name": "Jane", "email": "jane@example.com"}
  ]
}
```

或對於 INSERT 操作：

```json
{
  "insertId": 123
}
```

或對於 UPDATE/DELETE 操作：

```json
{
  "affectedRows": 2
}
```

## 基本操作範例

### 查詢資料

```typescript
const userRepo = gateway.getRepository('users');

// 簡單查詢
const activeUsers = await userRepo?.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// 複雜查詢
const result = await userRepo?.find({
  fields: ['id', 'name', 'email', 'created_at'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

console.log('查詢結果:', result?.rows);
```

### 建立資料

```typescript
const newUserId = await userRepo?.insert({
  name: 'Alice Wang',
  email: 'alice@example.com',
  age: 28,
  status: 'active'
});

console.log('新建使用者 ID:', newUserId);
```

### 更新資料

```typescript
const updatedRows = await userRepo?.update(
  { status: 'inactive' },  // 更新資料
  { field: 'id', op: '=', value: 123 }  // 條件
);

console.log(`更新了 ${updatedRows} 筆資料`);
```

### 刪除資料

```typescript
const deletedRows = await userRepo?.delete({
  field: 'status',
  op: '=',
  value: 'inactive'
});

console.log(`刪除了 ${deletedRows} 筆資料`);
```

## 進階功能

### 自訂標頭

```typescript
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: process.env.API_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': '2023-10-01',
          'X-Request-Source': 'data-gateway',
          'Accept-Language': 'zh-TW'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    products: { provider: 'api', table: 'products' }
  }
};
```

### 動態認證

```typescript
// 動態取得 Token 的範例
async function getApiToken(): Promise<string> {
  // 從認證服務取得 Token
  const response = await fetch('https://auth.example.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET
    })
  });
  const data = await response.json();
  return data.access_token;
}

const token = await getApiToken();

const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: token
      } as RemoteProviderOptions
    }
  },
  repositories: {
    orders: { provider: 'api', table: 'orders' }
  }
};
```

## 錯誤處理

Remote Provider 提供詳細的錯誤資訊：

```typescript
try {
  const result = await userRepo?.findMany({
    field: 'email',
    op: '=',
    value: 'test@example.com'
  });
  console.log('成功:', result);
} catch (error) {
  console.error('API 請求失敗:', error);

  if (error instanceof Error) {
    if (error.message.includes('401')) {
      console.error('認證失敗 - 檢查 Bearer Token');
    } else if (error.message.includes('timeout')) {
      console.error('請求超時 - 檢查網路連線');
    } else if (error.message.includes('500')) {
      console.error('伺服器錯誤 - 聯繫 API 提供者');
    }
  }
}
```

常見錯誤類型：
- `401 Unauthorized`: 認證失敗
- `403 Forbidden`: 權限不足
- `404 Not Found`: API 端點不存在
- `500 Internal Server Error`: 伺服器錯誤
- `timeout`: 請求超時

## 伺服器端實作範例

以下是一個簡單的 Express.js 伺服器範例，展示如何處理來自 Remote Provider 的請求：

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// 認證中介軟體
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== 'your-secret-api-token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// 處理 Data Gateway 查詢
app.post('/data', authenticate, async (req, res) => {
  const query = req.body;

  try {
    switch (query.type) {
      case 'SELECT':
        const rows = await handleSelect(query);
        res.json({ rows });
        break;

      case 'INSERT':
        const insertId = await handleInsert(query);
        res.json({ insertId });
        break;

      case 'UPDATE':
        const affectedRows = await handleUpdate(query);
        res.json({ affectedRows });
        break;

      case 'DELETE':
        const deletedRows = await handleDelete(query);
        res.json({ affectedRows: deletedRows });
        break;

      default:
        res.status(400).json({ error: 'Unknown query type' });
    }
  } catch (error) {
    console.error('Query execution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleSelect(query) {
  // 實作查詢邏輯
  // 這裡可以連接到資料庫、檔案系統或其他資料來源
  return [
    { id: 1, name: 'John', email: 'john@example.com' },
    { id: 2, name: 'Jane', email: 'jane@example.com' }
  ];
}

async function handleInsert(query) {
  // 實作插入邏輯
  return Math.floor(Math.random() * 1000);
}

async function handleUpdate(query) {
  // 實作更新邏輯
  return 1;
}

async function handleDelete(query) {
  // 實作刪除邏輯
  return 1;
}

app.listen(3000, () => {
  console.log('API 伺服器運行於 http://localhost:3000');
});
```

## 整合第三方 API

### GitHub API 範例

```typescript
const config = {
  providers: {
    github: {
      type: 'remote',
      options: {
        endpoint: 'https://api.github.com/graphql',
        bearerToken: process.env.GITHUB_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MyApp/1.0'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    repositories: { provider: 'github', table: 'repositories' }
  }
};
```

### Shopify API 範例

```typescript
const config = {
  providers: {
    shopify: {
      type: 'remote',
      options: {
        endpoint: `https://${process.env.SHOP_NAME}.myshopify.com/admin/api/2023-10/graphql.json`,
        bearerToken: process.env.SHOPIFY_ACCESS_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    products: { provider: 'shopify', table: 'products' },
    orders: { provider: 'shopify', table: 'orders' }
  }
};
```

## 效能考量

### 請求最佳化

```typescript
// 批次查詢
const queries = [
  { field: 'category', op: '=', value: 'electronics' },
  { field: 'category', op: '=', value: 'books' },
  { field: 'category', op: '=', value: 'clothing' }
];

const results = await Promise.all(
  queries.map(query => productRepo?.findMany(query))
);
```

### 快取策略

```typescript
// 簡單的記憶體快取範例
const cache = new Map();

async function cachedQuery(repo, query, cacheKey) {
  if (cache.has(cacheKey)) {
    console.log('從快取取得資料');
    return cache.get(cacheKey);
  }

  const result = await repo.findMany(query);
  cache.set(cacheKey, result);

  // 10 分鐘後清除快取
  setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);

  return result;
}
```

## 限制

Remote Provider 有以下限制：

1. **不支援 RAW 查詢**: 基於安全考量，不支援原始 SQL 查詢
2. **網路依賴**: 依賴網路連線，可能有延遲或不穩定
3. **無連線池**: HTTP 請求無法像資料庫連線一樣進行池化管理
4. **有限的事務支援**: 無法提供資料庫級別的事務保證

## 安全性考量

### 傳輸安全

```typescript
// 使用 HTTPS 端點
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://secure-api.example.com/data',  // 使用 HTTPS
        bearerToken: process.env.API_TOKEN,  // 從環境變數取得 Token
        headers: {
          'User-Agent': 'DataGateway/1.0',
          'X-API-Key': process.env.API_KEY  // 額外的 API Key
        }
      }
    }
  }
};
```

### Token 管理

```typescript
// 安全的 Token 管理
class TokenManager {
  private token: string | null = null;
  private expiry: number = 0;

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiry) {
      return this.token;
    }

    // 重新取得 Token
    const response = await fetch('https://auth.example.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });

    const data = await response.json();
    this.token = data.access_token;
    this.expiry = Date.now() + (data.expires_in * 1000);

    return this.token;
  }
}

const tokenManager = new TokenManager();
const token = await tokenManager.getToken();
```

## 完整範例

```typescript
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

async function remoteApiExample() {
  const gateway = await DataGateway.build({
    providers: {
      jsonPlaceholder: {
        type: 'remote',
        options: {
          endpoint: 'https://jsonplaceholder.typicode.com/posts',
          headers: {
            'Content-Type': 'application/json'
          }
        } as RemoteProviderOptions
      }
    },
    repositories: {
      posts: { provider: 'jsonPlaceholder', table: 'posts' }
    }
  });

  try {
    const postRepo = gateway.getRepository('posts');

    // 查詢文章
    const posts = await postRepo?.find({
      fields: ['id', 'title', 'body'],
      limit: 5
    });

    console.log('文章列表:', posts?.rows);

    // 建立新文章
    const newPostId = await postRepo?.insert({
      title: '我的新文章',
      body: '這是文章內容',
      userId: 1
    });

    console.log('新文章 ID:', newPostId);

  } finally {
    await gateway.disconnectAll();
  }
}

remoteApiExample().catch(console.error);
```

Remote Provider 為 Data Gateway 提供了靈活的 API 整合能力，讓您可以用統一的介面存取各種遠端資料來源。