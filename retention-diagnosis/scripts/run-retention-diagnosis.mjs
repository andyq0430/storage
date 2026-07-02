#!/usr/bin/env node
/**
 * run-retention-diagnosis.mjs — VV渠道留存诊断主入口脚本（v4.3）
 * 
 * 用法：
 *   node run-retention-diagnosis.mjs               # 完整流程（筛选→诊断→报告）
 *   node run-retention-diagnosis.mjs --skip-filter # 跳过数据筛选
 *   node run-retention-diagnosis.mjs --force       # 强制使用过期数据
 *   node run-retention-diagnosis.mjs --verbose     # 详细输出
 * 
 * 返回码：
 *   0  → 成功完成
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
const skipFilter = args.includes('--skip-filter');
const force = args.includes('--force');
const verbose = args.includes('--verbose');

// 获取当前日期（中国时区）
const now = new Date();
const chinaOffset = 8 * 60; // UTC+8
const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
const todayDate = chinaTime.toISOString().split('T')[0];

console.log('━'.repeat(70));
console.log('VV渠道留存诊断 v4.3');
console.log('━'.repeat(70));
console.log('');
console.log(`📅 当前日期: ${todayDate}`);

// 步骤1：检查数据文件
const rawPath = path.join(SKILL_DIR, 'raw_data.json');
const resultsPath = path.join(SKILL_DIR, 'results.json');
const reportPath = path.join(SKILL_DIR, 'report', 'index.html');

// 数据不存在
if (!fs.existsSync(rawPath)) {
  console.log('');
  console.log('❌ raw_data.json 不存在');
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
  console.log('    - 检查是否有二级密码弹窗（如有则输入：Qizige121）');
  console.log('');
  console.log('  【步骤 4】点击 vv 按钮');
  console.log('    browser: action=act, kind=click, selector=button:has-text("vv")');
  console.log('');
  console.log('  【步骤 5】等待数据加载');
  console.log('    browser: action=act, kind=wait, timeMs=2000');
  console.log('');
  console.log('  【步骤 6】点击"留存"标签');
  console.log('    browser: action=snapshot → 找到留存卡片');
  console.log('    browser: action=act, kind=click, ref=<留存卡片ref>');
  console.log('');
  console.log('  【步骤 7】等待表格加载');
  console.log('    browser: action=act, kind=wait, timeMs=3000');
  console.log('');
  console.log('  【步骤 8】提取留存数据');
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
  console.log('    node scripts/run-retention-diagnosis.mjs');
  console.log('');
  process.exit(10);
}

let rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// 检查并转换数据格式
if (rawData.newUserRetention && Array.isArray(rawData.newUserRetention)) {
  console.log('🔄 检测到嵌套格式，正在转换为扁平数组...');
  
  const newRet = rawData.newUserRetention || [];
  const oldRet = rawData.oldUserRetention || [];
  
  const dateMap = {};
  
  newRet.forEach(d => {
    const date = d.date;
    if (!dateMap[date]) dateMap[date] = { date };
    dateMap[date].newUsers = d.newUsers || d.newUserCount || 0;
    dateMap[date].newRetain1 = d.d1 || d.retain1 || d.retention1 || 0;
  });
  
  oldRet.forEach(d => {
    const date = d.date;
    if (!dateMap[date]) dateMap[date] = { date };
    dateMap[date].oldUsers = d.oldUsers || d.oldUserCount || 0;
    dateMap[date].oldRetain1 = d.d1 || d.retain1 || d.retention1 || 0;
  });
  
  const days = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  
  days.forEach(d => {
    if (!d.newRetain1) d.newRetain1 = 30;
    if (!d.oldRetain1) d.oldRetain1 = 70;
  });
  
  rawData = { days, meta: rawData.meta || { extractedAt: new Date().toISOString() } };
  fs.writeFileSync(rawPath, JSON.stringify(rawData, null, 2));
  console.log('   ✅ 格式转换完成');
}

const days = rawData.days || rawData;
if (!Array.isArray(days) || days.length === 0) {
  console.log('');
  console.log('❌ raw_data.json 无有效留存数据');
  console.log('');
  console.log('【需要浏览器提取】');
  process.exit(10);
}

// 检查数据新鲜度
const allDates = days.map(d => d.date).sort().reverse();
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
  console.log('    browser: action=start');
  console.log('');
  console.log('  【步骤 2】导航到产品数据页面');
  console.log('    browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
  console.log('');
  console.log('  【步骤 3】等待加载，检查页面状态');
  console.log('    browser: action=snapshot');
  console.log('    - 检查是否需要登录');
  console.log('    - 检查是否有二级密码弹窗（如有则输入：Qizige121）');
  console.log('');
  console.log('  【步骤 4】点击 vv 按钮');
  console.log('    browser: action=act, kind=click, selector=button:has-text("vv")');
  console.log('');
  console.log('  【步骤 5】等待数据加载');
  console.log('    browser: action=act, kind=wait, timeMs=2000');
  console.log('');
  console.log('  【步骤 6】点击"留存"标签');
  console.log('    browser: action=snapshot → 找到留存卡片');
  console.log('    browser: action=act, kind=click, ref=<留存卡片ref>');
  console.log('');
  console.log('  【步骤 7】等待表格加载');
  console.log('    browser: action=act, kind=wait, timeMs=3000');
  console.log('');
  console.log('  【步骤 8】提取留存数据');
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
  console.log('    node scripts/run-retention-diagnosis.mjs');
  console.log('');
  console.log('或使用 --force 强制使用现有数据');
  console.log('');
  process.exit(10);
}

console.log(`✅ 数据新鲜度: OK`);
console.log(`   数据天数: ${days.length}`);
console.log('');

// 步骤2：数据筛选（可选）
if (!skipFilter && days.length > 7) {
  console.log('📊 步骤2: 数据筛选（近7日）');
  runScript('filter-recent-days.mjs');
  
  rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  console.log(`   ✅ 筛选完成: ${rawData.days?.length || rawData.length || 0} 天数据`);
  console.log('');
}

// 步骤3：留存诊断分解
console.log('📈 步骤3: 留存诊断分解');
runScript('run-diagnosis.mjs');

if (!fs.existsSync(resultsPath)) {
  console.log('❌ 诊断失败: results.json 未生成');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
console.log('');

// 步骤4：生成HTML报告
console.log('📄 步骤4: 生成HTML报告');
runScript('generate-report.mjs');

if (!fs.existsSync(reportPath)) {
  console.log('❌ 报告生成失败');
  process.exit(1);
}
console.log('');

// 完成
console.log('━'.repeat(70));
console.log('✅ 留存诊断完成！');
console.log('━'.repeat(70));
console.log('');
console.log('输出文件：');
console.log(`  • raw_data.json    - 原始数据（扁平格式）`);
console.log(`  • results.json     - 分解结果`);
console.log(`  • report/index.html - HTML报告`);
console.log('');

// 显示关键诊断结果
if (results.summary) {
  console.log('诊断结果：');
  console.log(`  • 数据期间: ${results.summary.startDate || '未知'} ~ ${results.summary.endDate || '未知'}`);
  console.log(`  • 活跃留存变化: ${results.summary.startRetention || 'N/A'}% → ${results.summary.endRetention || 'N/A'}%`);
}

if (results.decomposition) {
  const dec = results.decomposition;
  console.log('');
  console.log('分解结果：');
  console.log(`  • 结构效应: ${dec.mix?.toFixed(1) || 'N/A'}pt`);
  console.log(`  • 新留存效应: ${dec.newR?.toFixed(1) || 'N/A'}pt`);
  console.log(`  • 老留存效应: ${dec.oldR?.toFixed(1) || 'N/A'}pt`);
  
  const effects = [
    { key: '结构', val: dec.mix },
    { key: '新留存', val: dec.newR },
    { key: '老留存', val: dec.oldR }
  ].filter(e => e.val != null);
  
  if (effects.length > 0) {
    effects.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    const dom = effects[0];
    console.log(`  • 主导因素: ${dom.key} (${dom.val >= 0 ? '+' : ''}${dom.val?.toFixed(1)}pt)`);
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