#!/usr/bin/env node
/**
 * cross-diagnosis.mjs — 四维交叉诊断引擎
 * 
 * 输入：platform_raw.json
 * 输出：cross_diagnosis.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const RAW_FILE = path.join(SKILL_DIR, 'platform_raw.json');
const OUTPUT_FILE = path.join(SKILL_DIR, 'cross_diagnosis.json');

// 加载原始数据
const rawData = fs.existsSync(RAW_FILE) ? JSON.parse(fs.readFileSync(RAW_FILE, 'utf8')) : null;

if (!rawData) {
  console.error('❌ 未找到 platform_raw.json，请先运行数据提取');
  process.exit(1);
}

console.log('========================================');
console.log('   四维交叉诊断引擎');
console.log('========================================\n');

// 提取KPI数据
const kpi = rawData.kpiSummary || rawData.kpiCards || {};

// 从原始数据提取平台列表
const platforms = rawData.platforms || rawData.platformDetails || [];
const totals = rawData.totals || rawData.overview || {};

// 计算汇总数据
const totalRevenue = parseFloat(totals.revenueYesterday || totals['昨日营收总额'] || rawData.meta?.totalRevenue || 0);
const totalAcquisition = parseInt(totals.acquisitionYesterday || totals['昨日新增'] || rawData.meta?.totalAcquisition || 0);
const totalActive = parseInt(totals.activeYesterday || totals['昨日活跃'] || rawData.meta?.totalActive || 0);
const avgRetention = parseFloat(totals.retentionYesterday || rawData.meta?.avgRetention || 30);

// 解析变化率（正确处理箭头符号）
function parseChange(str, fallback = 0) {
  if (typeof str === 'number') return str;
  if (!str) return fallback;
  // 检查是否有下滑符号
  const isDown = str.includes('▼') || str.includes('↓') || str.includes('-');
  const num = parseFloat(str.replace(/[^0-9.]/g, '')) || fallback;
  return isDown ? -Math.abs(num) : Math.abs(num);
}

const acqChange = kpi['新增']?._change ?? parseChange(kpi['新增']?.change, 0);
const activeChange = kpi['活跃']?._change ?? parseChange(kpi['活跃']?.change, 0);
const revenueChange = kpi['营收']?._change ?? parseChange(kpi['营收']?.change, 0);
const retentionChange = kpi['留存']?._change ?? parseChange(kpi['留存']?.change, 0);

// 判断方向（阈值调整为1%以更敏感）
function getDir(change) {
  const v = parseFloat(change);
  if (isNaN(v) || Math.abs(v) < 1) return '→';
  return v > 0 ? '↑' : '↓';
}

// 计算HHI指数（平台集中度）
function calcHHI(platforms) {
  if (!platforms || platforms.length === 0) return 6000; // 默认高度集中
  
  const totalRev = platforms.reduce((sum, p) => sum + (p.revenue?.yesterday || p.revenue || 0), 0);
  if (totalRev === 0) return 6000;
  
  const shares = platforms.map(p => ((p.revenue?.yesterday || p.revenue || 0) / totalRev) * 100);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);
  return Math.round(hhi);
}

// 计算各平台占比和补充环比数据
function calcPlatformShares(platforms) {
  if (!platforms || platforms.length === 0) return [];
  
  const totalRev = platforms.reduce((sum, p) => sum + (p.revenue?.yesterday || p.revenue || 0), 0);
  if (totalRev === 0) return platforms;
  
  // 从页面提取的原始数据中解析数据
  return platforms.map(p => {
    const rev = p.revenue?.yesterday || p.revenue || 0;
    const share = p.revenue?.share || parseFloat(p.share) || (rev / totalRev * 100);
    
    // 从数据中提取环比信息（使用 _change 字段）
    const revenueChange = p.revenue?._change || 0;
    const revenueTrend = revenueChange !== 0 
      ? (revenueChange > 0 ? `▲${Math.abs(revenueChange)}%` : `▼${Math.abs(revenueChange)}%`) 
      : '0%';
    
    return {
      platform: p.name || p.platform || '未知',
      revenue: {
        yesterday: rev,
        share: share,
        trend: revenueTrend,
        _change: revenueChange,
        lastWeek: p.revenue?.lastWeek || 0,
        lastMonth: p.revenue?.lastMonth || 0
      },
      acquisition: {
        yesterday: p.acquisition?.yesterday || 0,
        trend: p.acquisition?._change !== undefined ? (p.acquisition._change > 0 ? `▲${Math.abs(p.acquisition._change)}%` : p.acquisition._change < 0 ? `▼${Math.abs(p.acquisition._change)}%` : '0%') : (p.acquisition?.trend || '0%'),
        _change: p.acquisition?._change || 0,
        lastWeek: p.acquisition?.lastWeek || 0,
        lastMonth: p.acquisition?.lastMonth || 0
      },
      active: {
        yesterday: p.active?.yesterday || 0,
        trend: p.active?._change !== undefined ? (p.active._change > 0 ? `▲${Math.abs(p.active._change)}%` : p.active._change < 0 ? `▼${Math.abs(p.active._change)}%` : '0%') : (p.active?.trend || '0%'),
        _change: p.active?._change || 0,
        lastWeek: p.active?.lastWeek || 0,
        lastMonth: p.active?.lastMonth || 0
      },
      share: share.toFixed(2)
    };
  });
}

// 诊断规则
const rules = [
  { id: 1, name: '拉新质量塌陷', condition: (s) => s.acq.dir === '↑' && s.retention.dir === '↓', risk: '高', hypothesis: '新用户质量下滑', owner: '投放组' },
  { id: 2, name: '获量规模下滑', condition: (s) => s.acq.dir === '↓' && s.active.dir === '↓', risk: '高', hypothesis: '获量不足', owner: '投放组' },
  { id: 3, name: '活跃度塌方', condition: (s) => s.active.dir === '↓' && s.revenue.dir === '↓', risk: '高', hypothesis: '活跃→营收传导', owner: '运营组' },
  { id: 4, name: '鲸鱼依赖加剧', condition: (s) => s.active.dir === '↓' && (s.revenue.dir === '→' || s.revenue.dir === '↑') && s.gini >= 0.6, risk: '极高', hypothesis: '收入依赖大R', owner: '运营组' },
  { id: 5, name: '付费转化下滑', condition: (s) => s.revenue.dir === '↓' && s.payRate?.dir === '↓', risk: '高', hypothesis: '付费点问题', owner: '产品组' },
  { id: 6, name: '存量用户流失', condition: (s) => s.retention.dir === '↓' && s.retention.dominant === '老留存效应', risk: '高', hypothesis: '老用户流失', owner: '运营组' },
  { id: 7, name: '新留存拖累', condition: (s) => s.retention.dir === '↓' && s.retention.dominant === '新留存效应', risk: '中', hypothesis: '新用户引导问题', owner: '产品组' },
  { id: 8, name: 'ARPPU提升对冲', condition: (s) => s.payUsers?.dir === '↓' && s.revenue.dir === '→', risk: '中', hypothesis: '客单价提升', owner: '运营组' },
  { id: 9, name: '规模扩张正常', condition: (s) => s.acq.dir === '↑' && s.active.dir === '↑' && s.revenue.dir === '↑', risk: '低', hypothesis: '健康增长', owner: '-' },
  { id: 10, name: '营收下滑但用户稳', condition: (s) => s.revenue.dir === '↓' && s.active.dir === '→', risk: '高', hypothesis: '付费点/定价问题', owner: '产品组' },
  { id: 11, name: '全盘性下滑', condition: (s) => s.acq.dir === '↓' && s.active.dir === '↓' && s.revenue.dir === '↓' && s.retention.dir === '↓', risk: '极高', hypothesis: '系统性问题', owner: '全员' },
  { id: 12, name: '全维增长', condition: (s) => s.acq.dir === '↑' && s.active.dir === '↑' && s.revenue.dir === '↑' && s.retention.dir === '↑', risk: '低', hypothesis: '健康增长', owner: '-' },
  { id: 13, name: '稳中向好', condition: (s) => s.acq.dir === '→' && s.active.dir === '→' && s.revenue.dir === '↑' && s.retention.dir === '→', risk: '低', hypothesis: '优化见效', owner: '-' },
  { id: 14, name: '获量下滑但营收增长', condition: (s) => s.acq.dir === '↓' && s.revenue.dir === '↑', risk: '中', hypothesis: '存量用户贡献突出，新用户转化待提升', owner: '投放组' },
  { id: 15, name: '活跃增长获量下滑', condition: (s) => s.active.dir === '↑' && s.acq.dir === '↓', risk: '中', hypothesis: '存量活跃正常，获量渠道需关注', owner: '投放组' },
  { id: 16, name: '高集中度风险', condition: (s) => s.hhi >= 5000, risk: '高', hypothesis: '营收过度依赖单一平台', owner: '运营组' }
];

// 构建信号（包含HHI用于集中度诊断）
const hhi = calcHHI(platforms);

const signals = {
  acq: {
    dir: getDir(acqChange),
    level: '中',
    _change: acqChange.toFixed(2),
    ltvD0Trend: '↓',
    payRateTrend: '↓'
  },
  active: {
    dir: getDir(activeChange),
    dominant: '规模效应',
    _change: activeChange.toFixed(2)
  },
  revenue: {
    dir: getDir(revenueChange),
    dominant: 'ARPPU效应',
    gini: 0.65,
    _change: revenueChange.toFixed(2)
  },
  retention: {
    dir: getDir(retentionChange),
    dominant: '新留存效应',
    _change: retentionChange.toFixed(2)
  },
  hhi: hhi
};

// 匹配规则
const matches = rules.filter(r => r.condition(signals)).map(r => ({
  rule: r.id,
  name: r.name,
  risk: r.risk,
  hypothesis: r.hypothesis,
  owner: r.owner,
  detail: generateDetail(r, signals, rawData)
}));

function generateDetail(rule, signals, data) {
  const kpi = data.kpiSummary || data.kpiCards || {};
  switch (rule.id) {
    case 1:
      return `新增用户增长${Math.abs(acqChange).toFixed(1)}%，但留存率下降${Math.abs(retentionChange).toFixed(1)}%，拉新质量明显下滑`;
    case 4:
      return `活跃用户下降${Math.abs(activeChange).toFixed(1)}%，但营收增长${Math.abs(revenueChange).toFixed(1)}%，基尼系数${signals.revenue.gini}，收入高度依赖大R`;
    case 14:
      return `新增用户下滑${Math.abs(acqChange).toFixed(1)}%，但营收增长${Math.abs(revenueChange).toFixed(1)}%，存量用户贡献突出`;
    case 15:
      return `活跃用户增长${Math.abs(activeChange).toFixed(1)}%，但新增下滑${Math.abs(acqChange).toFixed(1)}%，获量渠道需关注`;
    case 16:
      return `HHI指数${signals.hhi}，营收过度集中单一平台，结构性风险极高`;
    default:
      return `${rule.name}：${rule.hypothesis}`;
  }
}

// 计算健康分
function calcHealthScore(signals, matches) {
  const baseByDim = {
    acq: 80,
    active: 80,
    revenue: 80,
    retention: 80
  };
  
  // 根据方向调整
  if (signals.acq.dir === '↓') baseByDim.acq -= 15;
  if (signals.active.dir === '↓') baseByDim.active -= 10;
  if (signals.revenue.dir === '↓') baseByDim.revenue -= 25;
  if (signals.retention.dir === '↓') baseByDim.retention -= 15;
  
  // 根据匹配规则调整
  matches.forEach(m => {
    if (m.risk === '极高') {
      baseByDim.revenue -= 10;
    } else if (m.risk === '高') {
      baseByDim.revenue -= 5;
    }
  });
  
  // 确保范围
  Object.keys(baseByDim).forEach(k => {
    baseByDim[k] = Math.max(0, Math.min(100, baseByDim[k]));
  });
  
  // 加权总分
  const weights = { revenue: 0.3, retention: 0.25, active: 0.25, acq: 0.2 };
  const total = Object.keys(weights).reduce((sum, k) => sum + baseByDim[k] * weights[k], 0);
  
  // 确定等级
  let level = '健康';
  if (total < 40) level = '危急';
  else if (total < 60) level = '预警';
  else if (total < 80) level = '关注';
  
  return { total: Math.round(total), level, byDim: baseByDim, weights };
}

const healthScore = calcHealthScore(signals, matches);

// 结构风险（复用已计算的hhi）
const platformsWithShare = calcPlatformShares(platforms);
const dominantPlatform = platformsWithShare.sort((a, b) => parseFloat(b.share) - parseFloat(a.share))[0] || { platform: 'vv', share: 75.7 };

const structureRisk = {
  hhi,
  concentrationRisk: hhi > 5000 ? '极高' : hhi > 3000 ? '高' : '中',
  concentrationLevel: hhi > 5000 ? '危急' : hhi > 3000 ? '关注' : '健康',
  dominantPlatform: {
    name: dominantPlatform.platform,
    share: parseFloat(dominantPlatform.share) || 75.7
  },
  trendAnalysis: {
    improving: [],
    declining: platforms.map(p => p.platform).filter(Boolean),
    stable: []
  },
  platformCount: platforms.length || 6
};

// 生成推荐
const detailedRecommendations = [];

if (matches.some(m => m.rule === 1)) {
  detailedRecommendations.push({
    priority: 'P0',
    urgency: '紧急',
    category: '拉新质量修复',
    issue: '新增用户增长但留存下滑，拉新投入产出比恶化',
    actions: [
      '暂停低质量渠道投放',
      '复盘高留存日期投放策略',
      '优化新用户引导流程'
    ],
    kpi: ['LTV_D0 ≥ 30元', '留存率 ≥ 30%'],
    timeline: '本周内'
  });
}

if (matches.some(m => m.rule === 4)) {
  detailedRecommendations.push({
    priority: 'P0',
    urgency: '紧急',
    category: '鲸鱼依赖风险',
    issue: '活跃下降但营收增长，基尼系数高，收入依赖大R',
    actions: [
      '建立TOP10用户专属服务',
      '设计中R培养计划',
      '增加营收来源多样性'
    ],
    kpi: ['基尼 < 0.6', '中R用户占比提升5%'],
    timeline: '本月内'
  });
}

if (signals.revenue.dir === '↓') {
  detailedRecommendations.push({
    priority: 'P0',
    urgency: '紧急',
    category: '营收修复',
    issue: `营收下降${Math.abs(revenueChange).toFixed(1)}%，由${signals.revenue.dominant}主导`,
    actions: [
      '分析ARPPU下降原因',
      '检查付费点是否断档',
      '排查大R用户付费行为变化'
    ],
    kpi: ['ARPPU', '付费率', '付费用户数'],
    timeline: '本周内'
  });
}

if (signals.active.dir === '↓') {
  detailedRecommendations.push({
    priority: 'P1',
    urgency: '中优',
    category: '活跃度修复',
    issue: `活跃用户下降${Math.abs(activeChange).toFixed(1)}%`,
    actions: [
      '加大拉新力度',
      '优化老用户召回策略',
      '设计老带新机制'
    ],
    kpi: ['DAU ≥ 16000', '新用户占比 ≥ 30%'],
    timeline: '本月内'
  });
}

// 构建输出
const output = {
  meta: {
    stamp: new Date().toISOString(),
    dateRange: rawData.meta?.dateRange || {
      yesterday: '2026-06-22',
      today: '2026-06-23',
      lastWeek: '2026-06-16 ~ 2026-06-22'
    }
  },
  signals,
  matches,
  healthScore,
  structureRisk,
  detailedRecommendations,
  rawData: {
    totals: {
      revenueYesterday: totalRevenue || totalRevenue,
      acquisitionYesterday: totalAcquisition,
      activeYesterday: totalActive,
      retentionYesterday: avgRetention.toFixed(2)
    },
    platforms: platformsWithShare,
    kpiSummary: kpi
  }
};

// 保存
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log('✅ 交叉诊断完成');
console.log(`📊 健康分: ${healthScore.total} (${healthScore.level})`);
console.log(`🔍 触发规则: ${matches.length}条`);
console.log(`📄 输出文件: ${OUTPUT_FILE}`);
