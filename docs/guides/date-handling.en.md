````markdown
# Date Object Handling Guide

This guide explains how data-gateway handles conversion between JavaScript Date objects and database time fields.

## Overview

Each Provider in data-gateway automatically handles conversions between JavaScript Date objects and database time fields, allowing developers to seamlessly use Date objects for data operations.

## Date Handling by Provider

### MySQL Provider

MySQL Provider uses the `mysql2` driver, which automatically handles Date objects:

- **On Write**: JavaScript Date objects are automatically converted to MySQL's DATETIME or TIMESTAMP format
- **On Read**: Database DATETIME/TIMESTAMP fields are automatically converted to JavaScript Date objects

```typescript
// Insert Date object
await userRepo.insert({
  name: 'John Doe',
  createdAt: new Date('2024-01-15T10:30:00.000Z')
});

// Query results automatically convert back to Date objects
const users = await userRepo.find({
  field: 'createdAt',
  op: '>',
  value: new Date('2024-01-01T00:00:00.000Z')
});
// users[0].createdAt is a Date object
```

### PostgreSQL Provider

PostgreSQL Provider uses the `pg` driver, which also automatically handles Date objects:

- **On Write**: JavaScript Date objects are automatically converted to PostgreSQL's TIMESTAMP format
- **On Read**: Database TIMESTAMP fields are automatically converted to JavaScript Date objects

```typescript
// Same usage as MySQL
await eventRepo.insert({
  title: 'Important Meeting',
  eventDate: new Date('2024-06-20T15:00:00.000Z')
});

const events = await eventRepo.find({
  field: 'eventDate',
  op: '>=',
  value: new Date('2024-06-01T00:00:00.000Z')
});
```

### SQLite Provider

SQLite doesn't natively support Date types, so data-gateway's SQLite Provider implements automatic conversion:

- **On Write**: JavaScript Date objects are converted to ISO 8601 string format (e.g., `2024-01-15T10:30:00.000Z`)
- **On Read**: Strings matching ISO 8601 format are automatically converted back to JavaScript Date objects

```typescript
// Insert Date object (stored as ISO string)
await logRepo.insert({
  message: 'System started',
  timestamp: new Date()
});

// Query results automatically convert back to Date objects
const logs = await logRepo.find({
  field: 'timestamp',
  op: '>=',
  value: new Date('2024-01-01T00:00:00.000Z')
});
// logs[0].timestamp is a Date object
```

**Important Notes**:
- SQLite stores dates as TEXT type
- Only strings in ISO 8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`) will be converted to Date objects
- Other string formats will remain as strings without conversion

### Remote Provider

When transmitting JSON data over the network, Remote Provider implements special serialization/deserialization:

- **On Write**: Date objects are converted to a special format with type markers:
  ```json
  { "__type": "Date", "__value": "2024-01-15T10:30:00.000Z" }
  ```
- **On Read**: Objects with `__type: "Date"` marker are automatically restored to JavaScript Date objects

```typescript
// Date objects are marked during JSON serialization
await remoteRepo.insert({
  title: 'Remote Event',
  eventDate: new Date('2024-12-25T00:00:00.000Z')
});

// Dates returned from remote API are automatically restored
const events = await remoteRepo.find({
  field: 'eventDate',
  op: 'IN',
  values: [
    new Date('2024-12-24T00:00:00.000Z'),
    new Date('2024-12-25T00:00:00.000Z')
  ]
});
```

**Advantages**:
- Preserves complete Date information (including timezone)
- Can handle Date objects in nested objects and arrays
- Doesn't affect other data types

## Usage Examples

### Basic CRUD Operations

```typescript
const gateway = await DataGateway.build({
  providers: {
    db: {
      type: 'sqlite',
      options: { filename: './data.db' }
    }
  },
  repositories: {
    event: { provider: 'db', table: 'events' }
  }
});

const eventRepo = gateway.getRepository<Event>('event');

// 1. Insert data with Date
await eventRepo.insert({
  title: 'Product Launch',
  eventDate: new Date('2024-12-31T23:59:59.000Z'),
  createdAt: new Date()
});

// 2. Query using Date
const upcomingEvents = await eventRepo.find({
  field: 'eventDate',
  op: '>',
  value: new Date()
});

// 3. Update Date field
await eventRepo.update(
  { eventDate: new Date('2025-01-01T00:00:00.000Z') },
  { field: 'title', op: '=', value: 'Product Launch' }
);

// 4. IN query with Date array
const specificDates = await eventRepo.find({
  field: 'eventDate',
  op: 'IN',
  values: [
    new Date('2024-12-24T00:00:00.000Z'),
    new Date('2024-12-25T00:00:00.000Z')
  ]
});
```

### Complex Conditional Queries

```typescript
// Query events within a specific time range
const events = await eventRepo.find({
  and: [
    {
      field: 'eventDate',
      op: '>=',
      value: new Date('2024-01-01T00:00:00.000Z')
    },
    {
      field: 'eventDate',
      op: '<=',
      value: new Date('2024-12-31T23:59:59.999Z')
    }
  ]
});
```

### Using with EntityFieldMapper

```typescript
interface Event {
  id: number;
  title: string;
  eventDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const fieldMapper = new MappingFieldMapper<Event>({
  eventDate: 'event_date',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const gateway = await DataGateway.build({
  providers: {
    db: { type: 'sqlite', options: { filename: './data.db' } }
  },
  repositories: {
    event: {
      provider: 'db',
      table: 'events',
      fieldMapper
    }
  }
});

// Date objects automatically convert and field names are mapped
const eventRepo = gateway.getRepository<Event>('event');
await eventRepo.insert({
  title: 'Meeting',
  eventDate: new Date(),  // Converts and maps to event_date
  createdAt: new Date(),  // Converts and maps to created_at
  updatedAt: new Date()   // Converts and maps to updated_at
});
```

## Best Practices

### 1. Always Use UTC Time

It's recommended to use UTC time consistently throughout your application to avoid timezone conversion issues:

```typescript
// Good practice ✓
const event = {
  title: 'Meeting',
  eventDate: new Date('2024-12-25T10:00:00.000Z')  // UTC time
};

// Be careful ⚠️
const event = {
  title: 'Meeting',
  eventDate: new Date('2024-12-25T10:00:00')  // Local time, may cause confusion
};
```

### 2. Validate Date Objects

Validate Date objects before inserting or updating data:

```typescript
function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

// Use validation
const eventDate = new Date(userInput);
if (isValidDate(eventDate)) {
  await eventRepo.insert({ title: 'Event', eventDate });
} else {
  throw new Error('Invalid date');
}
```

### 3. Handle Timezone Display

Handle timezone conversions at the UI layer, not at the data layer:

```typescript
// Data layer: Use UTC consistently
const events = await eventRepo.findAll();

// UI layer: Display according to user timezone
events.forEach(event => {
  // Use Intl.DateTimeFormat or date libraries (e.g., date-fns, dayjs)
  console.log(event.eventDate.toLocaleString('en-US', {
    timeZone: 'America/New_York'
  }));
});
```

### 4. SQLite Considerations

When using SQLite, ensure database column types are set correctly:

```sql
-- Recommended: Use TEXT type to store ISO 8601 strings
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,  -- Will store ISO 8601 format
  created_at TEXT NOT NULL
);

-- Not recommended: Use INTEGER to store Unix timestamp
-- Because data-gateway converts to ISO string, not number
```

### 5. Performance Considerations

For applications requiring many date queries, consider creating indexes at the database level:

```sql
-- MySQL
CREATE INDEX idx_event_date ON events(event_date);

-- PostgreSQL
CREATE INDEX idx_event_date ON events(event_date);

-- SQLite
CREATE INDEX idx_event_date ON events(event_date);
```

## Troubleshooting

### Issue 1: SQLite dates not converting to Date objects

**Cause**: Stored string format doesn't match ISO 8601 standard

**Solution**: Ensure storing in standard ISO 8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`)

```typescript
// Correct ✓
new Date().toISOString() // "2024-01-15T10:30:00.000Z"

// Won't be converted ✗
"2024-01-15 10:30:00"
"01/15/2024"
```

### Issue 2: Remote Provider Date loss

**Cause**: Remote API doesn't properly handle Date's special marker format

**Solution**: Ensure remote API implements the same serialization/deserialization mechanism, or handle at the application layer

### Issue 3: Timezone inconsistencies

**Cause**: Different environments using different timezones

**Solution**:
1. Use UTC time consistently
2. Use TIMESTAMP WITH TIME ZONE at the database level (PostgreSQL)
3. Handle timezone conversions explicitly at the application layer

## Related Resources

- [JavaScript Date Object Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [ISO 8601 Standard](https://en.wikipedia.org/wiki/ISO_8601)
- [MySQL DATETIME and TIMESTAMP](https://dev.mysql.com/doc/refman/8.0/en/datetime.html)
- [PostgreSQL Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [SQLite Date And Time Functions](https://www.sqlite.org/lang_datefunc.html)
````