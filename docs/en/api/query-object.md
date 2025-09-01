# QueryObject Format and Examples

## What is a QueryObject?

A `QueryObject` is a unified data structure in Data Gateway used to describe all data operations (including queries, inserts, updates, and deletes). It is a standardized object that allows you to declaratively define complex database operations without worrying about the specific SQL dialect or API format of the underlying [`DataProvider`](./data-provider.md).

All methods of a [`Repository`](./repository.md) internally construct and use a `QueryObject` to perform operations.

## `Query` Interface Details

```typescript
interface Query {
  /** The type of operation */
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'RAW';

  /** The target table name */
  table: string;

  /** The raw SQL statement to execute when type is 'RAW' */
  sql?: string;

  /**
   * The fields to query or operate on.
   * Can be a string of field names or an Aggregate object.
   */
  fields?: (string | Aggregate)[];

  /**
   * The data for 'INSERT' or 'UPDATE'.
   * A key-value object where the key is the field name and the value is the corresponding value.
   */
  values?: Record<string, any>;

  /** The query conditions */
  where?: Condition;

  /** JOIN settings */
  joins?: Join[];

  /** The fields to GROUP BY */
  groupBy?: string[];

  /** The sorting settings */
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];

  /** The maximum number of records to return */
  limit?: number;

  /** The data offset, used for pagination */
  offset?: number;
}
```

## `Condition` Details

`Condition` is used to describe the `WHERE` clause, supporting nested structures and multiple operators.

- **Basic Comparison**: `{ field: 'age', op: '>', value: 18 }`
  - `op`: `'=' | '!=' | '>' | '<' | '>=' | '<='`

- **IN / NOT IN (with an array of values)**: `{ field: 'status', op: 'IN', values: ['active', 'pending'] }`

- **IN / NOT IN (with a subquery)**: `{ field: 'id', op: 'IN', subquery: { type: 'SELECT', table: '...', ... } }`

- **LIKE**: `{ like: { field: 'name', pattern: 'John%' } }`

- **Compound Conditions**:
  - `{ and: [condition1, condition2] }`
  - `{ or: [condition1, condition2] }`
  - `{ not: condition1 }`

## Other Related Interfaces

### `Aggregate`
Used to describe aggregate functions.
```typescript
interface Aggregate {
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  field: string;
  alias?: string; // An alias for the result
}
```

### `Join`
Used to describe JOIN operations.
```typescript
interface Join {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string; // The table to JOIN with
  on: Condition; // The JOIN condition
}
```

### `QueryResult<T>`
The return format for the `query` method of all [`DataProviders`](./data-provider.md).
```typescript
interface QueryResult<T = any> {
  rows?: T[]; // The result of a SELECT
  affectedRows?: number; // The number of rows affected by an INSERT, UPDATE, or DELETE
  insertId?: number | string; // The new ID returned by an INSERT operation
  error?: string; // An error message
}
```

## Comprehensive Example

### Complex SELECT Query
Query for users who are over 18 and have a status of "active", count the total number of users, sort by creation time in descending order, and take the first 10 records.
```typescript
{
  type: 'SELECT',
  table: 'users',
  fields: ['id', 'name', { type: 'COUNT', field: 'id', alias: 'total' }],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  groupBy: ['id', 'name'],
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10,
  offset: 0
}
```

### INSERT Operation
```typescript
{
  type: 'INSERT',
  table: 'users',
  values: { name: 'Jane Doe', age: 30, status: 'active' }
}
```

### UPDATE Operation
```typescript
{
  type: 'UPDATE',
  table: 'users',
  values: { status: 'inactive' },
  where: { field: 'lastLogin', op: '<', value: '2023-01-01' }
}
```

---

`QueryObject` is the core of Data Gateway. Understanding its structure will help you make full use of all the features of the [`Repository`](./repository.md).
