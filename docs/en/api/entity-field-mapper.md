# EntityFieldMapper for Field Mapping

## What is an EntityFieldMapper?

An `EntityFieldMapper` is a crucial transformation layer that bridges the gap between application entity property names and database column names. With it, you can consistently use object property names (e.g., `userName`) when writing queries, sorting, or conditions, and the `EntityFieldMapper` will automatically convert them to the corresponding column names (e.g., `user_name`) when interacting with the database, and vice versa.

This decouples your application code from the specific naming conventions of the database, improving code readability and maintainability.

## `EntityFieldMapper<T>` Interface Definition

All field mappers must implement this interface.

- **`T`**: A generic parameter representing the entity object type that the [Repository](./repository.md) operates on.

```typescript
interface EntityFieldMapper<T> {
  /**
   * Converts an object property name to a database column name.
   * @param field The object property name.
   * @returns The corresponding database column name.
   */
  toDbField(field: string): string;

  /**
   * Converts a database column name to an object property name.
   * @param column The database column name.
   * @returns The corresponding object property name.
   */
  fromDbField(column: string): string;

  /**
   * Converts a single raw data record (Record<string, any>) from the database into an application entity object T.
   * @param dbRow The raw data row queried from the database.
   * @returns The converted entity object T.
   */
  fromDb(dbRow: Record<string, any>): Promise<T>;

  /**
   * Converts an application entity object (or a part of it) into a format ready to be written to the database.
   * @param entity The entity object to be written (can be a partial update).
   * @returns The converted data ready to be passed to the DataProvider.
   */
  toDb(entity: Partial<T>): Promise<Record<string, any>>;
}
```

## Built-in Implementations

### `DefaultFieldMapper<T>`
This is the default field mapper. It performs no name conversion and directly uses the object property names as database column names. If your object property naming is identical to your database column naming, no extra configuration is needed, as the [`Repository`](./repository.md) will automatically use it.

**Usage Example:**
```typescript
// entity.name <-> database "name" column
// entity.orderId <-> database "orderId" column
```

### `MappingFieldMapper<T>`
This is the most commonly used field mapper. It allows you to customize the mapping between properties and columns through a simple mapping object. It is ideal for handling common naming style differences, such as camelCase vs. snake_case.

**Constructor:**
- `constructor(mapping: Record<string, string>)`
  - **`mapping`**: A mapping object where the `key` is the application object property name and the `value` is the corresponding database column name.

**Usage Example:**
```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  userName: 'user_name',
  createdAt: 'created_at'
});

// Use in a Repository
// new Repository(provider, 'users', userMapper);

// Subsequent operations:
// entity.userName <-> database "user_name" column
// entity.createdAt <-> database "created_at" column
```

## Custom EntityFieldMapper Example

In addition to name mapping, you can also customize `EntityFieldMapper` to implement more complex data transformation logic, such as date formatting, data encryption/decryption, or combining multiple columns into a single object.

The following example shows how to create a custom mapper that converts date strings from the database into JavaScript `Date` objects when reading data, and performs the reverse conversion when writing.

```typescript
import { DefaultFieldMapper, EntityFieldMapper } from '@wfp99/data-gateway';

// Assume the User object type
interface User {
  id: number;
  name: string;
  birthday?: Date;
}

// Extend DefaultFieldMapper to reuse its basic behavior
class CustomDateMapper extends DefaultFieldMapper<User> {

  // Override the fromDb method
  async fromDb(dbRow: Record<string, any>): Promise<User> {
    // First, call the parent's fromDb for basic conversion
    const user = await super.fromDb(dbRow);

    // Perform special date conversion
    if (user.birthday) {
      user.birthday = new Date(dbRow.birthday);
    }
    return user;
  }

  // Override the toDb method
  async toDb(entity: Partial<User>): Promise<Record<string, any>> {
    const dbValues = { ...entity };

    // Perform special date conversion
    if (dbValues.birthday instanceof Date) {
      dbValues.birthday = dbValues.birthday.toISOString().slice(0, 10); // Convert to 'YYYY-MM-DD' format
    }

    return super.toDb(dbValues);
  }
}
```

## How to Configure a Mapper

In the [`DataGateway`](./data-gateway.md) configuration file, specify a `mapper` instance for any `Repository` that requires special mapping. If not specified, the default `DefaultFieldMapper` will be used.

```typescript
const config = {
  // ... providers ...
  repositories: {
    user: {
      provider: 'mysql',
      table: 'users',
      mapper: new MappingFieldMapper({ userName: 'user_name' })
    },
    post: {
      provider: 'mysql',
      table: 'posts',
      mapper: new CustomDateMapper()
    },
    log: {
      provider: 'sqlite',
      table: 'logs'
      // No mapper specified, will use DefaultFieldMapper
    }
  }
};
```
