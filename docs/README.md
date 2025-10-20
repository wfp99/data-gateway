# Data Gateway 文件中心

[English](./README.en.md) | **繁體中文**

Data Gateway 是一個輕量級、可擴展、型別安全的 Node.js 資料存取閘道，支援多種資料來源、自訂提供者和中介軟體。

## 📖 文件導覽

### 🚀 快速開始
- [安裝與設定](./guides/installation.md)
- [快速入門指南](./guides/quick-start.md)
- [基本使用方法](./guides/basic-usage.md)
- [日誌功能指南](./guides/logging.md)
- [Date 物件處理](./guides/date-handling.md)

### ✨ 型別安全功能 (2025-10)
- [**型別安全完整文件**](./guides/type-safety-2025-10.md) - FieldReference、QueryBuilder、欄位衝突檢測
- [更新日誌](../CHANGELOG-2025-10.md) - 快速概覽

### 🏗️ 核心概念
- [架構設計](./core/architecture.md)

### 📊 資料提供者指南
- [MySQL Provider](./providers/mysql.md)
- [PostgreSQL Provider](./providers/postgresql.md)
- [SQLite Provider](./providers/sqlite.md)
- [Remote API Provider](./providers/remote.md)
- [自訂 Provider](./providers/custom.md)

### ⚡ 進階功能
- [連線池管理](./advanced/connection-pooling.md)

### 📚 API 參考
- [DataGateway API](./api/data-gateway.md)

### 📋 其他資源
- [常見問題 FAQ](./faq.md)
- [使用範例 (測試文件)](../src/__tests/)
- [授權說明](../LICENSE)
- [專案首頁](../README.zh-TW.md)

---

## 🎯 最新功能

### 型別安全改進 (2025-10-20) ✅

**251 個測試全部通過** - 新增 68 個測試

1. **FieldReference 型別系統** - 型別安全的欄位引用
2. **QueryBuilder 模式** - 流暢的鏈式 API
3. **欄位衝突檢測** - 自動偵測 JOIN 查詢衝突

**了解更多**: [型別安全完整文件](./guides/type-safety-2025-10.md)

---

## 🔗 相關連結

- [GitHub Repository](https://github.com/wfp99/data-gateway)
- [NPM Package](https://www.npmjs.com/package/@wfp99/data-gateway)
- [問題回報](https://github.com/wfp99/data-gateway/issues)

---

> **提示**: 這份文件使用最新的專案功能進行編寫。如果發現任何不一致的地方，請參考源碼或提出 issue。
