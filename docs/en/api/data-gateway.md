# DataGateway and DataGatewayConfig

## What is DataGateway?

`DataGateway` is the central hub for all data access. It manages multiple data sources (Providers) and repositories (Repositories), and handles connections, disconnections, CRUD operations, field mapping, and middleware.

- Supports multiple databases (MySQL, SQLite, remote APIs, custom providers)
- Can manage multiple data sources and tables simultaneously
- Provides a unified Repository interface
- Supports automatic field mapping and middleware

## DataGatewayConfig Structure

`DataGatewayConfig` is used to describe the settings for all data sources and repositories:

```typescript
interface DataGatewayConfig {
  providers: {
    [name: string]:
      | { type: 'mysql'; options: MySQLProviderOptions }
      | { type: 'sqlite'; options: SQLiteProviderOptions }
      | { type: 'remote'; options: RemoteProviderOptions }
      | { type: 'custom'; options: { provider: DataProvider } }
      | { type: string; options: any };
  };
  repositories: {
    [name: string]: {
      provider: string; // Corresponds to the name in providers
      table: string;
      mapper?: EntityFieldMapper<any>; // Field mapper
      middlewares?: Middleware[]; // Query interceptors
    };
  };
}
```

## Common Usage

```typescript
import { DataGateway, MappingFieldMapper } from '@wfp99/data-gateway';

const config = {
  providers: {
    mainDb: {
      type: 'mysql',
      options: { host: 'localhost', user: 'root', password: 'pw', database: 'test' }
    }
  },
  repositories: {
    user: {
      provider: 'mainDb',
      table: 'users',
      mapper: new MappingFieldMapper({ userName: 'user_name' })
    }
  }
};

const gateway = await DataGateway.build(config);
const userRepo = gateway.getRepository('user');
const users = await userRepo.find();
```

## Main Methods

- `DataGateway.build(config)`: Initializes all [Providers](./data-provider.md) and [Repositories](./repository.md)
- `getRepository(name)`: Gets the specified [Repository](./repository.md)
- `getProvider(name)`: Gets the specified [Provider](./data-provider.md)
- `disconnectAll()`: Disconnects all connections

---

For details on [Provider](./data-provider.md), [Repository](./repository.md), [Middleware](./middleware.md), and [EntityFieldMapper](./entity-field-mapper.md), please see the corresponding documentation.
