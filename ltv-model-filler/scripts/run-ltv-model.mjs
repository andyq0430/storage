#!/usr/bin/env node
/**
 * run-ltv-model.mjs — LTV模型填充主入口脚本（v7.3）
 * 
 * 用法：
 *   node run-ltv-model.mjs               # 完整流程（转换→填充→生成报告）
 *   node run-ltv-model.mjs --skip-fill   # 跳过Excel填充
 *   node run-ltv-model.mjs --only-report # 仅生成HTML报告
 * 
 * 流程：
 *   1. 检查 raw_data.json 是否存在
 *   2. 数据转换（transform-data.mjs）
 *   3. Excel填充（fill-model.mjs）
 *   4. 分析计算（analyze-ltv.mjs）
 *   5. 生成HTML报告（gen-report.mjs）
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
const skipFill = args.includes('--skip-fill');
const onlyReport = args.includes('--only-report');
const verbose = args.includes('--verbose');

console.log('━'.repeat(70));
console.log('VV渠道LTV模型填充 v7.3');
console.log('━'.repeat(70));
console.log('');

// 步骤1：检查数据文件
const rawDataPath = path.join(SKILL_DIR, 'raw_data.json');
const inputDataPath = path.join(SKILL_DIR, 'input_data.json');
const resultsPath = path.join(SKILL_DIR, 'results.json');

if (!fs.existsSync(rawDataPath)) {
  console.log('❌ raw_data.json 不存在');
  console.log('');
  console.log('请先使用 browser tool 提取数据：');
  console.log('  1. node scripts/extract-ltv-browser.mjs');
  console.log('  2. 使用 browser tool 执行提取计划');
  console.log('');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));

// 检查数据有效性
if (!rawData.ltvData || rawData.ltvData.length === 0) {
  console.log('❌ raw_data.json 无有效 LTV 数据');
  console.log('   请确保浏览器提取成功');
  process.exit(1);
}

console.log(`✅ 数据文件存在: ${rawDataPath}`);
console.log(`   LTV数据: ${rawData.ltvData.length} 条`);
console.log(`   质量数据: ${rawData.qualityData?.length || 0} 条`);
console.log(`   日期范围: ${rawData.dateRange?.start || '未知'} ~ ${rawData.dateRange?.end || '未知'}`);
console.log('');

// 如果只需要生成报告
if (onlyReport) {
  if (!fs.existsSync(resultsPath)) {
    console.log('❌ results.json 不存在，无法仅生成报告');
    console.log('   请先运行完整流程');
    process.exit(1);
  }
  runScript('gen-report.mjs');
  process.exit(0);
}

// 步骤2：数据转换
console.log('📊 步骤2: 数据转换');
runScript('transform-data.mjs');

// 检查转换结果
if (!fs.existsSync(inputDataPath)) {
  console.log('❌ 数据转换失败: input_data.json 未生成');
  process.exit(1);
}

const inputData = JSON.parse(fs.readFileSync(inputDataPath, 'utf-8'));
console.log(`   ✅ 转换完成: ${inputData.length} 条数据`);
console.log('');

// 步骤3：Excel填充（可选）
if (!skipFill) {
  console.log('📝 步骤3: Excel填充');
  
  // 检查Excel模型文件
  const modelPath = path.join(SKILL_DIR, '游戏LTV经营模型.xlsx');
  if (fs.existsSync(modelPath)) {
    runScript('fill-model.mjs', ['--data-file', inputDataPath, '--model-path', modelPath]);
  } else {
    console.log('   ⚠️ Excel模型文件不存在，跳过填充');
    console.log(`   预期路径: ${modelPath}`);
  }
  console.log('');
}

// 步骤4：分析计算
console.log('📈 步骤4: LTV分析计算');
runScript('analyze-ltv.mjs', ['--data-file', inputDataPath]);

// 检查分析结果
if (!fs.existsSync(resultsPath)) {
  console.log('❌ 分析失败: results.json 未生成');
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
console.log(`  • input_data.json  - 转换后数据`);
if (!skipFill && fs.existsSync(path.join(SKILL_DIR, '游戏LTV经营模型.xlsx'))) {
  console.log(`  • 游戏LTV经营模型.xlsx - Excel模型`);
}
console.log(`  • results.json     - 分析结果`);
console.log(`  • report.html      - HTML报告`);
console.log('');

// 显示关键指标
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
if (results.summary) {
  console.log('关键指标：');
  console.log(`  • 平均新增用户: ${results.summary.avgNewUsers}`);
  console.log(`  • 平均LTV_D0: ¥${results.summary.avgLtvD0}`);
  console.log(`  • 平均付费率D0: ${(results.summary.avgPayRateD0 * 100).toFixed(2)}%`);
  console.log(`  • 平均回本倍数: ${results.summary.avgRecycleMult}×`);
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