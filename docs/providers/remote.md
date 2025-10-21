# Remote API Provider

Remote API Provider is a data provider that accesses remote APIs via HTTP/HTTPS. It converts query objects into HTTP requests, suitable for integrating third-party APIs or microservice architectures.

## Features

- 🌐 Support for any RESTful API endpoint
- 🔐 Built-in Bearer Token authentication support
- 📤 Send query objects via POST requests
- 🔄 Unified query interface, consistent with other providers
- ⚡ No additional database drivers required

## Basic Usage

### Simple Configuration

```typescript
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data'
      } as RemoteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'api', table: 'users' },
    products: { provider: 'api', table: 'products' }
  }
};

const gateway = await DataGateway.build(config);
```

### Configuration with Authentication

```typescript
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: 'your-secret-api-token',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': 'v1',
          'X-Client-ID': 'data-gateway'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'api', table: 'users' }
  }
};
```

## Configuration Options

```typescript
interface RemoteProviderOptions {
  /** API endpoint URL */
  endpoint: string;

  /** Bearer Token authentication (optional) */
  bearerToken?: string;

  /** Additional HTTP headers (optional) */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}
```

## How It Works

Remote Provider converts all query operations into HTTP POST requests:

### Request Format

```http
POST /data HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer your-secret-api-token

{
  "type": "SELECT",
  "table": "users",
  "fields": ["id", "name", "email"],
  "where": {
    "field": "status",
    "op": "=",
    "value": "active"
  },
  "limit": 10
}
```

### Expected Response Format

The remote API should return JSON conforming to the `QueryResult` format:

```json
{
  "rows": [
    {"id": 1, "name": "John", "email": "john@example.com"},
    {"id": 2, "name": "Jane", "email": "jane@example.com"}
  ]
}
```

Or for INSERT operations:

```json
{
  "insertId": 123
}
```

Or for UPDATE/DELETE operations:

```json
{
  "affectedRows": 2
}
```

## Basic Operation Examples

### Querying Data

```typescript
const userRepo = gateway.getRepository('users');

// Simple query
const activeUsers = await userRepo?.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// Complex query
const result = await userRepo?.find({
  fields: ['id', 'name', 'email', 'created_at'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

console.log('Query results:', result?.rows);
```

### Creating Data

```typescript
const newUserId = await userRepo?.insert({
  name: 'Alice Wang',
  email: 'alice@example.com',
  age: 28,
  status: 'active'
});

console.log('New user ID:', newUserId);
```

### Updating Data

```typescript
const updatedRows = await userRepo?.update(
  { status: 'inactive' },  // Update data
  { field: 'id', op: '=', value: 123 }  // Condition
);

console.log(`Updated ${updatedRows} records`);
```

### Deleting Data

```typescript
const deletedRows = await userRepo?.delete({
  field: 'status',
  op: '=',
  value: 'inactive'
});

console.log(`Deleted ${deletedRows} records`);
```

## Advanced Features

### Custom Headers

```typescript
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: process.env.API_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': '2023-10-01',
          'X-Request-Source': 'data-gateway',
          'Accept-Language': 'en-US'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    products: { provider: 'api', table: 'products' }
  }
};
```

### Dynamic Authentication

```typescript
// Example of dynamic token retrieval
async function getApiToken(): Promise<string> {
  // Retrieve token from authentication service
  const response = await fetch('https://auth.example.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET
    })
  });
  const data = await response.json();
  return data.access_token;
}

const token = await getApiToken();

const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: token
      } as RemoteProviderOptions
    }
  },
  repositories: {
    orders: { provider: 'api', table: 'orders' }
  }
};
```

## Error Handling

Remote Provider provides detailed error information:

```typescript
try {
  const result = await userRepo?.findMany({
    field: 'email',
    op: '=',
    value: 'test@example.com'
  });
  console.log('Success:', result);
} catch (error) {
  console.error('API request failed:', error);

  if (error instanceof Error) {
    if (error.message.includes('401')) {
      console.error('Authentication failed - check Bearer Token');
    } else if (error.message.includes('timeout')) {
      console.error('Request timeout - check network connection');
    } else if (error.message.includes('500')) {
      console.error('Server error - contact API provider');
    }
  }
}
```

Common error types:
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: API endpoint not found
- `500 Internal Server Error`: Server error
- `timeout`: Request timeout

## Server-Side Implementation Example

Here's a simple Express.js server example showing how to handle requests from Remote Provider:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Authentication middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== 'your-secret-api-token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Handle Data Gateway queries
app.post('/data', authenticate, async (req, res) => {
  const query = req.body;

  try {
    switch (query.type) {
      case 'SELECT':
        const rows = await handleSelect(query);
        res.json({ rows });
        break;

      case 'INSERT':
        const insertId = await handleInsert(query);
        res.json({ insertId });
        break;

      case 'UPDATE':
        const affectedRows = await handleUpdate(query);
        res.json({ affectedRows });
        break;

      case 'DELETE':
        const deletedRows = await handleDelete(query);
        res.json({ affectedRows: deletedRows });
        break;

      default:
        res.status(400).json({ error: 'Unknown query type' });
    }
  } catch (error) {
    console.error('Query execution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleSelect(query) {
  // Implement query logic
  // This can connect to databases, file systems, or other data sources
  return [
    { id: 1, name: 'John', email: 'john@example.com' },
    { id: 2, name: 'Jane', email: 'jane@example.com' }
  ];
}

async function handleInsert(query) {
  // Implement insert logic
  return Math.floor(Math.random() * 1000);
}

async function handleUpdate(query) {
  // Implement update logic
  return 1;
}

async function handleDelete(query) {
  // Implement delete logic
  return 1;
}

app.listen(3000, () => {
  console.log('API server running at http://localhost:3000');
});
```

## Third-Party API Integration

### GitHub API Example

```typescript
const config = {
  providers: {
    github: {
      type: 'remote',
      options: {
        endpoint: 'https://api.github.com/graphql',
        bearerToken: process.env.GITHUB_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MyApp/1.0'
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    repositories: { provider: 'github', table: 'repositories' }
  }
};
```

### Shopify API Example

```typescript
const config = {
  providers: {
    shopify: {
      type: 'remote',
      options: {
        endpoint: `https://${process.env.SHOP_NAME}.myshopify.com/admin/api/2023-10/graphql.json`,
        bearerToken: process.env.SHOPIFY_ACCESS_TOKEN,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      } as RemoteProviderOptions
    }
  },
  repositories: {
    products: { provider: 'shopify', table: 'products' },
    orders: { provider: 'shopify', table: 'orders' }
  }
};
```

## Performance Considerations

### Request Optimization

```typescript
// Batch queries
const queries = [
  { field: 'category', op: '=', value: 'electronics' },
  { field: 'category', op: '=', value: 'books' },
  { field: 'category', op: '=', value: 'clothing' }
];

const results = await Promise.all(
  queries.map(query => productRepo?.findMany(query))
);
```

### Caching Strategy

```typescript
// Simple in-memory cache example
const cache = new Map();

async function cachedQuery(repo, query, cacheKey) {
  if (cache.has(cacheKey)) {
    console.log('Retrieved data from cache');
    return cache.get(cacheKey);
  }

  const result = await repo.findMany(query);
  cache.set(cacheKey, result);

  // Clear cache after 10 minutes
  setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);

  return result;
}
```

## Limitations

Remote Provider has the following limitations:

1. **No RAW Query Support**: For security reasons, raw SQL queries are not supported
2. **Network Dependency**: Depends on network connection, may have latency or instability
3. **No Connection Pool**: HTTP requests cannot be pooled like database connections
4. **Limited Transaction Support**: Cannot provide database-level transaction guarantees

## Security Considerations

### Transport Security

```typescript
// Use HTTPS endpoints
const config = {
  providers: {
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://secure-api.example.com/data',  // Use HTTPS
        bearerToken: process.env.API_TOKEN,  // Get token from environment variables
        headers: {
          'User-Agent': 'DataGateway/1.0',
          'X-API-Key': process.env.API_KEY  // Additional API key
        }
      }
    }
  }
};
```

### Token Management

```typescript
// Secure token management
class TokenManager {
  private token: string | null = null;
  private expiry: number = 0;

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiry) {
      return this.token;
    }

    // Refresh token
    const response = await fetch('https://auth.example.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });

    const data = await response.json();
    this.token = data.access_token;
    this.expiry = Date.now() + (data.expires_in * 1000);

    return this.token;
  }
}

const tokenManager = new TokenManager();
const token = await tokenManager.getToken();
```

## Complete Example

```typescript
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

async function remoteApiExample() {
  const gateway = await DataGateway.build({
    providers: {
      jsonPlaceholder: {
        type: 'remote',
        options: {
          endpoint: 'https://jsonplaceholder.typicode.com/posts',
          headers: {
            'Content-Type': 'application/json'
          }
        } as RemoteProviderOptions
      }
    },
    repositories: {
      posts: { provider: 'jsonPlaceholder', table: 'posts' }
    }
  });

  try {
    const postRepo = gateway.getRepository('posts');

    // Query posts
    const posts = await postRepo?.find({
      fields: ['id', 'title', 'body'],
      limit: 5
    });

    console.log('Post list:', posts?.rows);

    // Create new post
    const newPostId = await postRepo?.insert({
      title: 'My New Post',
      body: 'This is the post content',
      userId: 1
    });

    console.log('New post ID:', newPostId);

  } finally {
    await gateway.disconnectAll();
  }
}

remoteApiExample().catch(console.error);
```

Remote Provider provides flexible API integration capabilities for Data Gateway, allowing you to access various remote data sources with a unified interface.