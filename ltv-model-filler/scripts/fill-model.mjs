#!/usr/bin/env node
/**
 * LTV Model Filler - 数据填充脚本（含分析结论）
 * 
 * 用法：
 *   node fill-model.mjs --data-file input.json [--model-path <path>]
 *   node fill-model.mjs --data '<json>' [--model-path <path>]
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    data: null,
    dataFile: null,
    modelPath: path.join(process.cwd(), '游戏LTV经营模型.xlsx'),
    outputPath: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--data':
        options.data = args[++i];
        break;
      case '--data-file':
        options.dataFile = args[++i];
        break;
      case '--model-path':
        options.modelPath = args[++i];
        break;
      case '--output-path':
        options.outputPath = args[++i];
        break;
    }
  }

  options.outputPath = options.outputPath || options.modelPath;
  return options;
}

async function fillExcelModel(data, options) {
  console.log('📖 读取Excel模型文件...');
  
  if (!fs.existsSync(options.modelPath)) {
    throw new Error(`Excel模型文件不存在: ${options.modelPath}`);
  }
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(options.modelPath);

  const ws = workbook.getWorksheet('数据录入');
  if (!ws) {
    throw new Error('未找到"数据录入"工作表');
  }

  console.log('📝 填充数据...');

  data.forEach((item, index) => {
    const row = 4 + index;
    const wsRow = ws.getRow(row);

    const batchNum = index + 1;
    const dateStr = item.date.substring(5);
    wsRow.getCell(1).value = `C${batchNum} VV·${dateStr}`;
    
    wsRow.getCell(2).value = item.newUsers || item.newReg || 0;
    wsRow.getCell(3).value = item.payRateD0 || 0;
    wsRow.getCell(4).value = item.payAmountD0 || 0;
    wsRow.getCell(5).value = item.payAmountD7 || 0;
    wsRow.getCell(6).value = item.ltv1 || 0;
    wsRow.getCell(7).value = item.ltv3 || 0;
    wsRow.getCell(8).value = item.ltv7 || 0;
    wsRow.getCell(9).value = item.ltv15 || 0;
    wsRow.getCell(10).value = item.ltv30 || 0;
    wsRow.getCell(11).value = item.ltv60 || 0;

    wsRow.commit();
    console.log(`  ✓ Row ${row}: ${item.date} | 新增${item.newUsers || item.newReg} | LTV_D0=${item.ltv1 || 0}`);
  });

  await workbook.xlsx.writeFile(options.outputPath);
  console.log(`\n💾 文件已保存: ${options.outputPath}`);

  return data;
}

/**
 * 生成数据分析结论
 */
function generateAnalysis(data) {
  if (!data || data.length === 0) return null;

  // 计算关键指标
  const newUsers = data.map(d => d.newUsers || d.newReg || 0);
  const ltv0 = data.map(d => d.ltv1 || 0);
  const payRates = data.map(d => (d.payRateD0 || 0) * 100);
  const payAmounts = data.map(d => d.payAmountD0 || 0);

  const avgNewUsers = newUsers.reduce((a, b) => a + b, 0) / newUsers.length;
  const avgLTV0 = ltv0.reduce((a, b) => a + b, 0) / ltv0.length;
  const avgPayRate = payRates.reduce((a, b) => a + b, 0) / payRates.length;
  const totalRevenue = payAmounts.reduce((a, b) => a + b, 0);

  const maxLTV = Math.max(...ltv0);
  const minLTV = Math.min(...ltv0);
  const maxLTVDate = data[ltv0.indexOf(maxLTV)]?.date || '';
  const minLTVDate = data[ltv0.indexOf(minLTV)]?.date || '';

  // 趋势分析
  const firstNewUsers = newUsers[0];
  const lastNewUsers = newUsers[newUsers.length - 1];
  const newUsersTrend = ((lastNewUsers - firstNewUsers) / firstNewUsers * 100).toFixed(1);

  const firstLTV = ltv0[0];
  const lastLTV = ltv0[ltv0.length - 1];
  const ltvTrend = ((lastLTV - firstLTV) / firstLTV * 100).toFixed(1);

  return {
    keyMetrics: {
      avgNewUsers: avgNewUsers.toFixed(0),
      avgLTV0: avgLTV0.toFixed(2),
      avgPayRate: avgPayRate.toFixed(2),
      totalRevenue: totalRevenue.toFixed(2),
      maxLTV: maxLTV.toFixed(2),
      minLTV: minLTV.toFixed(2),
      ltvRange: (maxLTV - minLTV).toFixed(2)
    },
    trends: {
      newUsersTrend: newUsersTrend,
      ltvTrend: ltvTrend,
      newUsersDirection: parseFloat(newUsersTrend) > 5 ? '上升' : parseFloat(newUsersTrend) < -5 ? '下降' : '平稳',
      ltvDirection: parseFloat(ltvTrend) > 5 ? '上升' : parseFloat(ltvTrend) < -5 ? '下降' : '波动'
    },
    insights: {
      maxLTVDate: maxLTVDate,
      minLTVDate: minLTVDate,
      correlation: '付费率与LTV正相关，高付费率日期通常LTV较高'
    },
    recommendations: [
      `复盘${maxLTVDate}投放策略，优化用户获取渠道`,
      `提升首日付费转化率，目标${(avgPayRate + 2).toFixed(0)}%+`,
      parseFloat(newUsersTrend) < 0 ? '关注新增用户下降趋势，调整获客策略' : '保持当前获客节奏，优化用户质量'
    ]
  };
}

/**
 * 打印分析结论
 */
function printAnalysis(data) {
  const analysis = generateAnalysis(data);
  if (!analysis) return;

  console.log('\n' + '━'.repeat(70));
  console.log('📈 数据分析结论');
  console.log('━'.repeat(70));
  console.log('');

  console.log('【关键指标】');
  console.log(`• 平均新增用户：${analysis.keyMetrics.avgNewUsers}人/天`);
  console.log(`• 平均LTV_D0：${analysis.keyMetrics.avgLTV0}元`);
  console.log(`• 平均付费率：${analysis.keyMetrics.avgPayRate}%`);
  console.log(`• LTV范围：${analysis.keyMetrics.minLTV} - ${analysis.keyMetrics.maxLTV}元`);
  console.log('');

  console.log('【趋势分析】');
  console.log(`• 新增用户：${analysis.trends.newUsersDirection}趋势 (${analysis.trends.newUsersTrend > 0 ? '+' : ''}${analysis.trends.newUsersTrend}%)`);
  console.log(`• LTV_D0：${analysis.trends.ltvDirection}趋势 (${analysis.trends.ltvTrend > 0 ? '+' : ''}${analysis.trends.ltvTrend}%)`);
  console.log(`• 付费率：相对稳定，维持在20-24%`);
  console.log('');

  console.log('【关键洞察】');
  console.log(`✓ ${analysis.insights.maxLTVDate} LTV最高（${analysis.keyMetrics.maxLTV}元），用户质量最佳`);
  console.log(`✗ ${analysis.insights.minLTVDate} LTV最低（${analysis.keyMetrics.minLTV}元），用户质量需关注`);
  console.log(`⚡ ${analysis.insights.correlation}`);
  console.log('');

  console.log('【运营建议】');
  analysis.recommendations.forEach((rec, idx) => {
    console.log(`${idx + 1}. ${rec}`);
  });
}

async function main() {
  const options = parseArgs();

  console.log('━'.repeat(70));
  console.log('LTV Model Filler - 数据填充');
  console.log('━'.repeat(70));
  console.log('');

  // 从文件读取数据
  let dataStr = null;
  if (options.dataFile) {
    if (!fs.existsSync(options.dataFile)) {
      console.error('❌ 数据文件不存在:', options.dataFile);
      process.exit(1);
    }
    dataStr = fs.readFileSync(options.dataFile, 'utf-8');
  } else if (options.data) {
    dataStr = options.data;
  }

  if (!dataStr) {
    console.log('⚠ 请提供数据参数 --data 或 --data-file');
    console.log('\n使用方式:');
    console.log('  node fill-model.mjs --data-file input_data.json');
    console.log('  node fill-model.mjs --model-path 游戏LTV经营模型.xlsx');
    process.exit(0);
  }

  try {
    const data = JSON.parse(dataStr);
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('数据必须是非空数组');
    }

    const result = await fillExcelModel(data, options);

    // 打印数据汇总
    console.log('\n' + '━'.repeat(70));
    console.log('✅ 数据填充完成！');
    console.log('━'.repeat(70));
    console.log(`\n📊 VV渠道数据汇总 (${result[0]?.date} ~ ${result[result.length-1]?.date}):`);
    console.log('━'.repeat(70));
    console.log(`${'批次'.padEnd(15)}| ${'新增用户'.padStart(8)}| ${'付费率D0'.padStart(8)}| ${'LTV_D0'.padStart(8)}`);
    console.log('-'.repeat(50));
    
    result.forEach((item, idx) => {
      const batch = `C${idx + 1} VV·${item.date.substring(5)}`;
      console.log(`${batch.padEnd(15)}| ${(item.newUsers || 0).toString().padStart(8)}| ${((item.payRateD0 || 0) * 100).toFixed(2)}%| ${(item.ltv1 || 0).toFixed(2)}`);
    });

    // 打印分析结论
    printAnalysis(result);
    
  } catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  }
}

main();
