# Architecture and Core Concepts

Data Gateway is designed with a modular and extensible architecture. The core components are as follows:

## Architecture Diagram

```
+-------------------+
|   DataGateway     |
+-------------------+
|  Repository Map   |
|  Provider Map     |
+-------------------+
        | Depends on
        v
+-------------------+
|   Repository<T>   |
+-------------------+
| CRUD/Query Logic  |
| EntityFieldMapper |
| Middleware        |
+-------------------+
        | Depends on
        v
+-------------------+
|   DataProvider    |
+-------------------+
| MySQL/SQLite/Remote|
| Custom Provider   |
+-------------------+
```

## Core Concepts

- **[DataGateway](./api/data-gateway.md)**: The central hub that integrates multiple data sources and repositories, managing connections and CRUD operations.
- **[DataProvider](./api/data-provider.md)**: An abstract interface for data sources, with built-in support for MySQL, SQLite, and Remote providers, and can be customized.
- **[Repository](./api/repository.md)**: Encapsulates CRUD and query logic for a single data table, supporting middleware and field mapping.
- **[Middleware](./api/middleware.md)**: Pluggable query interceptors for logging, validation, caching, etc.
- **[EntityFieldMapper](./api/entity-field-mapper.md)**: A field mapper that facilitates automatic conversion between object properties and database columns.
- **[QueryObject](./api/query-object.md)**: A unified query object format that supports complex conditions, pagination, sorting, and aggregation.

## Main Flow

1. The user calls [DataGateway](./api/data-gateway.md) to get a [Repository](./api/repository.md).
2. The [Repository](./api/repository.md) transforms fields based on the query object via the [EntityFieldMapper](./api/entity-field-mapper.md).
3. The query is processed by [Middleware](./api/middleware.md) and then executed by the [DataProvider](./api/data-provider.md).
4. The result is returned and automatically converted into application-layer objects.

---

For detailed API and usage, please see the [API Reference](./api/).
