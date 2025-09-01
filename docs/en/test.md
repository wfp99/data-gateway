# Testing and Development Guide

This project uses `vitest` for testing.

## Running Tests

To run all tests:
```bash
npm test
```

To run tests in watch mode:
```bash
npm run test:watch
```

## Writing Tests

- Place test files alongside the source files, with a `.test.ts` extension (e.g., `index.test.ts`).
- Use `describe`, `it`, and `expect` from `vitest`.
- For integration tests, you can use in-memory `SQLiteProvider` to create a clean test environment.

## Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { DataGateway } from '../src';

describe('DataGateway', () => {
  it('should build a gateway instance', async () => {
    const gateway = await DataGateway.build({
      providers: {
        sqlite: { type: 'sqlite', options: { filename: ':memory:' } }
      },
      repositories: {
        test: { provider: 'sqlite', table: 'test' }
      }
    });
    expect(gateway).toBeInstanceOf(DataGateway);
    await gateway.disconnectAll();
  });
});
```
