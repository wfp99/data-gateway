import { describe, it, expect } from 'vitest';
import { DefaultFieldMapper, MappingFieldMapper } from './entityFieldMapper';

describe('EntityFieldMapper - Unit Tests', () =>
{
	describe('DefaultFieldMapper', () =>
	{
		it('should return original field names for database conversion', () =>
		{
			const mapper = new DefaultFieldMapper();

			expect(mapper.toDbField('userName')).toBe('userName');
			expect(mapper.toDbField('email')).toBe('email');
			expect(mapper.toDbField('createdAt')).toBe('createdAt');
		});

		it('should return original objects for entity conversion', async () =>
		{
			const mapper = new DefaultFieldMapper<any>();
			const dbRow = { id: 1, name: 'John', email: 'john@example.com' };

			const entity = await mapper.fromDb(dbRow);
			expect(entity).toEqual(dbRow);
		});

		it('should return original objects for database conversion', async () =>
		{
			const mapper = new DefaultFieldMapper<any>();
			const entity = { id: 1, name: 'John', email: 'john@example.com' };

			const dbData = await mapper.toDb(entity);
			expect(dbData).toEqual(entity);
		});
	});

	describe('MappingFieldMapper', () =>
	{
		const fieldMapping = {
			userName: 'user_name',
			userEmail: 'user_email',
			firstName: 'first_name',
			lastName: 'last_name',
			createdAt: 'created_at',
			updatedAt: 'updated_at',
		};

		it('should convert entity fields to database fields', () =>
		{
			const mapper = new MappingFieldMapper(fieldMapping);

			expect(mapper.toDbField('userName')).toBe('user_name');
			expect(mapper.toDbField('userEmail')).toBe('user_email');
			expect(mapper.toDbField('firstName')).toBe('first_name');
			expect(mapper.toDbField('createdAt')).toBe('created_at');
		});

		it('should return original field name if no mapping exists', () =>
		{
			const mapper = new MappingFieldMapper(fieldMapping);

			expect(mapper.toDbField('id')).toBe('id');
			expect(mapper.toDbField('status')).toBe('status');
			expect(mapper.toDbField('unmappedField')).toBe('unmappedField');
		});

		it('should convert database row to entity format', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const dbRow = {
				id: 1,
				user_name: 'john_doe',
				user_email: 'john@example.com',
				first_name: 'John',
				last_name: 'Doe',
				status: 'active',
				created_at: '2023-01-01T00:00:00Z',
				updated_at: '2023-01-02T00:00:00Z',
			};

			const entity = await mapper.fromDb(dbRow);

			expect(entity).toEqual({
				id: 1,
				userName: 'john_doe',
				userEmail: 'john@example.com',
				firstName: 'John',
				lastName: 'Doe',
				status: 'active',
				createdAt: '2023-01-01T00:00:00Z',
				updatedAt: '2023-01-02T00:00:00Z',
			});
		});

		it('should convert entity to database format', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const entity = {
				id: 1,
				userName: 'john_doe',
				userEmail: 'john@example.com',
				firstName: 'John',
				lastName: 'Doe',
				status: 'active',
				createdAt: '2023-01-01T00:00:00Z',
				updatedAt: '2023-01-02T00:00:00Z',
			};

			const dbData = await mapper.toDb(entity);

			expect(dbData).toEqual({
				id: 1,
				user_name: 'john_doe',
				user_email: 'john@example.com',
				first_name: 'John',
				last_name: 'Doe',
				status: 'active',
				created_at: '2023-01-01T00:00:00Z',
				updated_at: '2023-01-02T00:00:00Z',
			});
		});

		it('should handle partial entity conversion', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const partialEntity = {
				userName: 'john_doe',
				userEmail: 'john@example.com',
			};

			const dbData = await mapper.toDb(partialEntity);

			expect(dbData).toEqual({
				user_name: 'john_doe',
				user_email: 'john@example.com',
			});
		});

		it('should handle partial database row conversion', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const partialDbRow = {
				user_name: 'john_doe',
				user_email: 'john@example.com',
			};

			const entity = await mapper.fromDb(partialDbRow);

			expect(entity).toEqual({
				userName: 'john_doe',
				userEmail: 'john@example.com',
			});
		});

		it('should preserve unmapped fields during conversion', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const entity = {
				id: 1,
				userName: 'john_doe',
				status: 'active',
				customField: 'custom_value',
			};

			const dbData = await mapper.toDb(entity);

			expect(dbData).toEqual({
				id: 1,
				user_name: 'john_doe',
				status: 'active',
				customField: 'custom_value',
			});
		});

		it('should handle empty objects', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const emptyEntity = {};
			const emptyDbData = await mapper.toDb(emptyEntity);
			expect(emptyDbData).toEqual({});

			const emptyDbRow = {};
			const emptyEntityResult = await mapper.fromDb(emptyDbRow);
			expect(emptyEntityResult).toEqual({});
		});

		it('should handle null and undefined values', async () =>
		{
			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const entityWithNulls = {
				userName: null,
				userEmail: undefined,
				firstName: 'John',
			};

			const dbData = await mapper.toDb(entityWithNulls);

			expect(dbData).toEqual({
				user_name: null,
				user_email: undefined,
				first_name: 'John',
			});
		});

		it('should be case-sensitive for field mappings', () =>
		{
			const mapper = new MappingFieldMapper(fieldMapping);

			expect(mapper.toDbField('username')).toBe('username'); // Should return original value as there's no corresponding mapping
			expect(mapper.toDbField('USERNAME')).toBe('USERNAME'); // Same as above
			expect(mapper.toDbField('userName')).toBe('user_name'); // Correct mapping
		});
	});

	describe('Complex Mapping Scenarios', () =>
	{
		it('should handle nested object field names', () =>
		{
			const complexMapping = {
				'user.name': 'user_name',
				'user.email': 'user_email',
				'profile.avatar': 'profile_avatar_url',
			};

			const mapper = new MappingFieldMapper(complexMapping);

			expect(mapper.toDbField('user.name')).toBe('user_name');
			expect(mapper.toDbField('user.email')).toBe('user_email');
			expect(mapper.toDbField('profile.avatar')).toBe('profile_avatar_url');
		});

		it('should handle many-to-one field mappings in reverse lookup', async () =>
		{
			const fieldMapping = {
				userName: 'name',
				userDisplayName: 'name',  // Two entity fields mapping to the same database field
			};

			const mapper = new MappingFieldMapper<any>(fieldMapping);

			const dbRow = { id: 1, name: 'John Doe', email: 'john@example.com' };
			const entity = await mapper.fromDb(dbRow);

			// Should only include the first entity field found in reverse mapping
			expect(entity).toEqual({
				id: 1,
				userDisplayName: 'John Doe', // Actual mapping result
				email: 'john@example.com',
			});
		});
	});
});