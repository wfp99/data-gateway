import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Enable Vitest's built-in globals API (describe, it, expect), no need for manual import
		globals: true,
		// Test environment, use 'node' for backend projects
		environment: 'node',
		// Included test files, you can adjust based on project structure
		include: ['src/**/*.test.ts'],
	},
});