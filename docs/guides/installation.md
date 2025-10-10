# 安裝與設定

## 系統需求

- **Node.js**: 18.0.0 或更高版本
- **TypeScript**: 5.0 或更高版本（推薦，但非必需）

## 核心套件安裝

```bash
# 安裝 Data Gateway 核心套件
npm install @wfp99/data-gateway
```

## 資料庫驅動程式安裝

Data Gateway 使用**懶載入 (Lazy Loading)**機制，您只需要安裝實際使用的資料庫驅動程式：

### MySQL 支援
```bash
npm install mysql2
```

### PostgreSQL 支援
```bash
npm install pg @types/pg
```

### SQLite 支援
```bash
npm install sqlite3
```

### 遠端 API 支援
無需額外安裝，核心套件已包含 `RemoteProvider`。

## 懶載入的好處

- **只安裝需要的內容**: 程式庫使用懶載入技術，只在實際使用時才匯入資料庫提供者
- **無強制依賴**: 您可以在不安裝任何資料庫驅動程式的情況下使用 `RemoteProvider`
- **減少套件大小**: 避免安裝不必要的相依套件

## 驗證安裝

創建一個簡單的測試檔案來驗證安裝是否成功：

```typescript
// test-installation.ts
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    test: {
      type: 'remote',
      options: {
        endpoint: 'https://jsonplaceholder.typicode.com/posts'
      } as RemoteProviderOptions
    }
  },
  repositories: {
    posts: { provider: 'test', table: 'posts' }
  }
};

async function testInstallation() {
  try {
    const gateway = await DataGateway.build(config);
    console.log('✅ Data Gateway 安裝成功！');
    await gateway.disconnectAll();
  } catch (error) {
    console.error('❌ 安裝驗證失敗:', error);
  }
}

testInstallation();
```

執行測試：
```bash
npx ts-node test-installation.ts
# 或如果使用 JavaScript
node test-installation.js
```

## 常見安裝問題

### 問題 1: TypeScript 類型錯誤
**解決方案**: 確保安裝了對應的類型定義
```bash
npm install @types/node @types/pg  # 如果使用 PostgreSQL
```

### 問題 2: 模組找不到錯誤
**解決方案**: 檢查是否安裝了正確的資料庫驅動程式
```bash
# 檢查已安裝的套件
npm list mysql2 pg sqlite sqlite3
```

### 問題 3: Node.js 版本過低
**解決方案**: 升級到 Node.js 18.0.0 或更高版本
```bash
node --version  # 檢查當前版本
```

## 下一步

安裝完成後，請繼續閱讀：
- [快速入門指南](./quick-start.md)
- [基本使用方法](./basic-usage.md)