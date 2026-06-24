#!/usr/bin/env node
/**
 * retention-diagnosis 数据筛选脚本
 * 自动筛选近N日数据（以最新日期为准）
 * 
 * 用法：node filter-recent-days.mjs [days=7]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '..', 'raw_data.json');

const args = process.argv.slice(2);
const DAYS = parseInt(args[0]) || 7;

console.log('========================================');
console.log('   retention-diagnosis 数据筛选');
console.log(`   自动提取近${DAYS}日数据`);
console.log('========================================\n');

if (!fs.existsSync(DATA_FILE)) {
  console.error('❌ raw_data.json 不存在');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

if (!raw.days || raw.days.length === 0) {
  console.error('❌ 没有数据可筛选');
  process.exit(1);
}

// 获取所有日期并排序（降序）
const allDates = raw.days.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

console.log(`📅 数据总览:`);
console.log(`   - 总天数: ${allDates.length}`);
console.log(`   - 最新日期: ${latestDate}`);
console.log(`   - 最早日期: ${allDates[allDates.length - 1]}`);

// 计算近N日日期范围
const recentDays = [];
for (let i = 0; i < DAYS; i++) {
  const date = new Date(latestDateObj);
  date.setDate(date.getDate() - i);
  recentDays.push(date.toISOString().split('T')[0]);
}

console.log(`\n📊 筛选范围: ${recentDays[recentDays.length - 1]} ~ ${recentDays[0]}`);
console.log(`   目标天数: ${DAYS}天`);

// 筛选近N日数据
const filteredDays = raw.days.filter(d => recentDays.includes(d.date));

console.log(`   实际天数: ${filteredDays.length}天`);

if (filteredDays.length === 0) {
  console.error('❌ 筛选后没有数据');
  process.exit(1);
}

// 排除留存为0的数据（数据未出）
const validDays = filteredDays.filter(d => d.nR > 0 || d.oR > 0 || d.aR > 0);
console.log(`   有效天数: ${validDays.length}天（排除数据未出）`);

if (validDays.length === 0) {
  console.warn('⚠️  所有数据留存率为0，保留原始筛选结果');
  validDays.push(...filteredDays);
}

// 更新数据
raw.days = validDays;
raw.meta = raw.meta || {};
raw.meta.filteredAt = new Date().toISOString();
raw.meta.filterDays = DAYS;
raw.meta.dateRange = {
  start: recentDays[recentDays.length - 1],
  end: recentDays[0],
  description: `自动提取近${DAYS}日数据（以${latestDate}为准）`
};

// 保存更新后的数据
fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, 2));

console.log('\n✅ 数据筛选完成');
console.log(`📊 保存 ${validDays.length} 条有效数据`);
console.log(`📅 最终日期范围: ${recentDays[recentDays.length - 1]} ~ ${recentDays[0]}`);
console.log(`\n📄 文件已更新: ${DATA_FILE}`);
