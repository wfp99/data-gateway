# Data Gateway Documentation Center

**English** | [繁體中文](./README.md)

Data Gateway is a lightweight, extensible data access gateway for Node.js, supporting multiple data sources, custom providers, and middleware.

## 📖 Documentation Navigation

### 🚀 Getting Started
- [Installation & Setup](./guides/installation.en.md)
- [Quick Start Guide](./guides/quick-start.en.md)
- [Basic Usage](./guides/basic-usage.en.md)
- [Logging Guide](./guides/logging.en.md)
- [Date Object Handling](./guides/date-handling.en.md)

### ✨ Type Safety Features (2025-10)
- [**Type Safety Documentation**](./guides/type-safety-2025-10.en.md) - FieldReference, QueryBuilder, Field Conflict Detection
- [Changelog](../CHANGELOG-2025-10.en.md) - Quick Overview

### 🏗️ Core Concepts
- [Architecture Design](./core/architecture.en.md)

### 📊 Data Provider Guides
- [MySQL Provider](./providers/mysql.en.md)
- [PostgreSQL Provider](./providers/postgresql.en.md)
- [SQLite Provider](./providers/sqlite.en.md)
- [Remote API Provider](./providers/remote.en.md)
- [Custom Providers](./providers/custom.en.md)

### ⚡ Advanced Features
- [Connection Pooling](./advanced/connection-pooling.en.md)

### 📚 API Reference
- [DataGateway API](./api/data-gateway.en.md)

### 📋 Additional Resources
- [FAQ](./faq.en.md)
- [Usage Examples (Test Files)](../src/__tests__)
- [License](../LICENSE)
- [Project Home](../README.md)

---

## 🎯 Latest Features

### Type Safety Improvements (2025-10-20) ✅

**All 251 tests passed** - 68 new tests added

1. **FieldReference Type System** - Type-safe field references
2. **QueryBuilder Pattern** - Fluent chaining API
3. **Field Conflict Detection** - Automatic JOIN query conflict detection

**Learn More**: [Type Safety Documentation](./guides/type-safety-2025-10.en.md)

---

## 🔗 Links

- [GitHub Repository](https://github.com/wfp99/data-gateway)
- [NPM Package](https://www.npmjs.com/package/@wfp99/data-gateway)
- [Issue Tracker](https://github.com/wfp99/data-gateway/issues)

---

> **Note**: This documentation is written using the latest project features. If you find any inconsistencies, please refer to the source code or file an issue.