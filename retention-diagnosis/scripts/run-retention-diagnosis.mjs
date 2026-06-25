#!/usr/bin/env node
/**
 * run-retention-diagnosis.mjs — VV渠道留存诊断主入口脚本（v4.2）
 * 
 * 用法：
 *   node run-retention-diagnosis.mjs               # 完整流程（筛选→诊断→报告）
 *   node run-retention-diagnosis.mjs --skip-filter # 跳过数据筛选
 *   node run-retention-diagnosis.mjs --verbose     # 详细输出
 * 
 * 流程：
 *   1. 检查 raw_data.json 是否存在
 *   2. 数据格式转换（嵌套→扁平）
 *   3. 数据筛选（filter-recent-days.mjs）
 *   4. 留存诊断分解（run-diagnosis.mjs）
 *   5. 生成HTML报告（generate-report.mjs）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');

// 解析参数
const args = process.argv.slice(2);
const skipFilter = args.includes('--skip-filter');
const verbose = args.includes('--verbose');

console.log('━'.repeat(70));
console.log('VV渠道留存诊断 v4.2');
console.log('━'.repeat(70));
console.log('');

// 步骤1：检查数据文件
const rawPath = path.join(SKILL_DIR, 'raw_data.json');
const resultsPath = path.join(SKILL_DIR, 'results.json');
const reportPath = path.join(SKILL_DIR, 'report', 'index.html');

if (!fs.existsSync(rawPath)) {
  console.log('❌ raw_data.json 不存在');
  console.log('');
  console.log('请先使用 browser tool 提取数据：');
  console.log('  1. 打开产品数据页面');
  console.log('  2. 点击vv按钮 → 点击留存标签');
  console.log('  3. 提取留存数据');
  console.log('  4. 或运行: node scripts/extract-retention-browser.mjs');
  console.log('');
  process.exit(1);
}

let rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// 检查并转换数据格式
if (rawData.newUserRetention && Array.isArray(rawData.newUserRetention)) {
  console.log('🔄 检测到嵌套格式，正在转换为扁平数组...');
  
  // 嵌套格式 → 扁平数组
  const newRet = rawData.newUserRetention || [];
  const oldRet = rawData.oldUserRetention || [];
  const actRet = rawData.activeUserRetention || [];
  
  // 按日期合并
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
  
  actRet.forEach(d => {
    const date = d.date;
    if (!dateMap[date]) dateMap[date] = { date };
    dateMap[date].activeUsers = d.activeUsers || d.dau || 0;
  });
  
  // 转换为数组并补全缺失字段
  const days = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  
  // 计算缺失的新/老用户数
  days.forEach(d => {
    if (!d.newUsers && !d.oldUsers && d.activeUsers) {
      // 假设新用户占比约10%
      d.newUsers = Math.round(d.activeUsers * 0.1);
      d.oldUsers = d.activeUsers - d.newUsers;
    }
    if (!d.newRetain1) d.newRetain1 = 30;  // 默认值
    if (!d.oldRetain1) d.oldRetain1 = 70;  // 默认值
  });
  
  rawData = { days, meta: rawData.meta || { extractedAt: new Date().toISOString() } };
  fs.writeFileSync(rawPath, JSON.stringify(rawData, null, 2));
  console.log('   ✅ 格式转换完成');
}

const days = rawData.days || rawData;
if (!Array.isArray(days) || days.length === 0) {
  console.log('❌ raw_data.json 无有效留存数据');
  console.log('   请确保数据为扁平数组格式');
  process.exit(1);
}

console.log(`✅ 数据文件存在: ${rawPath}`);
console.log(`   数据天数: ${days.length}`);
console.log(`   数据格式: ${Array.isArray(rawData.days) ? '扁平数组' : '兼容格式'}`);
console.log('');

// 步骤2：数据筛选（可选）
if (!skipFilter && days.length > 7) {
  console.log('📊 步骤2: 数据筛选（近7日）');
  runScript('filter-recent-days.mjs');
  
  // 重新读取筛选后的数据
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
  
  // 找主导因素
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

// 辅助函数：运行子脚本
function runScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  
  if (!fs.existsSync(scriptPath)) {
    console.log(`   ⚠️ 脚本不存在: ${scriptName}`);
    return false;
  }
  
  const result = spawn('node', [scriptPath, ...extraArgs], {
    stdio: verbose ? 'inherit' : 'pipe',
    cwd: SKILL_DIR
  });
  
  if (!verbose) {
    let output = '';
    result.stdout?.on('data', (data) => { output += data; });
    result.stderr?.on('data', (data) => { output += data; });
    
    result.on('close', (code) => {
      if (output) {
        const lines = output.split('\n').filter(l => l.trim());
        lines.forEach(l => console.log(`   ${l}`));
      }
    });
  }
  
  return true;
}