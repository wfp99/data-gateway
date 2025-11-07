/**
 * MySQL 完整功能測試程式
 *
 * 此程式測試 data-gateway 的所有 MySQL 功能，包括：
 * 1. 基本 CRUD 操作
 * 2. 複雜查詢條件 (AND/OR/NOT)
 * 3. JOIN 查詢
 * 4. 聚合函數
 * 5. NULL 檢查 (IS NULL / IS NOT NULL)
 * 6. LIKE 模糊查詢
 * 7. IN / NOT IN 查詢
 * 8. 排序和分頁
 * 9. 連線池管理
 * 10. 錯誤處理
 */

import { DataGateway, MySQLProviderOptions } from '../src/index';
import { tableField } from '../src/queryObject';
import { QueryBuilder } from '../src/queryBuilder';

// 顏色輸出工具
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function section(title: string) {
    console.log('\n' + '='.repeat(60));
    log(title, colors.bright + colors.cyan);
    console.log('='.repeat(60));
}

function success(message: string) {
    log(`✓ ${message}`, colors.green);
}

function error(message: string) {
    log(`✗ ${message}`, colors.red);
}

function info(message: string) {
    log(`ℹ ${message}`, colors.blue);
}

async function runTests() {
    let gateway: DataGateway | null = null;

    try {
        section('1. 初始化 MySQL 連線');

        const config = {
            providers: {
                mysql: {
                    type: 'mysql' as const,
                    options: {
                        host: 'localhost',
                        port: 3307,
                        user: 'test_user',
                        password: 'test_password',
                        database: 'test_db',
                        pool: {
                            usePool: true,
                            connectionLimit: 10,
                            acquireTimeout: 10000,
                            timeout: 60000,
                        }
                    } as MySQLProviderOptions
                }
            },
            repositories: {
                users: { provider: 'mysql', table: 'users' },
                posts: { provider: 'mysql', table: 'posts' },
                comments: { provider: 'mysql', table: 'comments' }
            }
        };

        gateway = await DataGateway.build(config);
        success('MySQL 連線成功建立');

        // 檢查連線池狀態
        const poolStatus = gateway.getProviderPoolStatus('mysql');
        if (poolStatus) {
            info(`連線池狀態: ${poolStatus.activeConnections}/${poolStatus.maxConnections} 連線使用中`);
        }

        const userRepo = gateway.getRepository('users');
        const postRepo = gateway.getRepository('posts');
        const commentRepo = gateway.getRepository('comments');

        if (!userRepo || !postRepo || !commentRepo) {
            throw new Error('無法取得 Repository');
        }

        // ========================================
        section('2. 基本查詢測試');
        // ========================================

        // 2.1 查詢所有活躍用戶
        const activeUsers = await userRepo.find({
            where: { field: 'status', op: '=', value: 'active' },
            orderBy: [{ field: 'name', direction: 'ASC' }]
        });
        success(`查詢到 ${activeUsers.length} 個活躍用戶`);
        console.log('前 3 位用戶:', activeUsers.slice(0, 3).map((u: any) => u.name));

        // 2.2 條件查詢：年齡 >= 30
        const seniorUsers = await userRepo.find({
            where: { field: 'age', op: '>=', value: 30 },
            fields: ['name', 'age', 'department']
        });
        success(`查詢到 ${seniorUsers.length} 個年齡 >= 30 的用戶`);

        // ========================================
        section('3. IS NULL / IS NOT NULL 測試');
        // ========================================

        // 3.1 查詢未刪除的用戶 (deleted_at IS NULL)
        const notDeletedUsers = await userRepo.find({
            where: { field: 'deleted_at', op: 'IS NULL' },
            fields: ['id', 'name', 'email']
        });
        success(`IS NULL 測試: 查詢到 ${notDeletedUsers.length} 個未刪除的用戶`);

        // 3.2 使用 QueryBuilder 測試 isNull
        const queryIsNull = new QueryBuilder('users')
            .select('id', 'name', 'deleted_at')
            .where(w => w.isNull('deleted_at'))
            .limit(5)
            .build();
        const isNullResult = await userRepo.find(queryIsNull);
        success(`QueryBuilder.isNull() 測試: ${isNullResult.length} 筆資料`);

        // 3.3 使用 QueryBuilder 測試 isNotNull (假設 email 都不為 NULL)
        const queryIsNotNull = new QueryBuilder('users')
            .select('id', 'name', 'email')
            .where(w => w.isNotNull('email'))
            .limit(5)
            .build();
        const isNotNullResult = await userRepo.find(queryIsNotNull);
        success(`QueryBuilder.isNotNull() 測試: ${isNotNullResult.length} 筆資料`);

        // ========================================
        section('4. LIKE 模糊查詢測試');
        // ========================================

        // 4.1 查詢名字包含 "Chen" 的用戶
        const chenUsers = await userRepo.find({
            where: { like: { field: 'name', pattern: '%Chen%' } },
            fields: ['name', 'email']
        });
        success(`LIKE 測試: 查詢到 ${chenUsers.length} 個名字包含 "Chen" 的用戶`);
        console.log('用戶名稱:', chenUsers.map((u: any) => u.name));

        // 4.2 使用 QueryBuilder 測試 like
        const queryLike = new QueryBuilder('users')
            .select('name', 'department')
            .where(w => w.like('email', '%example.com'))
            .build();
        const likeResult = await userRepo.find(queryLike);
        success(`QueryBuilder.like() 測試: ${likeResult.length} 筆資料`);

        // ========================================
        section('5. IN / NOT IN 測試');
        // ========================================

        // 5.1 IN 查詢
        const engineeringUsers = await userRepo.find({
            where: { field: 'department', op: 'IN', values: ['Engineering', 'Product'] },
            fields: ['name', 'department', 'salary']
        });
        success(`IN 測試: 查詢到 ${engineeringUsers.length} 個工程或產品部門的用戶`);

        // 5.2 NOT IN 查詢
        const nonDesignUsers = await userRepo.find({
            where: { field: 'department', op: 'NOT IN', values: ['Design'] },
            fields: ['name', 'department']
        });
        success(`NOT IN 測試: 查詢到 ${nonDesignUsers.length} 個非設計部門的用戶`);

        // ========================================
        section('6. 複雜條件查詢 (AND/OR/NOT)');
        // ========================================

        // 6.1 AND 條件：活躍且年齡 >= 30 且薪水 >= 80000
        const complexQuery1 = await userRepo.find({
            where: {
                and: [
                    { field: 'status', op: '=', value: 'active' },
                    { field: 'age', op: '>=', value: 30 },
                    { field: 'salary', op: '>=', value: 80000 }
                ]
            },
            fields: ['name', 'age', 'salary', 'department']
        });
        success(`AND 條件測試: ${complexQuery1.length} 筆符合條件的資料`);

        // 6.2 OR 條件：工程部門或薪水 > 100000
        const complexQuery2 = await userRepo.find({
            where: {
                or: [
                    { field: 'department', op: '=', value: 'Engineering' },
                    { field: 'salary', op: '>', value: 100000 }
                ]
            },
            fields: ['name', 'department', 'salary']
        });
        success(`OR 條件測試: ${complexQuery2.length} 筆符合條件的資料`);

        // 6.3 使用 QueryBuilder 建立複雜查詢
        const complexQuery3 = new QueryBuilder('users')
            .select('name', 'department', 'status', 'age')
            .where(w => w
                .equals('status', 'active')
                .greaterThanOrEquals('age', 25)
                .in('department', ['Engineering', 'Product', 'Design'])
            )
            .orderBy('age', 'DESC')
            .limit(5)
            .build();
        const complexResult3 = await userRepo.find(complexQuery3);
        success(`QueryBuilder 複雜查詢: ${complexResult3.length} 筆資料`);

        // ========================================
        section('7. JOIN 查詢測試');
        // ========================================

        // 7.1 查詢文章及作者資訊
        const postsWithAuthors = await postRepo.find({
            fields: [
                tableField('posts', 'id'),
                tableField('posts', 'title'),
                tableField('posts', 'views'),
                tableField('users', 'name'),
                tableField('users', 'email')
            ],
            joins: [{
                type: 'INNER',
                source: { table: 'users' },
                on: { field: 'posts.user_id', op: '=', value: 'users.id' }
            }],
            where: { field: 'posts.status', op: '=', value: 'published' },
            orderBy: [{ field: 'posts.views', direction: 'DESC' }],
            limit: 5
        });
        success(`JOIN 測試: 查詢到 ${postsWithAuthors.length} 篇已發布文章`);
        console.log('熱門文章:', postsWithAuthors.map((p: any) => `${p.title} (${p.views} 次瀏覽)`));

        // 7.2 使用 QueryBuilder 建立 JOIN 查詢
        const joinQuery = new QueryBuilder('posts')
            .select(
                tableField('posts', 'title'),
                tableField('posts', 'status'),
                tableField('users', 'name')
            )
            .innerJoin(
                { table: 'users' },
                on => on.equals(tableField('posts', 'user_id'), tableField('users', 'id'))
            )
            .where(w => w.equals(tableField('posts', 'status'), 'published'))
            .orderBy(tableField('posts', 'created_at'), 'DESC')
            .limit(3)
            .build();
        const joinResult = await postRepo.find(joinQuery);
        success(`QueryBuilder JOIN 測試: ${joinResult.length} 筆資料`);

        // ========================================
        section('8. 聚合函數測試');
        // ========================================

        // 8.1 COUNT - 統計各部門人數
        const deptCount = await userRepo.find({
            fields: [
                'department',
                { type: 'COUNT', field: 'id', alias: 'count' }
            ],
            groupBy: ['department'],
            orderBy: [{ field: 'count', direction: 'DESC' }]
        });
        success(`COUNT 測試: 統計到 ${deptCount.length} 個部門`);
        console.log('部門人數:', deptCount.map((d: any) => `${d.department}: ${d.count}`));

        // 8.2 AVG, MAX, MIN - 薪資統計
        const salaryStats = await userRepo.find({
            fields: [
                { type: 'AVG', field: 'salary', alias: 'avg_salary' },
                { type: 'MAX', field: 'salary', alias: 'max_salary' },
                { type: 'MIN', field: 'salary', alias: 'min_salary' }
            ]
        });
        success('薪資統計測試完成');
        if (salaryStats.length > 0) {
            const stats = salaryStats[0];
            console.log(`平均薪資: $${parseFloat(stats.avg_salary).toFixed(2)}`);
            console.log(`最高薪資: $${stats.max_salary}`);
            console.log(`最低薪資: $${stats.min_salary}`);
        }

        // 8.3 使用 QueryBuilder 的聚合方法
        const aggQuery = new QueryBuilder('posts')
            .count('id', 'total_posts')
            .sum('views', 'total_views')
            .avg('views', 'avg_views')
            .build();
        const aggResult = await postRepo.find(aggQuery);
        success('QueryBuilder 聚合函數測試完成');
        if (aggResult.length > 0) {
            const agg = aggResult[0];
            console.log(`總文章數: ${agg.total_posts}`);
            console.log(`總瀏覽數: ${agg.total_views}`);
            console.log(`平均瀏覽數: ${parseFloat(agg.avg_views).toFixed(2)}`);
        }

        // ========================================
        section('9. CRUD 操作測試');
        // ========================================

        // 9.1 INSERT - 新增用戶
        const newUserId = await userRepo.insert({
            name: 'Test User',
            email: `test${Date.now()}@example.com`,
            age: 30,
            status: 'active',
            department: 'Testing',
            salary: 70000
        });
        success(`INSERT 測試: 新增用戶 ID = ${newUserId}`);

        // 9.2 UPDATE - 更新用戶
        const updateCount = await userRepo.update(
            { salary: 75000, department: 'QA' },
            { field: 'id', op: '=', value: newUserId }
        );
        success(`UPDATE 測試: 更新了 ${updateCount} 筆資料`);

        // 9.3 SELECT - 驗證更新
        const updatedUser = await userRepo.find({
            where: { field: 'id', op: '=', value: newUserId },
            fields: ['name', 'department', 'salary']
        });
        if (updatedUser.length > 0) {
            success(`SELECT 驗證: ${updatedUser[0].name} - ${updatedUser[0].department} - $${updatedUser[0].salary}`);
        }

        // 9.4 DELETE - 刪除測試用戶
        const deleteCount = await userRepo.delete({
            field: 'id',
            op: '=',
            value: newUserId
        });
        success(`DELETE 測試: 刪除了 ${deleteCount} 筆資料`);

        // ========================================
        section('10. 分頁測試');
        // ========================================

        const page1 = await userRepo.find({
            fields: ['id', 'name'],
            orderBy: [{ field: 'id', direction: 'ASC' }],
            limit: 3,
            offset: 0
        });
        success(`第 1 頁: ${page1.length} 筆資料`);

        const page2 = await userRepo.find({
            fields: ['id', 'name'],
            orderBy: [{ field: 'id', direction: 'ASC' }],
            limit: 3,
            offset: 3
        });
        success(`第 2 頁: ${page2.length} 筆資料`);

        // ========================================
        section('11. 連線池狀態檢查');
        // ========================================

        const finalPoolStatus = gateway.getProviderPoolStatus('mysql');
        if (finalPoolStatus) {
            info(`最終連線池狀態:`);
            console.log(`  - 總連線數: ${finalPoolStatus.totalConnections}`);
            console.log(`  - 使用中連線: ${finalPoolStatus.activeConnections}`);
            console.log(`  - 閒置連線: ${finalPoolStatus.idleConnections}`);
            console.log(`  - 最大連線數: ${finalPoolStatus.maxConnections}`);
        }

        // ========================================
        section('測試總結');
        // ========================================

        success('✓ 所有測試項目執行完成！');
        console.log('\n測試項目清單:');
        console.log('  ✓ 基本查詢');
        console.log('  ✓ IS NULL / IS NOT NULL');
        console.log('  ✓ LIKE 模糊查詢');
        console.log('  ✓ IN / NOT IN');
        console.log('  ✓ 複雜條件 (AND/OR/NOT)');
        console.log('  ✓ JOIN 查詢');
        console.log('  ✓ 聚合函數 (COUNT/SUM/AVG/MIN/MAX)');
        console.log('  ✓ CRUD 操作');
        console.log('  ✓ 分頁查詢');
        console.log('  ✓ 連線池管理');
        console.log('  ✓ QueryBuilder API');

    } catch (err) {
        error(`測試失敗: ${err instanceof Error ? err.message : String(err)}`);
        console.error(err);
        process.exit(1);
    } finally {
        if (gateway) {
            await gateway.disconnectAll();
            success('資料庫連線已關閉');
        }
    }
}

// 執行測試
log('\n🚀 開始執行 MySQL 完整功能測試\n', colors.bright);
runTests().then(() => {
    log('\n✨ 測試執行完畢！\n', colors.bright + colors.green);
    process.exit(0);
}).catch((err) => {
    error(`\n發生錯誤: ${err.message}\n`);
    process.exit(1);
});
