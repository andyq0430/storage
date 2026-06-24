#!/usr/bin/env node
/**
 * vv-active-decomposition 数据筛选脚本
 * 自动筛选近N日活跃数据（以最新日期为准）
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
console.log('   vv-active-decomposition 数据筛选');
console.log(`   自动提取近${DAYS}日数据`);
console.log('========================================\n');

if (!fs.existsSync(DATA_FILE)) {
  console.error('❌ raw_data.json 不存在');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// 合并板块和使用时长数据
function mergeData(banKuai, shiYong) {
  const merged = [];
  const shiYongMap = {};
  (shiYong || []).forEach(s => { shiYongMap[s.date] = s.avgDuration; });
  
  (banKuai || []).forEach(b => {
    const renJunShiChang = shiYongMap[b.date];
    if (renJunShiChang && b.jinFang > 0) {
      merged.push({
        date: b.date,
        dau: b.dau,
        jinFang: b.jinFang,
        renJunShiChang: renJunShiChang,
        totalShiChang: b.jinFang * renJunShiChang
      });
    }
  });
  
  return merged.sort((a, b) => a.date < b.date ? -1 : 1);
}

const mergedData = mergeData(raw.banKuaiData, raw.shiYongData);

if (mergedData.length === 0) {
  console.error('❌ 没有数据可筛选');
  process.exit(1);
}

// 获取所有日期并排序（降序）
const allDates = mergedData.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

console.log(`📅 数据总览:`);
console.log(`   - 总天数: ${mergedData.length}`);
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
const filteredData = mergedData.filter(d => recentDays.includes(d.date));

console.log(`   实际天数: ${filteredData.length}天`);

if (filteredData.length === 0) {
  console.error('❌ 筛选后没有数据');
  process.exit(1);
}

// 排除进房人数为0的数据（数据未出）
const validData = filteredData.filter(d => d.jinFang > 0 && d.totalShiChang > 0);
console.log(`   有效天数: ${validData.length}天（排除数据未出）`);

if (validData.length === 0) {
  console.warn('⚠️  所有数据进房人数为0，保留原始筛选结果');
  validData.push(...filteredData);
}

// 计算近N日平均值和趋势
const avgData = {
  avgJinFang: validData.reduce((sum, d) => sum + d.jinFang, 0) / validData.length,
  avgDuration: validData.reduce((sum, d) => sum + d.renJunShiChang, 0) / validData.length,
  avgTotal: validData.reduce((sum, d) => sum + d.totalShiChang, 0) / validData.length,
  avgDAU: validData.reduce((sum, d) => sum + d.dau, 0) / validData.length,
  totalJinFang: validData.reduce((sum, d) => sum + d.jinFang, 0),
  totalDuration: validData.reduce((sum, d) => sum + d.totalShiChang, 0)
};

// 计算趋势（首日 vs 末日）
const firstDay = validData[0];
const lastDay = validData[validData.length - 1];
const trend = {
  jinFangChange: ((lastDay.jinFang - firstDay.jinFang) / firstDay.jinFang * 100).toFixed(2),
  durationChange: ((lastDay.renJunShiChang - firstDay.renJunShiChang) / firstDay.renJunShiChang * 100).toFixed(2),
  totalChange: ((lastDay.totalShiChang - firstDay.totalShiChang) / firstDay.totalShiChang * 100).toFixed(2)
};

// 更新原始数据文件（只筛选近N日）
const recentBanKuai = raw.banKuaiData.filter(b => validData.map(d => d.date).includes(b.date));
const recentShiYong = raw.shiYongData.filter(s => validData.map(d => d.date).includes(s.date));

raw.banKuaiData = recentBanKuai;
raw.shiYongData = recentShiYong;
raw.meta = raw.meta || {};
raw.meta.filteredAt = new Date().toISOString();
raw.meta.filterDays = DAYS;
raw.meta.dateRange = {
  start: validData[0].date,
  end: validData[validData.length - 1].date,
  description: `自动提取近${validData.length}日数据（以${latestDate}为准）`
};
raw.summary = {
  avgJinFang: avgData.avgJinFang.toFixed(0),
  avgDuration: avgData.avgDuration.toFixed(2),
  avgTotal: avgData.avgTotal.toFixed(0),
  avgDAU: avgData.avgDAU.toFixed(0),
  trend: trend
};

// 保存更新后的数据
fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, 2));

console.log('\n✅ 数据筛选完成');
console.log(`📊 保存 ${validData.length} 条有效数据`);
console.log(`📅 最终日期范围: ${validData[0].date} ~ ${validData[validData.length - 1].date}`);
console.log(`\n📈 近${validData.length}日平均指标:`);
console.log(`   平均进房人数: ${avgData.avgJinFang.toFixed(0)}人`);
console.log(`   平均人均时长: ${avgData.avgDuration.toFixed(2)}分钟`);
console.log(`   平均总时长: ${(avgData.avgTotal / 10000).toFixed(2)}万分钟`);
console.log(`   平均DAU: ${avgData.avgDAU.toFixed(0)}人`);
console.log(`\n📊 趋势分析（首日 vs 末日）:`);
console.log(`   进房人数变化: ${trend.jinFangChange}%`);
console.log(`   人均时长变化: ${trend.durationChange}%`);
console.log(`   总时长变化: ${trend.totalChange}%`);
console.log(`\n📄 文件已更新: ${DATA_FILE}`);