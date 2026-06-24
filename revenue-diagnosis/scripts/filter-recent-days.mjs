#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '..', 'raw_data.json');

const args = process.argv.slice(2);
const DAYS = parseInt(args[0]) || 7;

console.log('========================================');
console.log(' revenue-diagnosis 数据筛选');
console.log(` 自动提取近${DAYS}日数据`);
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

const allDates = raw.days.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

console.log(`📅 数据总览:`);
console.log(` - 总天数: ${allDates.length}`);
console.log(` - 最新日期: ${latestDate}`);
console.log(` - 最早日期: ${allDates[allDates.length - 1]}`);

const recentDays = [];
for (let i = 0; i < DAYS; i++) {
 const date = new Date(latestDateObj);
 date.setDate(date.getDate() - i);
 recentDays.push(date.toISOString().split('T')[0]);
}

console.log(`\n📊 篮选范围: ${recentDays[recentDays.length - 1]} ~ ${recentDays[0]}`);
console.log(` 目标天数: ${DAYS}天`);

const filteredDays = raw.days.filter(d => recentDays.includes(d.date));
console.log(` 实际天数: ${filteredDays.length}天`);

if (filteredDays.length === 0) {
 console.error('❌ 篮选后没有数据');
 process.exit(1);
}

const validDays = filteredDays.filter(d => d.totR > 0);
console.log(` 有效天数: ${validDays.length}天（排除数据未出）`);

if (validDays.length === 0) {
 console.warn('⚠️ 所有数据营收为0，保留原始筛选结果');
 validDays.push(...filteredDays);
}

const avgData = {
 avgRevenue: validDays.reduce((sum, d) => sum + d.totR, 0) / validDays.length,
 avgUsers: validDays.reduce((sum, d) => sum + d.totPU, 0) / validDays.length,
 avgARPPU: validDays.reduce((sum, d) => sum + (d.totR / d.totPU), 0) / validDays.length,
 totalRevenue: validDays.reduce((sum, d) => sum + d.totR, 0),
 totalUsers: validDays.reduce((sum, d) => sum + d.totPU, 0)
};

const firstDay = validDays[validDays.length - 1];
const lastDay = validDays[0];
const trend = {
 revenueChange: ((lastDay.totR - firstDay.totR) / firstDay.totR * 100).toFixed(2),
 usersChange: ((lastDay.totPU - firstDay.totPU) / firstDay.totPU * 100).toFixed(2),
 ARPPUChange: (((lastDay.totR / lastDay.totPU) - (firstDay.totR / firstDay.totPU)) / (firstDay.totR / firstDay.totPU) * 100).toFixed(2)
};

raw.days = validDays;
raw.meta = raw.meta || {};
raw.meta.filteredAt = new Date().toISOString();
raw.meta.filterDays = DAYS;
raw.meta.dateRange = {
 start: recentDays[recentDays.length - 1],
 end: recentDays[0],
 description: `自动提取近${DAYS}日数据（以${latestDate}为准）`
};
raw.summary = {
 avgRevenue: avgData.avgRevenue.toFixed(2),
 avgUsers: avgData.avgUsers.toFixed(0),
 avgARPPU: avgData.avgARPPU.toFixed(2),
 totalRevenue: avgData.totalRevenue.toFixed(2),
 totalUsers: avgData.totalUsers,
 trend: trend
};

fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, 2));

console.log('\n✅ 数据筛选完成');
console.log(`📊 保存 ${validDays.length} 条有效数据`);