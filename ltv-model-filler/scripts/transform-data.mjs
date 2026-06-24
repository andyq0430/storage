#!/usr/bin/env node
/**
 * transform-data.mjs — 数据转换 + 近7日筛选（v7.5）
 * 
 * 改进：
 *   - 以数据中最新日期为准，自动取近7天
 *   - 不再使用 slice 截断，而是通过日期筛选
 *   - 详细的日志输出
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rawFile = path.join(__dirname, '..', 'raw_data.json');
const outFile = path.join(__dirname, '..', 'input_data.json');

const raw = JSON.parse(fs.readFileSync(rawFile, 'utf-8'));

// 自动筛选近7日数据（以数据中的最新日期为准，不是今天）
const allDates = raw.ltvData.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

console.log(`📅 数据最新日期: ${latestDate}`);

// 计算近7日日期范围（包含最新日期）
const recent7Days = [];
for (let i = 0; i < 7; i++) {
  const date = new Date(latestDateObj);
  date.setDate(date.getDate() - i);
  recent7Days.push(date.toISOString().split('T')[0]);
}

console.log(`📊 自动筛选近7日: ${recent7Days[recent7Days.length - 1]} ~ ${recent7Days[0]}`);
console.log(`   筛选日期列表: ${recent7Days.join(', ')}`);

// 筛选近7日数据
const ltvMap = {};
const ltvFiltered = raw.ltvData.filter(d => {
  const match = recent7Days.includes(d.date);
  if (match) {
    ltvMap[d.date] = d;
    console.log(`   ✅ LTV匹配: ${d.date} (新增: ${d.newUsers})`);
  }
  return match;
});

const qualityFiltered = raw.qualityData.filter(q => {
  const match = recent7Days.includes(q.date);
  if (match) {
    console.log(`   ✅ 质量数据匹配: ${q.date} (新增: ${q.newUsers})`);
  }
  return match;
});

console.log(`📊 筛选结果: LTV ${ltvFiltered.length} 条, 质量 ${qualityFiltered.length} 条`);

// 构建输出数据（按日期升序排列）
const output = qualityFiltered.map(q => {
  const ltv = ltvMap[q.date] || {};
  return {
    batch: `C${qualityFiltered.indexOf(q) + 1} VV·${q.date}`,
    date: q.date,
    newUsers: q.newUsers,
    payRateD0: q.payRateD0 / 100,  // 付费率转为小数
    payAmountD0: q.payAmountD0,    // 新增当天付费
    payAmountD7: q.payAmountD7,    // 7日累计付费
    ltv1: ltv.ltv1 || 0,
    ltv3: ltv.ltv3 || 0,
    ltv7: ltv.ltv7 || 0,
    ltv15: ltv.ltv15 || 0,
    ltv30: ltv.ltv30 || 0,
    ltv60: ltv.ltv60 || 0
  };
}).reverse(); // 按日期升序排列

// 更新日期范围
raw.dateRange = {
  start: recent7Days[recent7Days.length - 1],
  end: recent7Days[0],
  description: `自动提取近7日数据（以${latestDate}为准）`,
  totalRawLtv: raw.ltvData.length,
  totalRawQuality: raw.qualityData.length,
  filteredLtv: ltvFiltered.length,
  filteredQuality: qualityFiltered.length
};

fs.writeFileSync(rawFile, JSON.stringify(raw, null, 2));
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

console.log('');
console.log('✅ 数据转换完成');
console.log(`📊 共 ${output.length} 条数据`);
console.log(`📅 日期范围: ${raw.dateRange.start} ~ ${raw.dateRange.end}`);
