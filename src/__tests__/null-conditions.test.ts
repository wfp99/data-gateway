import { describe, it, expect } from 'vitest';
import { SQLValidator } from '../dataProviders/sqlValidator';
import { QueryCompiler } from '../queryCompiler';
import { MySQLEscaper } from '../dataProviders/sqlEscaper';
import { Query, Condition } from '../queryObject';

/**
 * IS NULL and IS NOT NULL condition tests
 * Tests the implementation of NULL checking conditions across the system
 */
describe('IS NULL and IS NOT NULL Conditions', () =>
{
	const escaper = new MySQLEscaper();

	describe('SQLValidator', () =>
	{
		it('should validate IS NULL operator', () =>
		{
			expect(SQLValidator.validateOperator('IS NULL')).toBe(true);
		});

		it('should validate IS NOT NULL operator', () =>
		{
			expect(SQLValidator.validateOperator('IS NOT NULL')).toBe(true);
		});

		it('should validate IS NULL condition structure', () =>
		{
			const condition: Condition = { field: 'deleted_at', op: 'IS NULL' };
			expect(() => SQLValidator.validateCondition(condition)).not.toThrow();
		});

		it('should validate IS NOT NULL condition structure', () =>
		{
			const condition: Condition = { field: 'created_by', op: 'IS NOT NULL' };
			expect(() => SQLValidator.validateCondition(condition)).not.toThrow();
		});

		it('should validate complex conditions with IS NULL', () =>
		{
			const condition: Condition = {
				and: [
					{ field: 'status', op: '=', value: 'active' },
					{ field: 'deleted_at', op: 'IS NULL' }
				]
			};
			expect(() => SQLValidator.validateCondition(condition)).not.toThrow();
		});
	});

	describe('QueryCompiler', () =>
	{
		it('should compile IS NULL condition', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name'],
				where: { field: 'deleted_at', op: 'IS NULL' }
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NULL');
			expect(compiled.where?.sql).toContain('deleted_at');
			expect(compiled.where?.params).toEqual([]);
		});

		it('should compile IS NOT NULL condition', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name'],
				where: { field: 'email', op: 'IS NOT NULL' }
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NOT NULL');
			expect(compiled.where?.sql).toContain('email');
			expect(compiled.where?.params).toEqual([]);
		});

		it('should compile complex conditions with IS NULL', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'deleted_at', op: 'IS NULL' }
					]
				}
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NULL');
			expect(compiled.where?.sql).toContain('deleted_at');
			expect(compiled.where?.sql).toContain('status');
			expect(compiled.where?.params).toEqual(['active']);
		});

		it('should compile OR condition with IS NOT NULL', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'posts',
				fields: ['*'],
				where: {
					or: [
						{ field: 'published_at', op: 'IS NOT NULL' },
						{ field: 'draft', op: '=', value: true }
					]
				}
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NOT NULL');
			expect(compiled.where?.sql).toContain('published_at');
			expect(compiled.where?.sql).toContain('draft');
			expect(compiled.where?.params).toEqual([true]);
		});

		it('should compile NOT with IS NULL', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					not: { field: 'deleted_at', op: 'IS NULL' }
				}
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('NOT');
			expect(compiled.where?.sql).toContain('IS NULL');
			expect(compiled.where?.sql).toContain('deleted_at');
			expect(compiled.where?.params).toEqual([]);
		});
	});

	describe('Type Safety', () =>
	{
		it('should accept IS NULL condition type', () =>
		{
			const condition: Condition = { field: 'deleted_at', op: 'IS NULL' };
			expect(condition.op).toBe('IS NULL');
		});

		it('should accept IS NOT NULL condition type', () =>
		{
			const condition: Condition = { field: 'email', op: 'IS NOT NULL' };
			expect(condition.op).toBe('IS NOT NULL');
		});

		it('should work with field references', () =>
		{
			const condition: Condition = {
				field: { table: 'users', field: 'deleted_at' },
				op: 'IS NULL'
			};
			expect(condition.op).toBe('IS NULL');
		});
	});

	describe('Real-world Use Cases', () =>
	{
		it('should support soft delete pattern', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: { field: 'deleted_at', op: 'IS NULL' }
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NULL');
			expect(compiled.where?.sql).toContain('deleted_at');
		});

		it('should support required field check', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'profiles',
				fields: ['*'],
				where: { field: 'email_verified_at', op: 'IS NOT NULL' }
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NOT NULL');
			expect(compiled.where?.sql).toContain('email_verified_at');
		});

		it('should support finding unassigned records', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'tasks',
				fields: ['*'],
				where: {
					and: [
						{ field: 'assigned_to', op: 'IS NULL' },
						{ field: 'status', op: '=', value: 'pending' }
					]
				}
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NULL');
			expect(compiled.where?.sql).toContain('assigned_to');
			expect(compiled.where?.sql).toContain('status');
			expect(compiled.where?.params).toEqual(['pending']);
		});

		it('should support filtering completed records', () =>
		{
			const compiler = new QueryCompiler(escaper);
			const query: Query = {
				type: 'SELECT',
				table: 'tasks',
				fields: ['*'],
				where: {
					or: [
						{ field: 'completed_at', op: 'IS NOT NULL' },
						{ field: 'cancelled_at', op: 'IS NOT NULL' }
					]
				}
			};

			const compiled = compiler.compile(query);
			expect(compiled.where?.sql).toContain('IS NOT NULL');
			expect(compiled.where?.sql).toContain('completed_at');
			expect(compiled.where?.sql).toContain('cancelled_at');
			expect(compiled.where?.params).toEqual([]);
		});
	});
});
