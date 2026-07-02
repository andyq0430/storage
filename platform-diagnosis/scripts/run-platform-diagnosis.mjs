#!/usr/bin/env node
/**
 * run-platform-diagnosis.mjs — 平台经营体检主入口脚本（v2.4）
 * 
 * 用法：
 *   node run-platform-diagnosis.mjs               # 完整流程（诊断→报告）
 *   node run-platform-diagnosis.mjs --skip-diag   # 仅生成报告（不重新诊断）
 *   node run-platform-diagnosis.mjs --force       # 强制使用过期数据
 *   node run-platform-diagnosis.mjs --verbose     # 详细输出
 * 
 * 返回码：
 *   0  → 成功完成
 *   10 → 数据过期，需要浏览器提取
 *   1  → 其他错误
 * 
 * 数据新鲜度检查：
 *   - 如果 platform_raw.json 不存在 → 需要提取数据（返回码 10）
 *   - 如果提取日期 < 当前日期-1天 → 数据过期（返回码 10）
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
const skipDiag = args.includes('--skip-diag');
const force = args.includes('--force');
const verbose = args.includes('--verbose');

// 获取当前日期（中国时区）
const now = new Date();
const chinaOffset = 8 * 60; // UTC+8
const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
const todayDate = chinaTime.toISOString().split('T')[0];

console.log('━'.repeat(70));
console.log('平台经营体检 v2.4');
console.log('━'.repeat(70));
console.log('');
console.log(`📅 当前日期: ${todayDate}`);

// 步骤1：检查数据文件
const rawPath = path.join(SKILL_DIR, 'platform_raw.json');
const diagPath = path.join(SKILL_DIR, 'cross_diagnosis.json');
const reportPath = path.join(SKILL_DIR, 'report', 'index.html');

// 数据不存在
if (!fs.existsSync(rawPath)) {
  console.log('');
  console.log('❌ platform_raw.json 不存在');
  console.log('');
  console.log('【需要浏览器提取】');
  console.log('');
  console.log('执行步骤：');
  console.log('');
  console.log('  【步骤 1】启动浏览器');
  console.log('    browser: action=start');
  console.log('');
  console.log('  【步骤 2】导航到产品数据页面');
  console.log('    browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
  console.log('');
  console.log('  【步骤 3】等待加载，检查页面状态');
  console.log('    browser: action=snapshot');
  console.log('    - 检查是否需要登录');
  console.log('    - 检查是否有二级密码弹窗（如有则输入密码）');
  console.log('');
  console.log('  【步骤 4】确保"全平台"按钮选中');
  console.log('    browser: action=act, kind=click, selector=button:has-text("全平台")');
  console.log('');
  console.log('  【步骤 5】等待数据加载');
  console.log('    browser: action=act, kind=wait, timeMs=2000');
  console.log('');
  console.log('  【步骤 6】提取四维数据');
  console.log('    browser: action=act, kind=evaluate');
  console.log('    fn: 提取脚本（见 SKILL.md）');
  console.log('');
  console.log('  【步骤 7】保存数据');
  console.log('    将提取结果写入: <技能目录>/platform_raw.json');
  console.log('');
  console.log('  【步骤 8】关闭浏览器');
  console.log('    browser: action=stop');
  console.log('');
  console.log('  【步骤 9】重新运行');
  console.log('    node scripts/run-platform-diagnosis.mjs');
  console.log('');
  process.exit(10);
}

const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// 检查数据有效性
const platforms = rawData.platforms || rawData.platformDetails || rawData.rawData?.revenue || [];
if (platforms.length === 0) {
  console.log('');
  console.log('❌ platform_raw.json 无有效平台数据');
  console.log('');
  console.log('【需要浏览器提取】');
  process.exit(10);
}

// 检查数据新鲜度（检查数据中的业务日期，而不是提取时间）
const dataYesterday = rawData.meta?.dateRange?.yesterday || rawData.totals?.dateYesterday || '1970-01-01';
const dataYesterdayObj = new Date(dataYesterday);
const todayObj = new Date(todayDate);
const daysDiff = Math.floor((todayObj - dataYesterdayObj) / (1000 * 60 * 60 * 24));

console.log(`📊 数据最新日期: ${dataYesterday}`);

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
  console.log('    browser: action=start');
  console.log('');
  console.log('  【步骤 2】导航到产品数据页面');
  console.log('    browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
  console.log('');
  console.log('  【步骤 3】等待加载，检查页面状态');
  console.log('    browser: action=snapshot');
  console.log('    - 检查是否需要登录');
  console.log('    - 检查是否有二级密码弹窗（如有则输入密码）');
  console.log('');
  console.log('  【步骤 4】确保"全平台"按钮选中');
  console.log('    browser: action=act, kind=click, selector=button:has-text("全平台")');
  console.log('');
  console.log('  【步骤 5】等待数据加载');
  console.log('    browser: action=act, kind=wait, timeMs=2000');
  console.log('');
  console.log('  【步骤 6】提取四维数据');
  console.log('    browser: action=act, kind=evaluate');
  console.log('    fn: 提取脚本（见 SKILL.md）');
  console.log('');
  console.log('  【步骤 7】保存数据');
  console.log('    将提取结果写入: <技能目录>/platform_raw.json');
  console.log('');
  console.log('  【步骤 8】关闭浏览器');
  console.log('    browser: action=stop');
  console.log('');
  console.log('  【步骤 9】重新运行');
  console.log('    node scripts/run-platform-diagnosis.mjs');
  console.log('');
  console.log('或使用 --force 强制使用现有数据');
  console.log('');
  process.exit(10);
}

console.log(`✅ 数据新鲜度: OK`);
console.log(`   平台数量: ${platforms.length}`);
console.log('');

// 步骤2：交叉诊断
if (!skipDiag) {
  console.log('🔍 步骤2: 四维交叉诊断');
  runScript('cross-diagnosis.mjs');
  
  if (!fs.existsSync(diagPath)) {
    console.log('❌ 诊断失败: cross_diagnosis.json 未生成');
    process.exit(1);
  }
  console.log('');
}

// 步骤3：生成HTML报告
console.log('📄 步骤3: 生成HTML报告');
runScript('generate-report.mjs');

if (!fs.existsSync(reportPath)) {
  console.log('❌ 报告生成失败');
  process.exit(1);
}
console.log('');

// 完成
console.log('━'.repeat(70));
console.log('✅ 平台经营体检完成！');
console.log('━'.repeat(70));
console.log('');
console.log('输出文件：');
console.log(`  • platform_raw.json   - 四维原始数据`);
console.log(`  • cross_diagnosis.json - 诊断结果`);
console.log(`  • report/index.html    - HTML报告（7标签页）`);
console.log('');

// 显示关键诊断结果
if (fs.existsSync(diagPath)) {
  const diag = JSON.parse(fs.readFileSync(diagPath, 'utf-8'));
  
  console.log('诊断结果：');
  console.log(`  • 健康分: ${diag.healthScore?.total || 'N/A'} (${diag.healthScore?.level || '未知'})`);
  console.log(`  • 触发规则: ${diag.matches?.length || 0} 条`);
  
  if (diag.matches && diag.matches.length > 0) {
    const topMatch = diag.matches[0];
    console.log(`  • 主导诊断: 规则${topMatch.rule} - ${topMatch.name} (${topMatch.risk}风险)`);
  }
  
  if (diag.structureRisk) {
    console.log(`  • HHI指数: ${diag.structureRisk.hhi || 'N/A'}`);
    console.log(`  • 集中度风险: ${diag.structureRisk.concentrationRisk || 'N/A'}`);
  }
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