import type { Query, QueryResult } from './queryObject';

/**
 * Middlewares can intercept and process queries before they are passed to the next stage.
 * @param query The incoming query object.
 * @param next A function that invokes the next middleware in the chain.
 * @returns A promise that resolves with the query result.
 */
export type Middleware = (query: Query, next: (query: Query) => Promise<QueryResult>) => Promise<QueryResult>;

/**
 * Composes and executes a chain of middleware functions for a given query.
 * @param middlewares An array of middleware functions to run.
 * @param query The initial query object.
 * @param final The final function to call after all middlewares have been executed.
 * @returns A promise that resolves with the final query result.
 */
export async function runMiddlewares(middlewares: Middleware[], query: Query, final: (query: Query) => Promise<QueryResult>): Promise<QueryResult>
{
	if (middlewares.length === 0) { return final(query); }

	let idx = -1;
	async function dispatch(i: number, q: Query): Promise<QueryResult>
	{
		if (i <= idx) throw new Error('middleware: next() called multiple times');
		idx = i;
		const mw = middlewares[i];
		if (!mw)
			return final(q);

		const res = await mw(q, (nextQuery) => dispatch(i + 1, nextQuery));
		return res;
	}

	return dispatch(0, query);
}
