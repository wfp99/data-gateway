/**
 * @file Tests for field conflict detection in JOIN queries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Repository } from './repository';
import { DataProvider } from './dataProvider';
import { QueryResult } from './queryObject';
import { EntityFieldMapper } from './entityFieldMapper';
import { globalLogger, LogLevel } from './logger';

// Mock entity types
interface User
{
	id: number;
	name: string;
	email: string;
	status: string;
	createdAt: Date;
}

interface Post
{
	id: number;
	userId: number;
	title: string;
	status: string;
	createdAt: Date;
}

// Custom mappers for testing
class UserMapper implements EntityFieldMapper<User>
{
	toDbField(field: string): string
	{
		const mapping: Record<string, string> = {
			id: 'user_id',
			name: 'user_name',
			email: 'user_email',
			status: 'user_status',
			createdAt: 'user_created_at'
		};
		return mapping[field] || field;
	}

	fromDbField(dbField: string): string
	{
		const mapping: Record<string, string> = {
			user_id: 'id',
			user_name: 'name',
			user_email: 'email',
			user_status: 'status',
			user_created_at: 'createdAt'
		};
		return mapping[dbField] || dbField;
	}

	async toDb(entity: Partial<User>): Promise<Record<string, any>>
	{
		const result: Record<string, any> = {};
		for (const key in entity)
		{
			result[this.toDbField(key)] = (entity as any)[key];
		}
		return result;
	}

	async fromDb(row: Record<string, any>): Promise<User>
	{
		const result: any = {};
		for (const key in row)
		{
			result[this.fromDbField(key)] = row[key];
		}
		return result;
	}
}

class PostMapper implements EntityFieldMapper<Post>
{
	toDbField(field: string): string
	{
		const mapping: Record<string, string> = {
			id: 'post_id',
			userId: 'post_user_id',
			title: 'post_title',
			status: 'post_status',
			createdAt: 'post_created_at'
		};
		return mapping[field] || field;
	}

	fromDbField(dbField: string): string
	{
		const mapping: Record<string, string> = {
			post_id: 'id',
			post_user_id: 'userId',
			post_title: 'title',
			post_status: 'status',
			post_created_at: 'createdAt'
		};
		return mapping[dbField] || dbField;
	}

	async toDb(entity: Partial<Post>): Promise<Record<string, any>>
	{
		const result: Record<string, any> = {};
		for (const key in entity)
		{
			result[this.toDbField(key)] = (entity as any)[key];
		}
		return result;
	}

	async fromDb(row: Record<string, any>): Promise<Post>
	{
		const result: any = {};
		for (const key in row)
		{
			result[this.fromDbField(key)] = row[key];
		}
		return result;
	}
}

// Mock DataProvider
class MockProvider implements DataProvider
{
	async query<T = any>(): Promise<QueryResult<T>>
	{
		return {
			rows: [],
			affectedRows: 0
		};
	}

	async connect(): Promise<void> { }
	async disconnect(): Promise<void> { }
}

// Mock DataGateway for testing
class MockDataGateway
{
	private repositories = new Map<string, Repository<any>>();

	registerRepository(name: string, repo: Repository<any>): void
	{
		this.repositories.set(name, repo);
	}

	getRepository(name: string): Repository<any> | undefined
	{
		return this.repositories.get(name);
	}
}

describe('Field Conflict Detection', () =>
{
	let provider: MockProvider;
	let gateway: MockDataGateway;
	let userRepo: Repository<User, UserMapper>;
	let postRepo: Repository<Post, PostMapper>;
	let warnSpy: any;
	let originalLevel: LogLevel;

	beforeEach(() =>
	{
		provider = new MockProvider();
		gateway = new MockDataGateway();

		userRepo = new Repository(gateway as any, provider, 'users', new UserMapper());
		postRepo = new Repository(gateway as any, provider, 'posts', new PostMapper());

		gateway.registerRepository('users', userRepo);
		gateway.registerRepository('posts', postRepo);

		// Spy on logger warnings
		warnSpy = vi.spyOn(globalLogger, 'warn');

		// Enable WARN level logging for these tests
		originalLevel = globalLogger.getLevel();
		globalLogger.setLevel(LogLevel.WARN);
	});

	afterEach(() =>
	{
		warnSpy.mockRestore();
		globalLogger.setLevel(originalLevel);
	});

	describe('Conflict Detection', () =>
	{
		it('should detect conflicts when joining tables with common field names (SELECT *)', async () =>
		{
			// Mock query result
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Query without specifying fields (SELECT *)
			await userRepo.find({
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			// Should warn about conflicts for 'id', 'status', and 'createdAt'
			expect(warnSpy).toHaveBeenCalled();

			const warnings: string[] = warnSpy.mock.calls.map((call: any[]) => call[0] as string);

			// Check for 'id' conflict
			expect(warnings.some(w =>
				w.includes("Field 'id'") &&
				w.includes("exists in multiple tables")
			)).toBe(true);

			// Check for 'status' conflict
			expect(warnings.some(w =>
				w.includes("Field 'status'") &&
				w.includes("exists in multiple tables")
			)).toBe(true);

			// Check for 'createdAt' conflict
			expect(warnings.some(w =>
				w.includes("Field 'createdAt'") &&
				w.includes("exists in multiple tables")
			)).toBe(true);
		});

		it('should warn about specific field when explicitly requested without prefix', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Explicitly request 'id' field without table prefix
			await userRepo.find({
				fields: ['id', 'name'], // 'id' exists in both tables
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			expect(warnSpy).toHaveBeenCalled();

			const warnings: string[] = warnSpy.mock.calls.map((call: any[]) => call[0] as string);

			// Should warn about 'id' conflict
			expect(warnings.some(w =>
				w.includes("Field 'id'") &&
				w.includes("exists in multiple tables")
			)).toBe(true);

			// Should NOT warn about 'status' since it wasn't requested
			expect(warnings.some(w => w.includes("Field 'status'"))).toBe(false);
		});

		it('should NOT warn when fields are properly prefixed with table names', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Use table-prefixed fields
			await userRepo.find({
				fields: [
					{ table: 'users', field: 'id' },
					{ table: 'users', field: 'name' },
					{ table: 'posts', field: 'id' },
					{ table: 'posts', field: 'title' }
				],
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			// Should NOT warn since all fields are properly prefixed
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('should NOT warn when fields are properly prefixed with repository names', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Use repository-prefixed fields
			await userRepo.find({
				fields: [
					{ repository: 'users', field: 'id' },
					{ repository: 'users', field: 'name' },
					{ repository: 'posts', field: 'id' },
					{ repository: 'posts', field: 'title' }
				],
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			// Should NOT warn since all fields are properly prefixed
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('should NOT warn for queries without JOINs', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Simple query without JOINs
			await userRepo.find({
				fields: ['id', 'name', 'email']
			});

			// Should NOT warn since there are no JOINs
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('should provide helpful suggestions in warning messages', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			await userRepo.find({
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			expect(warnSpy).toHaveBeenCalled();

			const warnings: string[] = warnSpy.mock.calls.map((call: any[]) => call[0] as string);

			// Check that suggestion includes tableField helper
			expect(warnings.some(w => w.includes("tableField("))).toBe(true);
		});

		it('should handle aggregates with field conflicts', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Use aggregate on a conflicting field without prefix
			await userRepo.find({
				fields: [
					{ type: 'COUNT', field: 'id', alias: 'total' }
				],
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			expect(warnSpy).toHaveBeenCalled();

			const warnings: string[] = warnSpy.mock.calls.map((call: any[]) => call[0] as string);

			// Should warn about 'id' conflict even when used in aggregate
			expect(warnings.some(w =>
				w.includes("Field 'id'") &&
				w.includes("exists in multiple tables")
			)).toBe(true);
		});

		it('should NOT warn for aggregates with properly prefixed fields', async () =>
		{
			vi.spyOn(provider, 'query').mockResolvedValue({
				rows: [],
				affectedRows: 0
			});

			// Use aggregate with table-prefixed field
			await userRepo.find({
				fields: [
					{ type: 'COUNT', field: { table: 'users', field: 'id' }, alias: 'userCount' },
					{ type: 'COUNT', field: { table: 'posts', field: 'id' }, alias: 'postCount' }
				],
				joins: [{
					type: 'LEFT',
					source: { repository: 'posts' },
					on: { field: 'id', op: '=', value: 'posts.userId' }
				}]
			});

			// Should NOT warn since fields are properly prefixed
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});
});
