#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rawFile = path.join(__dirname, '..', 'raw_data.json');
const outFile = path.join(__dirname, '..', 'input_data.json');

const raw = JSON.parse(fs.readFileSync(rawFile, 'utf-8'));

// 自动筛选近7日数据（以最新日期为准）
const allDates = raw.ltvData.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

// 计算近7日日期范围（包含今天）
const recent7Days = [];
for (let i = 0; i < 7; i++) {
  const date = new Date(latestDateObj);
  date.setDate(date.getDate() - i);
  recent7Days.push(date.toISOString().split('T')[0]);
}

console.log(`📅 最新日期: ${latestDate}`);
console.log(`📊 自动提取近7日: ${recent7Days[recent7Days.length - 1]} ~ ${recent7Days[0]}`);

// 筛选近7日数据
const ltvMap = {};
raw.ltvData
  .filter(d => recent7Days.includes(d.date))
  .forEach(d => ltvMap[d.date] = d);

const qualityDataFiltered = raw.qualityData.filter(q => recent7Days.includes(q.date));

const output = qualityDataFiltered.map(q => {
  const ltv = ltvMap[q.date] || {};
  return {
    batch: `C${qualityDataFiltered.indexOf(q) + 1} VV·${q.date}`,
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
  description: `自动提取近7日数据（以${latestDate}为准）`
};

fs.writeFileSync(rawFile, JSON.stringify(raw, null, 2));
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

console.log('✅ 数据转换完成');
console.log(`📊 共 ${output.length} 条数据`);
console.log(`📅 日期范围: ${raw.dateRange.start} ~ ${raw.dateRange.end}`);
