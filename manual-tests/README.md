# MySQL 手動測試指南

本資料夾包含使用 Docker 進行 MySQL 功能測試的完整環境。

## 📋 目錄結構

```
manual-tests/
├── docker-compose.yml    # Docker Compose 配置
├── init.sql             # 資料庫初始化腳本
├── test-mysql.ts        # MySQL 功能測試程式
├── package.json         # 測試專案依賴
└── README.md           # 本文件
```

## 🚀 快速開始

### 1. 啟動 MySQL Docker 容器

```bash
cd manual-tests
docker-compose up -d
```

### 2. 等待 MySQL 就緒

檢查容器健康狀態：
```bash
docker-compose ps
```

查看日誌：
```bash
docker-compose logs -f mysql
```

當看到 "ready for connections" 訊息時，表示 MySQL 已經準備就緒。

### 3. 安裝測試依賴

```bash
npm install
```

### 4. 執行測試

```bash
npm test
```

或直接執行：
```bash
npx tsx test-mysql.ts
```

## 📊 測試涵蓋範圍

測試程式會驗證以下所有功能：

### 基本功能
- ✅ 資料庫連線
- ✅ 基本查詢 (SELECT)
- ✅ 插入資料 (INSERT)
- ✅ 更新資料 (UPDATE)
- ✅ 刪除資料 (DELETE)

### 條件查詢
- ✅ 比較運算符 (`=`, `!=`, `>`, `<`, `>=`, `<=`)
- ✅ `IS NULL` / `IS NOT NULL`
- ✅ `LIKE` 模糊查詢
- ✅ `IN` / `NOT IN`
- ✅ `AND` / `OR` / `NOT` 邏輯組合

### 進階功能
- ✅ JOIN 查詢 (INNER JOIN)
- ✅ 聚合函數 (COUNT, SUM, AVG, MIN, MAX)
- ✅ GROUP BY
- ✅ ORDER BY
- ✅ LIMIT / OFFSET (分頁)

### QueryBuilder API
- ✅ `.select()`
- ✅ `.where()` 及所有條件方法
- ✅ `.isNull()` / `.isNotNull()`
- ✅ `.like()`
- ✅ `.in()` / `.notIn()`
- ✅ `.join()` / `.innerJoin()`
- ✅ `.orderBy()`
- ✅ `.limit()` / `.offset()`
- ✅ 聚合方法 (`.count()`, `.sum()`, `.avg()`)

### 其他
- ✅ 連線池管理
- ✅ 錯誤處理

## 🗄️ 資料庫結構

測試資料庫包含三個表：

### users 表
- 10 筆測試用戶資料
- 欄位：id, name, email, age, status, department, salary, timestamps

### posts 表
- 9 篇測試文章
- 外鍵關聯到 users
- 欄位：id, user_id, title, content, status, views, timestamps

### comments 表
- 12 則測試留言
- 外鍵關聯到 posts 和 users
- 欄位：id, post_id, user_id, content, created_at

## 🔧 MySQL 連線資訊

- **Host**: localhost
- **Port**: 3307 (避免與本機 MySQL 衝突)
- **Database**: test_db
- **User**: test_user
- **Password**: test_password
- **Root Password**: test_password

## 📝 常用命令

### Docker 管理

```bash
# 啟動容器
docker-compose up -d

# 停止容器
docker-compose down

# 停止並刪除資料卷（重置資料庫）
docker-compose down -v

# 查看容器狀態
docker-compose ps

# 查看日誌
docker-compose logs -f

# 進入 MySQL 容器
docker-compose exec mysql bash

# 直接執行 MySQL 命令
docker-compose exec mysql mysql -utest_user -ptest_password test_db
```

### 資料庫操作

進入容器後執行：

```bash
# 連接資料庫
mysql -utest_user -ptest_password test_db

# 查看所有表
SHOW TABLES;

# 查看用戶數據
SELECT * FROM users;

# 查看文章數據
SELECT * FROM posts;

# 重置資料庫（刪除所有資料並重新初始化）
mysql -uroot -ptest_password test_db < /docker-entrypoint-initdb.d/init.sql
```

## 🧪 執行特定測試

測試程式會自動執行所有測試項目。如果您想要修改測試內容，請編輯 `test-mysql.ts` 文件。

## 🐛 故障排除

### 容器無法啟動
```bash
# 查看詳細錯誤信息
docker-compose logs mysql

# 確保端口 3307 未被佔用
lsof -i :3307
```

### 連線失敗
```bash
# 檢查容器健康狀態
docker-compose ps

# 確認 MySQL 已準備就緒
docker-compose exec mysql mysqladmin ping -h localhost -uroot -ptest_password
```

### 重置環境
```bash
# 完全重置（刪除所有資料和容器）
docker-compose down -v
docker-compose up -d

# 等待 MySQL 就緒後重新執行測試
npm test
```

## 📌 注意事項

1. **端口配置**: 使用 3307 端口避免與本機 MySQL (3306) 衝突
2. **資料持久化**: 資料儲存在 Docker volume 中，執行 `docker-compose down -v` 會刪除所有資料
3. **自動初始化**: 首次啟動時會自動執行 `init.sql` 創建表和插入測試資料
4. **連線池**: 預設配置最大 10 個連線
5. **測試隔離**: 這些測試檔案已從主專案中排除（透過 .gitignore）

## 🔗 相關文件

- [Data Gateway README](../README.md)
- [MySQL Provider 文件](../docs/providers/mysql.md)
- [QueryBuilder 指南](../docs/guides/type-safety-2025-10.md)
- [Docker Compose 文件](https://docs.docker.com/compose/)
