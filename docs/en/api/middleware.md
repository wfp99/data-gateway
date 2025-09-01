# Using Middleware

## What is Middleware?

Middleware is a powerful feature that allows you to intercept and process the query flow before or after the query is actually executed. This makes it easy to add custom functionality such as logging, permission validation, caching, and query rewriting without modifying the core [`Repository`](./repository.md) logic.

The design of middleware follows the common "onion model," where each middleware can operate on the incoming [`Query`](./query-object.md) object and then pass control to the next middleware by calling the `next` function, eventually reaching the core query execution logic. When the core logic or other middleware completes, the result is passed back up the call chain.

## `Middleware` Type Definition

```typescript
type Middleware = (
  query: Query,
  next: (query: Query) => Promise<QueryResult>
) => Promise<QueryResult>;
```

A middleware is a function that takes two arguments:

- **`query`**: The [`Query`](./query-object.md) object, which contains information about the current query request. You can inspect or modify this object at this stage.
- **`next`**: A function used to pass control to the next middleware in the processing chain. You must call `next(query)` and `await` its result to continue the flow. You can also pass a modified `Query` object to `next`. If you do not call `next`, the query flow will be interrupted.

The function must return a `Promise<QueryResult>`.

## Example: Logging Middleware

This is a simple logging middleware that prints the `Query` object and `QueryResult` before and after the query is executed.

```typescript
import { Middleware, Query, QueryResult } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query: Query, next: (q: Query) => Promise<QueryResult>) => {
  console.log('Executing query:', JSON.stringify(query, null, 2));

  const startTime = Date.now();
  const result = await next(query); // Pass control to the next middleware or core query logic
  const duration = Date.now() - startTime;

  console.log(`Query finished in ${duration}ms. Result:`, result);

  return result;
};
```

## Example: Caching Middleware (Conceptual)

This is a more advanced example that shows how to implement a simple in-memory cache using middleware.

```typescript
import { Middleware, Query, QueryResult } from '@wfp99/data-gateway';

const cache = new Map<string, QueryResult>();

const cachingMiddleware: Middleware = async (query, next) => {
  // Only cache SELECT queries
  if (query.type !== 'SELECT') {
    return next(query);
  }

  const cacheKey = JSON.stringify(query);

  if (cache.has(cacheKey)) {
    console.log('Cache hit!');
    return cache.get(cacheKey)!;
  }

  console.log('Cache miss, executing query...');
  const result = await next(query);

  // Store the result in the cache and set it to expire after 5 minutes
  if (!result.error) {
    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);
  }

  return result;
};
```

## How to Configure Middleware

In the [`DataGateway`](./data-gateway.md) configuration file, specify the `middlewares` array for a specific `Repository`.

```typescript
const config = {
  // ... providers ...
  repositories: {
    user: {
      provider: 'mysql',
      table: 'users',
      middlewares: [loggingMiddleware, cachingMiddleware] // Middleware will be executed in the order of the array
    },
    product: {
      provider: 'mysql',
      table: 'products',
      middlewares: [loggingMiddleware] // The product repo only uses logging
    }
  }
};
```
Middleware is executed strictly in the order you provide in the array.

---

For more advanced usage, see the [Repository Documentation](./repository.md).
