import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// 啟用 Vitest 的內建 globals API (describe, it, expect)，無需手動 import
		globals: true,
		// 測試環境，對於後端專案使用 'node'
		environment: 'node',
		// 包含的測試檔案，您可以根據專案結構調整
		include: ['src/**/*.test.ts'],
	},
});