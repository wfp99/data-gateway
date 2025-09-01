# 測試與開發建議

本專案採用 [Vitest](https://vitest.dev/) 進行單元測試。

## 執行測試

```bash
npm test
# 或
npx vitest
```

## 測試檔案位置
- 所有測試檔案皆位於 `src/**/*.test.ts`
- 範例：`src/index.test.ts`

## 測試建議
- 使用 mock provider 進行 isolation 測試
- 覆蓋 CRUD、異常、連線失敗等情境
- 可參考現有測試案例撰寫

## 開發建議
- 嚴格型別檢查（TypeScript strict）
- 撰寫自動化測試，確保擴充元件穩定
- PR 前請確保所有測試通過
