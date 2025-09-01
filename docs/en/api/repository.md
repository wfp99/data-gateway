# Repository and Query Objects

## What is a Repository?

A `Repository` encapsulates the data access logic for a single data table (or collection), providing a set of common CRUD (Create, Read, Update, Delete) methods and advanced query capabilities. It hides the implementation details of the underlying [`DataProvider`](./data-provider.md) and automatically handles field name mapping (via [`EntityFieldMapper`](./entity-field-mapper.md)) and query interception and processing (via [`Middleware`](./middleware.md)).

Generic Parameters:
- `T`: The entity object type that the Repository operates on.
- `M`: The type of the entity field mapper (`EntityFieldMapper`), which defaults to `EntityFieldMapper<T>`.

## Constructor

```typescript
constructor(
  provider: DataProvider,
  table: string,
  mapper: M = new DefaultFieldMapper<T>() as M,
  middlewares: Middleware[] = []
)
```
Creates a `Repository` instance.

- **`provider`**: A [`DataProvider`](./data-provider.md) instance used to execute the actual database queries.
- **`table`**: The name of the data table that this Repository corresponds to.
- **`mapper`**: An [`EntityFieldMapper`](./entity-field-mapper.md) instance used to convert between application object property names and database column names. By default, it uses `DefaultFieldMapper`, which performs no conversion.
- **`middlewares`**: An array of [`Middleware`](./middleware.md) used for intercepting and processing queries before and after execution.

## Main Methods

### `find(query?)`
Queries and returns multiple records that match the criteria.

- **`query`** (optional): A `Partial<Query>` object used to define various parts of the query, such as `fields`, `where`, `orderBy`, `limit`, `offset`, etc. You do not need to specify `type` and `table` here.
- **Returns**: `Promise<T[]>` - An array of objects containing the query results.

### `findOne(condition?)`
Queries and returns the first record that matches the criteria.

- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define the query criteria.
- **Returns**: `Promise<T | null>` - Returns the object instance if found, otherwise `null`.

### `findMany(condition?, options?)`
Queries multiple records based on criteria, with support for pagination and sorting. This is a convenience wrapper for the `find` method.

- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define the query criteria.
- **`options`** (optional): An object containing pagination and sorting options.
    - `limit`: The maximum number of records to return.
    - `offset`: The data offset, used for pagination.
    - `orderBy`: The sorting settings.
- **Returns**: `Promise<T[]>` - An array of objects containing the query results.

### `count(field, condition?)`
Counts the number of records that match the criteria.

- **`field`**: The field to count. Usually the primary key or `*` (depending on the [`DataProvider`](./data-provider.md) implementation).
- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define the filter criteria.
- **Returns**: `Promise<number>` - The number of records that match the criteria.

### `sum(fields, condition?)`
Calculates the sum of the specified fields.

- **`fields`**: An array of strings containing the names of the fields to sum.
- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define the filter criteria.
- **Returns**: `Promise<Record<string, number>>` - An object where the keys are the field names and the values are their corresponding sums.

### `insert(entity)`
Inserts a new record.

- **`entity`**: The object instance `T` to be inserted.
- **Returns**: `Promise<number | string>` - The ID of the newly inserted record (usually the primary key), the specific format depends on the [`DataProvider`](./data-provider.md) implementation.

### `update(values, condition?)`
Updates records that match the criteria.

- **`values`**: A `Partial<T>` object containing the fields and values to be updated.
- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define which records to update. If not provided, some [`DataProviders`](./data-provider.md) may update all records, so use with caution.
- **Returns**: `Promise<number>` - The number of successfully updated records.

### `delete(condition?)`
Deletes records that match the criteria.

- **`condition`** (optional): A [`Condition`](./query-object.md#condition-details) object used to define which records to delete. If not provided, some [`DataProviders`](./data-provider.md) may delete all records, so use with caution.
- **Returns**: `Promise<number>` - The number of successfully deleted records.

## Query Object Example

All query methods are based on the unified [`QueryObject`](./query-object.md) format, which makes complex queries simple and consistent.

```typescript
const users = await userRepo.find({
  fields: ['id', 'name'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10
});
```

---

For more query formats, see the [QueryObject Documentation](./query-object.md).
