# Installation & Setup

## System Requirements

- **Node.js**: 18.0.0 or higher
- **TypeScript**: 5.0 or higher (recommended, but not required)

## Core Package Installation

```bash
# Install Data Gateway core package
npm install @wfp99/data-gateway
```

## Database Driver Installation

Data Gateway uses **Lazy Loading** mechanism, so you only need to install the database drivers you actually use:

### MySQL Support
```bash
npm install mysql2
```

### PostgreSQL Support
```bash
npm install pg @types/pg
```

### SQLite Support
```bash
npm install sqlite3
```

### Remote API Support
No additional installation needed - `RemoteProvider` is included in the core package.

## Benefits of Lazy Loading

- **Install only what you need**: The library uses lazy loading to import database providers only when actually used
- **No forced dependencies**: You can use `RemoteProvider` without installing any database drivers
- **Reduced package size**: Avoid installing unnecessary dependencies

## Verify Installation

Create a simple test file to verify the installation:

```typescript
// test-installation.ts
import { DataGateway, RemoteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    test: {
      type: 'remote',
      options: {
        endpoint: 'https://jsonplaceholder.typicode.com/posts'
      } as RemoteProviderOptions
    }
  },
  repositories: {
    posts: { provider: 'test', table: 'posts' }
  }
};

async function testInstallation() {
  try {
    const gateway = await DataGateway.build(config);
    console.log('✅ Data Gateway installed successfully!');
    await gateway.disconnectAll();
  } catch (error) {
    console.error('❌ Installation verification failed:', error);
  }
}

testInstallation();
```

Run the test:
```bash
npx ts-node test-installation.ts
# or if using JavaScript
node test-installation.js
```

## Common Installation Issues

### Issue 1: TypeScript Type Errors
**Solution**: Make sure you have the corresponding type definitions installed
```bash
npm install @types/node @types/pg  # if using PostgreSQL
```

### Issue 2: Module Not Found Errors
**Solution**: Check if you have installed the correct database drivers
```bash
# Check installed packages
npm list mysql2 pg sqlite sqlite3
```

### Issue 3: Node.js Version Too Low
**Solution**: Upgrade to Node.js 18.0.0 or higher
```bash
node --version  # Check current version
```

## Next Steps

After installation, continue with:
- [Quick Start Guide](./quick-start.en.md)
- [Basic Usage](./basic-usage.en.md)