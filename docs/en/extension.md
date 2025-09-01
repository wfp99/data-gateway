# Extension and Custom Development

Data Gateway is highly extensible. You can:

- Add custom DataProviders (to support any data source)
- Implement custom Middleware (for permissions, caching, auditing, etc.)
- Customize EntityFieldMappers (for complex field mapping and type conversion)
- Extend Repository methods

## Custom Provider Example

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class MyProvider implements DataProvider {
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
  async query<T = any>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}
```

## Custom Middleware Example

```typescript
const auditMiddleware: Middleware = async (query, next) => {
  // Auditing logic
  return next(query);
};
```

## Advanced: Custom Repository

You can extend the Repository and add new methods:
```typescript
class UserRepository extends Repository<User> {
  async findActive() {
    return this.find({ where: { field: 'status', op: '=', value: 'active' } });
  }
}
```

---

For more details, please refer to the [API Reference](./api/).
