# Installation and Quick Start

## Installation

```bash
npm install @wfp99/data-gateway
# Install the required database driver
npm install mysql2
# or
npm install sqlite sqlite3
```

## Quick Start Example

```typescript
import { DataGateway, MySQLProviderOptions, SQLiteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: { host: 'localhost', user: 'root', password: '', database: 'test' } as MySQLProviderOptions
    },
    sqlite: {
      type: 'sqlite',
      options: { filename: './test.db' } as SQLiteProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' },
    log: { provider: 'sqlite', table: 'logs' }
  }
};

(async () => {
  const gateway = await DataGateway.build(config);
  const userRepo = gateway.getRepository('user');
  if (userRepo) {
    const users = await userRepo.find({ where: { field: 'status', op: '=', value: 'active' } });
    console.log(users);
  }
  await gateway.disconnectAll();
})();
```

## Common Usage

- Query, pagination, sorting, aggregation
- Insert operations (supports both complete and partial entities, enabling database default values)
- Update and delete operations
- Switching between multiple data sources
- Custom [Middleware](./api/middleware.md) and [field mapping](./api/entity-field-mapper.md)

For more examples, please see the [API Reference](./api/index.md).
