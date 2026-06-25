#!/usr/bin/env node
/**
 * run-platform-diagnosis.mjs — 平台经营体检主入口脚本（v2.3）
 * 
 * 用法：
 *   node run-platform-diagnosis.mjs               # 完整流程（诊断→报告）
 *   node run-platform-diagnosis.mjs --skip-diag   # 仅生成报告（不重新诊断）
 *   node run-platform-diagnosis.mjs --verbose     # 详细输出
 * 
 * 流程：
 *   1. 检查 platform_raw.json 是否存在
 *   2. 四维交叉诊断（cross-diagnosis.mjs）
 *   3. 生成HTML报告（generate-report.mjs）
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
const skipDiag = args.includes('--skip-diag');
const verbose = args.includes('--verbose');

console.log('━'.repeat(70));
console.log('平台经营体检 v2.3');
console.log('━'.repeat(70));
console.log('');

// 步骤1：检查数据文件
const rawPath = path.join(SKILL_DIR, 'platform_raw.json');
const diagPath = path.join(SKILL_DIR, 'cross_diagnosis.json');
const reportPath = path.join(SKILL_DIR, 'report', 'index.html');

if (!fs.existsSync(rawPath)) {
  console.log('❌ platform_raw.json 不存在');
  console.log('');
  console.log('请先使用 browser tool 提取数据：');
  console.log('  1. 打开产品数据页面（全平台）');
  console.log('  2. 使用 browser tool 提取四维数据');
  console.log('  3. 或运行: node scripts/extract-platform-browser.mjs');
  console.log('');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// 检查数据有效性
const platforms = rawData.platforms || rawData.platformDetails || rawData.rawData?.revenue || [];
if (platforms.length === 0) {
  console.log('❌ platform_raw.json 无有效平台数据');
  console.log('   请确保浏览器提取成功');
  process.exit(1);
}

console.log(`✅ 数据文件存在: ${rawPath}`);
console.log(`   平台数量: ${platforms.length}`);
console.log(`   提取时间: ${rawData.meta?.extractedAt || '未知'}`);
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