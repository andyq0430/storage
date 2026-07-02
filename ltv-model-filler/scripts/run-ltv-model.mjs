#!/usr/bin/env node
/**
 * run-ltv-model.mjs — LTV模型填充主入口脚本（v7.6）
 * 
 * 用法：
 *   node run-ltv-model.mjs               # 完整流程
 *   node run-ltv-model.mjs --skip-fill   # 跳过Excel填充
 *   node run-ltv-model.mjs --only-report # 仅生成HTML报告
 *   node run-ltv-model.mjs --force       # 强制运行（忽略数据过期检查）
 * 
 * 返回码：
 *   0  → 成功
 *   10 → 数据过期，需要浏览器提取
 *   1  → 其他错误
 * 
 * 数据新鲜度检查：
 *   - 如果 raw_data.json 不存在 → 需要提取数据（返回码 10）
 *   - 如果最新日期 < 当前日期-1天 → 数据过期（返回码 10）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');

// 解析参数
const args = process.argv.slice(2);
const skipFill = args.includes('--skip-fill');
const onlyReport = args.includes('--only-report');
const force = args.includes('--force');
const verbose = args.includes('--verbose');

// 获取当前日期（中国时区）
const now = new Date();
const chinaOffset = 8 * 60; // UTC+8
const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
const todayDate = chinaTime.toISOString().split('T')[0];

console.log('━'.repeat(70));
console.log('   VV渠道LTV模型填充 v7.6');
console.log('━'.repeat(70));
console.log('');
console.log(`📅 当前日期: ${todayDate}`);

// 步骤1：检查数据文件
const rawDataPath = path.join(SKILL_DIR, 'raw_data.json');
const inputDataPath = path.join(SKILL_DIR, 'input_data.json');
const resultsPath = path.join(SKILL_DIR, 'results.json');

// 数据不存在
if (!fs.existsSync(rawDataPath)) {
  console.log('');
  console.log('❌ raw_data.json 不存在');
  console.log('');
  console.log('【需要浏览器提取】');
  console.log('请执行以下步骤：');
  console.log('');
  console.log('  1. browser: action=start, profile=user');
  console.log('  2. browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
  console.log('  3. browser: action=snapshot → 检查登录/二级密码');
  console.log('  4. browser: action=act, kind=click, selector=button:has-text("vv")');
  console.log('  5. browser: action=act, kind=wait, timeMs=2000');
  console.log('  6. browser: action=act, kind=click, selector=h3:has-text("新增")');
  console.log('  7. browser: action=act, kind=wait, timeMs=3000');
  console.log('  8. browser: action=act, kind=evaluate → 执行提取脚本');
  console.log('  9. 将提取结果保存到 raw_data.json');
  console.log('  10. browser: action=stop');
  console.log('');
  process.exit(10); // 返回码 10 表示需要浏览器提取
}

const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));

// 数据无效
if (!rawData.ltvData || rawData.ltvData.length === 0) {
  console.log('');
  console.log('❌ raw_data.json 无有效 LTV 数据');
  console.log('');
  console.log('【需要浏览器提取】');
  console.log('请重新提取数据');
  console.log('');
  process.exit(10);
}

// 检查数据新鲜度
const allDates = rawData.ltvData.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);
const todayObj = new Date(todayDate);
const daysDiff = Math.floor((todayObj - latestDateObj) / (1000 * 60 * 60 * 24));

console.log(`📊 数据最新日期: ${latestDate}`);

// 数据过期（超过1天）
if (!force && daysDiff > 1) {
  console.log('');
  console.log(`⚠️ 数据已过期（距今天 ${daysDiff} 天）`);
  console.log('');
  console.log('【需要浏览器提取】');
  console.log('');
  console.log('执行步骤：');
  console.log('');
  console.log('  【步骤 1】启动浏览器');
  console.log('    browser: action=start, profile=user');
  console.log('');
  console.log('  【步骤 2】导航到产品数据页面');
  console.log('    browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
  console.log('');
  console.log('  【步骤 3】等待加载，检查页面状态');
  console.log('    browser: action=snapshot');
  console.log('    - 检查是否需要登录');
  console.log('    - 检查是否有二级密码弹窗（如有则输入）');
  console.log('');
  console.log('  【步骤 4】点击 vv 按钮');
  console.log('    browser: action=act, kind=click, selector=button:has-text("vv")');
  console.log('    或通过 snapshot ref 点击');
  console.log('');
  console.log('  【步骤 5】等待数据加载');
  console.log('    browser: action=act, kind=wait, timeMs=2000');
  console.log('');
  console.log('  【步骤 6】点击"新增"标签');
  console.log('    browser: action=act, kind=click, selector=h3:has-text("新增")');
  console.log('');
  console.log('  【步骤 7】等待表格加载');
  console.log('    browser: action=act, kind=wait, timeMs=3000');
  console.log('');
  console.log('  【步骤 8】提取数据');
  console.log('    browser: action=act, kind=evaluate');
  console.log('    fn: 提取脚本（见 SKILL.md）');
  console.log('');
  console.log('  【步骤 9】保存数据');
  console.log('    将提取结果写入: <技能目录>/raw_data.json');
  console.log('');
  console.log('  【步骤 10】关闭浏览器');
  console.log('    browser: action=stop');
  console.log('');
  console.log('  【步骤 11】重新运行');
  console.log('    node scripts/run-ltv-model.mjs');
  console.log('');
  console.log('或使用 --force 强制使用现有数据');
  console.log('');
  process.exit(10); // 返回码 10 表示需要浏览器提取
}

console.log(`✅ 数据新鲜度: OK`);
console.log(`   LTV数据: ${rawData.ltvData.length} 条`);
console.log(`   质量数据: ${rawData.qualityData?.length || 0} 条`);
console.log('');

// 如果只需要生成报告
if (onlyReport) {
  if (!fs.existsSync(resultsPath)) {
    console.log('❌ results.json 不存在，无法仅生成报告');
    process.exit(1);
  }
  runScript('gen-report.mjs');
  process.exit(0);
}

// 步骤2：数据转换
console.log('📊 步骤2: 数据转换（自动筛选近7日）');
runScript('transform-data.mjs');

if (!fs.existsSync(inputDataPath)) {
  console.log('❌ 数据转换失败');
  process.exit(1);
}

const inputData = JSON.parse(fs.readFileSync(inputDataPath, 'utf-8'));
console.log(`   ✅ 转换完成: ${inputData.length} 条数据`);
console.log('');

// 步骤3：Excel填充（可选）
if (!skipFill) {
  console.log('📝 步骤3: Excel填充');
  const modelPath = path.join(SKILL_DIR, '游戏LTV经营模型.xlsx');
  if (fs.existsSync(modelPath)) {
    runScript('fill-model.mjs', ['--data-file', inputDataPath, '--model-path', modelPath]);
  } else {
    console.log('   ⚠️ Excel模型文件不存在，跳过填充');
  }
  console.log('');
}

// 步骤4：分析计算
console.log('📈 步骤4: LTV分析计算');
runScript('analyze-ltv.mjs', ['--data-file', inputDataPath]);

if (!fs.existsSync(resultsPath)) {
  console.log('❌ 分析失败');
  process.exit(1);
}
console.log('');

// 步骤5：生成HTML报告
console.log('📄 步骤5: 生成HTML报告');
runScript('gen-report.mjs');
console.log('');

// 完成
console.log('━'.repeat(70));
console.log('✅ LTV模型填充完成！');
console.log('━'.repeat(70));
console.log('');
console.log('输出文件：');
console.log(`  • input_data.json  - 转换后数据（近7日）`);
if (!skipFill && fs.existsSync(path.join(SKILL_DIR, '游戏LTV经营模型.xlsx'))) {
  console.log(`  • 游戏LTV经营模型.xlsx - Excel模型`);
}
console.log(`  • results.json     - 分析结果`);
console.log(`  • report.html      - HTML报告`);
console.log('');

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
if (results.summary) {
  console.log('关键指标：');
  console.log(`  • 数据日期: ${latestDate}`);
  console.log(`  • 平均新增用户: ${results.summary.avgNewUsers}`);
  console.log(`  • 平均LTV_D0: ¥${results.summary.avgLtvD0}`);
  console.log(`  • 平均付费率D0: ${(results.summary.avgPayRateD0 * 100).toFixed(2)}%`);
  console.log(`  • 平均回本倍数: ${results.summary.avgRecycleMult}×`);
}

process.exit(0);

// 辅助函数
function runScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.log(`   ⚠️ 脚本不存在: ${scriptName}`);
    return false;
  }
  
  try {
    const result = execSync(`node "${scriptPath}" ${extraArgs.join(' ')}`, {
      encoding: 'utf-8',
      cwd: SKILL_DIR,
      stdio: verbose ? 'inherit' : 'pipe'
    });
    
    if (!verbose && result) {
      result.split('\n').filter(l => l.trim()).forEach(l => console.log(`   ${l}`));
    }
    return true;
  } catch (error) {
    console.log(`   ❌ 脚本执行失败: ${scriptName}`);
    if (verbose) console.log(error.message);
    return false;
  }
}