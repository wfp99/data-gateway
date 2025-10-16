# UTF8MB4 字符集支援分析報告

## 執行日期
2025-10-17

## 概述
本報告詳細分析 data-gateway 專案對 UTF8MB4 字符集的支援情況，特別關注中日韓（CJK）文字和 Emoji 的處理能力。

## 測試結果摘要

### ✅ 通過的測試項目

#### 1. JavaScript 層面的字符處理
- **中文字符處理**: ✅ 完全支援
  - 測試案例：`張三`, `這是一個測試用的中文描述`
  - 字符正確保存和讀取無誤

- **日文字符處理**: ✅ 完全支援
  - 平假名: `あいうえお`
  - 片假名: `アイウエオ`
  - 漢字: `漢字テスト`

- **韓文字符處理**: ✅ 完全支援
  - 測試案例：`김철수`, `안녕하세요`

- **Emoji 字符處理**: ✅ 完全支援
  - 基本 emoji: `😀😁😂🤣`
  - 複合 emoji: `👨‍👩‍👧‍👦`
  - 旗幟 emoji: `🇹🇼`
  - 符號 emoji: `❤️💚💙`

- **4字節 UTF-8 字符**: ✅ 完全支援
  - 古代漢字: `𠮷`
  - 數學符號: `𝕏𝕐𝕑`
  - 音樂符號: `𝄞𝄢𝄫`

#### 2. 字符串長度與編碼
- ✅ 正確處理多字節字符的長度計算
- ✅ 正確計算 UTF-8 字節長度
- ✅ JSON 序列化/反序列化保持字符完整性

#### 3. 資料庫識別符驗證
- ✅ 正確阻止在表名/欄位名中使用多字節字符
- ✅ 僅允許 ASCII 字符用於資料庫識別符

## 各資料庫提供者分析

### 1. MySQL Provider

#### 優點
- ✅ 使用 `mysql2` 驅動，原生支援 UTF8MB4
- ✅ 允許通過 `ConnectionOptions` 設置 `charset` 選項
- ✅ 文檔中明確建議使用 `charset: 'utf8mb4'`
- ✅ 使用參數化查詢（prepared statements）防止注入
- ✅ 正確驗證 SQL 識別符

#### 配置範例
```typescript
{
  type: 'mysql',
  options: {
    host: 'localhost',
    user: 'app_user',
    password: 'password',
    database: 'app_db',
    charset: 'utf8mb4',  // ✅ 關鍵配置
    timezone: 'Z',
  }
}
```

#### 注意事項
⚠️ **需要確保的事項：**
1. MySQL 伺服器版本 >= 5.5.3（UTF8MB4 支援開始版本）
2. 資料庫字符集設置為 utf8mb4：
   ```sql
   CREATE DATABASE mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. 資料表字符集設置為 utf8mb4：
   ```sql
   CREATE TABLE users (
     id INT PRIMARY KEY,
     name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
   );
   ```
4. VARCHAR 欄位長度需要考慮字節數（utf8mb4 每字符最多 4 字節）

### 2. PostgreSQL Provider

#### 優點
- ✅ PostgreSQL 預設使用 UTF-8 編碼
- ✅ 自動支援所有 Unicode 字符，包括 emoji
- ✅ 使用參數化查詢（$1, $2 等）
- ✅ 正確驗證 SQL 識別符

#### 配置範例
```typescript
{
  type: 'postgresql',
  options: {
    host: 'localhost',
    user: 'postgres',
    password: 'password',
    database: 'app_db',
    client_encoding: 'UTF8',  // 通常預設即為 UTF8
  }
}
```

#### 注意事項
✅ PostgreSQL 對 UTF-8 的支援非常完善，通常不需要額外配置

### 3. SQLite Provider

#### 優點
- ✅ SQLite 原生使用 UTF-8 和 UTF-16 編碼
- ✅ 自動支援所有 Unicode 字符
- ✅ 使用參數化查詢（? 佔位符）
- ✅ 包含 Date 轉換為 ISO 8601 字符串的邏輯

#### 配置範例
```typescript
{
  type: 'sqlite',
  options: {
    filename: './database.db',
  }
}
```

#### 注意事項
✅ SQLite 預設使用 UTF-8，無需額外配置

## 程式碼層面的字符處理

### ✅ 正確的實作

#### 1. 參數化查詢
所有三個資料庫提供者都使用參數化查詢，避免 SQL 注入並正確處理特殊字符：

```typescript
// MySQL
const sql = `SELECT * FROM users WHERE name = ?`;
await connection.execute(sql, [userName]);

// PostgreSQL
const sql = `SELECT * FROM users WHERE name = $1`;
await connection.query(sql, [userName]);

// SQLite
const sql = `SELECT * FROM users WHERE name = ?`;
await db.all(sql, [userName]);
```

#### 2. 識別符驗證
所有提供者都正確驗證 SQL 識別符，防止包含多字節字符：

```typescript
private validateIdentifier(identifier: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}
```

#### 3. 特殊字符處理
使用引號包裝識別符，避免關鍵字衝突：

```typescript
// MySQL: 使用反引號
`SELECT \`name\`, \`email\` FROM \`users\``

// PostgreSQL & SQLite: 使用雙引號
`SELECT "name", "email" FROM "users"`
```

## 潛在問題與建議

### ⚠️ 需要注意的問題

#### 1. MySQL 預設配置問題
**問題描述：**
- 如果用戶未明確設置 `charset: 'utf8mb4'`，可能會使用 MySQL 預設的 `latin1` 或 `utf8`（3字節）
- `utf8`（3字節）無法正確儲存 emoji 和某些稀有字符

**建議改進：**
```typescript
// 在 MySQLProvider 建構函數中添加預設值
constructor(options: MySQLProviderOptions) {
  this.options = {
    charset: 'utf8mb4',  // 設置預設值
    ...options,
  };
  // ...
}
```

#### 2. 文檔完整性
**當前狀態：**
- ✅ MySQL 文檔中有提到 `charset: 'utf8mb4'`
- ⚠️ 未強調這是必要配置
- ⚠️ 未提供資料庫層面的配置說明

**建議改進：**
在 MySQL 文檔中添加專門的 "字符集配置" 章節，說明：
1. 為什麼需要 UTF8MB4
2. 如何在資料庫層面配置
3. 如何驗證配置是否正確
4. 常見問題排查

#### 3. 測試覆蓋率
**當前狀態：**
- ✅ 已添加基本的字符處理測試
- ⚠️ 缺少實際資料庫連線的 UTF8MB4 整合測試

**建議改進：**
添加整合測試，實際測試：
- 寫入包含 emoji 的資料到 MySQL
- 從資料庫讀取並驗證字符完整性
- 測試不同長度的多字節字符串

## 實用案例驗證

### ✅ 已驗證的使用場景

1. **社群媒體內容**
   ```typescript
   {
     content: '今天天氣真好！☀️ #天氣 #好心情',
     reactions: ['讚 👍', '同感！😊', 'Nice! 🎉']
   }
   ```

2. **多語言用戶資料**
   ```typescript
   {
     name: '張偉',
     bio: '我是一名軟體工程師 👨‍💻',
     location: '台北 🇹🇼'
   }
   ```

3. **商品描述**
   ```typescript
   {
     name: '超級好吃的拉麵 🍜',
     description: '來自日本的正宗拉麵，湯頭濃郁 😋',
     rating: '⭐⭐⭐⭐⭐'
   }
   ```

## 建議改進措施

### 優先級：高

1. **為 MySQL Provider 設置預設 charset**
   ```typescript
   // src/dataProviders/MySQLProvider.ts
   constructor(options: MySQLProviderOptions) {
     this.options = {
       charset: 'utf8mb4',
       ...options,
     };
     // 在日誌中記錄使用的字符集
     this.logger.debug('MySQL charset configured', {
       charset: this.options.charset
     });
   }
   ```

2. **添加字符集驗證警告**
   ```typescript
   async connect(): Promise<void> {
     // ... existing connection code

     // 驗證連線字符集
     if (this.options.charset !== 'utf8mb4') {
       this.logger.warn(
         'MySQL charset is not utf8mb4. Emoji and some Unicode characters may not be stored correctly.',
         { charset: this.options.charset }
       );
     }
   }
   ```

### 優先級：中

3. **完善文檔**
   - 添加 "字符集與編碼" 專門章節
   - 提供完整的 MySQL UTF8MB4 配置指南
   - 添加常見問題與解決方案

4. **添加整合測試**
   - 測試實際資料庫寫入/讀取 emoji
   - 測試 CJK 字符的完整性
   - 測試邊界情況（最大長度、特殊字符組合）

### 優先級：低

5. **添加工具函數**
   ```typescript
   // 提供字符串字節長度計算工具
   export function getUtf8ByteLength(str: string): number {
     return new TextEncoder().encode(str).length;
   }

   // 提供字符串截斷工具（按字節數）
   export function truncateByBytes(
     str: string,
     maxBytes: number
   ): string {
     // Implementation
   }
   ```

## 結論

### 總體評估：✅ 良好

**優點：**
1. ✅ JavaScript/TypeScript 層面完全支援 UTF8MB4 字符
2. ✅ 所有資料庫提供者使用參數化查詢，正確處理特殊字符
3. ✅ 識別符驗證機制完善，防止 SQL 注入
4. ✅ PostgreSQL 和 SQLite 無需額外配置即可完美支援

**需要改進：**
1. ⚠️ MySQL Provider 應該預設使用 `charset: 'utf8mb4'`
2. ⚠️ 文檔需要更明確地說明字符集配置的重要性
3. ⚠️ 缺少實際資料庫的 UTF8MB4 整合測試

**整體建議：**
專案在程式碼層面對 UTF8MB4 的支援是完善的，但需要在 MySQL 配置上提供更好的預設值和警告機制，以確保用戶不會因為忘記配置 charset 而遇到問題。建議實施上述優先級高的改進措施。

## 驗證清單

使用此專案時，請確認：

### MySQL 用戶
- [ ] 連線選項中設置 `charset: 'utf8mb4'`
- [ ] 資料庫使用 `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
- [ ] 資料表使用 UTF8MB4 字符集
- [ ] VARCHAR/TEXT 欄位考慮字節長度（每字符最多 4 字節）

### PostgreSQL 用戶
- [ ] 資料庫編碼為 UTF8（通常為預設值）

### SQLite 用戶
- [ ] 無需特殊配置（預設支援 UTF-8）

### 所有用戶
- [ ] 應用程式程式碼使用 UTF-8 編碼保存
- [ ] HTTP 回應設置正確的 Content-Type（如 `application/json; charset=utf-8`）
- [ ] 前端正確處理和顯示 UTF-8 字符

---

## 附錄：快速測試方法

### 測試 MySQL UTF8MB4 支援

```sql
-- 檢查資料庫字符集
SHOW CREATE DATABASE your_database;

-- 檢查資料表字符集
SHOW CREATE TABLE your_table;

-- 測試寫入 emoji
INSERT INTO your_table (content) VALUES ('Hello 😀 World 🌍');

-- 測試讀取
SELECT content FROM your_table;

-- 如果 emoji 顯示為 ???，則字符集配置不正確
```

### 測試 PostgreSQL UTF8 支援

```sql
-- 檢查資料庫編碼
SHOW SERVER_ENCODING;

-- 測試寫入 emoji
INSERT INTO your_table (content) VALUES ('Hello 😀 World 🌍');

-- 測試讀取
SELECT content FROM your_table;
```

### 測試 SQLite UTF-8 支援

```javascript
// SQLite 自動支援 UTF-8
const db = await open({ filename: './test.db' });
await db.run(
  "INSERT INTO test (content) VALUES (?)",
  ['Hello 😀 World 🌍']
);
const result = await db.get("SELECT content FROM test");
console.log(result.content); // Should display emoji correctly
```
