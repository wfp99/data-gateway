# Changelog - October 2025 Release 🎉

> **Full Documentation**: For detailed implementation, usage examples, and API documentation, please refer to [docs/guides/type-safety-2025-10.en.md](./docs/guides/type-safety-2025-10.en.md)

## Quick Overview

**Release Date**: 2025-10-20
**Status**: ✅ Completed
**Test Pass Rate**: 100% (262/262 tests)

This update successfully implements three type safety enhancement features and fixes a critical SQL field escaping issue:

### Implemented Features Summary

#### 1. FieldReference Type System ✅
- Type-safe field references: `string | { table?, repository?, field }`
- Helper functions: `tableField()`, `repoField()`, `fieldRefToString()`
- **6 tests** all passed

#### 2. QueryBuilder Pattern ✅
- Fluent chaining API for query construction
- Full TypeScript support
- Supports SELECT/INSERT/UPDATE/DELETE and all SQL features
- **54 tests** all passed

#### 3. Field Conflict Detection ✅
- Automatically detects field name conflicts in JOIN queries
- Smart warning system (only triggers when needed)
- **8 tests** all passed

### 🐛 Bug Fixes

#### 4. Table.Field Format SQL Escaping Fix ✅
- **Issue**: When using `table.field` format (e.g., `users.id`), the entire string was treated as a single field name with quotes
- **Impact**: All Providers (MySQL, PostgreSQL, SQLite)
- **Fix**: Added `escapeIdentifier` method to properly handle separate quoting for table and field names
- **Results**:
  - MySQL: `` `users.id` `` → `` `users`.`id` `` ✅
  - PostgreSQL/SQLite: `"users.id"` → `"users"."id"` ✅
- **Testing**: Added **11 dedicated tests** covering all SQL operations
- **Backward Compatible**: Does not affect existing single field name usage

## Test Statistics

```
Total Tests: 262 tests (100% passed)
├─ New in This Release: 79 tests
│  ├─ FieldReference:       6 ✅
│  ├─ QueryBuilder:        54 ✅
│  ├─ Field Conflict:       8 ✅
│  └─ Field Escaping:      11 ✅ (New)
└─ Existing Features: 183 tests ✅

Execution Time: ~1070ms
```

## Quick Examples

### FieldReference Type Safety
```typescript
import { tableField, repoField } from '@wfp99/data-gateway';

// Type-safe field references
await userRepo.find({
  fields: [
    tableField('users', 'id'),      // IDE auto-completion
    repoField('user', 'userName')   // Auto-mapping
  ]
});
```

### QueryBuilder Fluent API
```typescript
import { QueryBuilder } from '@wfp99/data-gateway';

const query = new QueryBuilder('users')
  .select('id', 'name', 'email')
  .where(w => w
    .equals('status', 'active')
    .greaterThan('age', 18)
  )
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .build();
```

### Automatic Field Conflict Detection
```typescript
// Triggers warning
await userRepo.find({
  fields: ['id'],  // 'id' without prefix
  joins: [{ type: 'LEFT', source: { repository: 'posts' }, ... }]
});
// ⚠️ Warning: Field 'id' exists in multiple tables...
```

### Table.Field Format Proper Escaping
```typescript
// Now correctly handles table.field format
await userRepo.find({
  fields: [
    'users.id',        // ✅ Converts to `users`.`id`
    'users.name',      // ✅ Converts to `users`.`name`
    'posts.title'      // ✅ Converts to `posts`.`title`
  ],
  where: {
    field: 'users.status',  // ✅ Properly handled
    op: '=',
    value: 'active'
  },
  orderBy: [
    { field: 'users.created_at', direction: 'DESC' }  // ✅ Properly handled
  ]
});
```

## Impact & Benefits

### Development Experience Improvements
- ✅ **Type Safety**: From runtime errors → compile-time errors
- ✅ **Auto-completion**: Full IDE support
- ✅ **Refactoring Safety**: Type system tracks all references
- ✅ **Proactive Warnings**: Automatically detects potential issues

### Performance Impact (Minimal)
- Runtime overhead: < 2ms
- Memory usage: < 3KB (temporary)
- Package size: +3.2KB (gzipped)

### Backward Compatibility
- ✅ No breaking changes
- ✅ String format still valid
- ✅ Smooth upgrade path

## Code Change Statistics

```
New Files: 3
├─ src/queryBuilder.ts (~400 lines)
├─ src/fieldConflictDetection.test.ts (~405 lines)
└─ src/dataProviders/fieldEscape.test.ts (~350 lines) [New]

Modified Files: 6
├─ src/queryObject.ts (+60 lines)
├─ src/repository.ts (+165 lines)
├─ src/index.ts (+5 lines)
├─ src/dataProviders/MySQLProvider.ts (+20 lines) [New]
├─ src/dataProviders/PostgreSQLProvider.ts (+20 lines) [New]
└─ src/dataProviders/SQLiteProvider.ts (+20 lines) [New]

New Code: ~695 lines
New Tests: ~1,655 lines
```

## Next Steps

### To Do
- [ ] Update detailed usage guide (`docs/guides/basic-usage.md`)
- [ ] Enhance API documentation (`docs/api/data-gateway.md`)
- [ ] Add TypeDoc annotations

### Future Plans
- Transaction support (Transaction API)
- Connection pool management interface
- Database migration tools
- Query caching mechanism

---

**📖 Full Documentation**: [docs/guides/type-safety-2025-10.en.md](./docs/guides/type-safety-2025-10.en.md)
**🧪 Test Files**: [src/fieldConflictDetection.test.ts](./src/fieldConflictDetection.test.ts), [src/queryBuilder.test.ts](./src/queryBuilder.test.ts)
**📦 Last Updated**: 2025-10-20
