#!/usr/bin/env node
/**
 * revenue-diagnosis v3.3 执行脚本
 * 
 * 功能：
 * 1. 数据新鲜度检查（超过1天视为过期）
 * 2. 过期时返回退出码10，触发Agent自动浏览器提取
 * 3. LMDI三因子分解
 * 4. 集中度分析（基尼系数或CR3/CR10/HHI fallback）
 * 5. 生成HTML报告
 * 
 * 用法：
 * node run-diagnosis.mjs              # 正常执行（检查新鲜度）
 * node run-diagnosis.mjs --force      # 强制使用过期数据
 * node run-diagnosis.mjs --verbose    # 详细输出
 * 
 * 返回码：
 * 0  - 成功完成
 * 10 - 数据过期，需要浏览器提取
 * 1  - 其他错误
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SKILL_DIR, 'report');
const RAW_DATA_FILE = path.join(SKILL_DIR, 'raw_data.json');

// 解析命令行参数
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const forceMode = args.includes('--force');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('VV渠道营收诊断 v3.3');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================
// 步骤1：数据新鲜度检查
// ============================================================
console.log('📅 步骤1：数据新鲜度检查');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function checkDataFreshness() {
  // 读取raw_data.json
  if (!fs.existsSync(RAW_DATA_FILE)) {
    return { fresh: false, reason: 'raw_data.json 不存在', maxDate: null };
  }
  
  const rawData = JSON.parse(fs.readFileSync(RAW_DATA_FILE, 'utf-8'));
  const days = rawData.days || [];
  
  if (days.length === 0) {
    return { fresh: false, reason: 'days数组为空', maxDate: null };
  }
  
  // 获取最新日期
  const dates = days
    .map(d => d.date)
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  
  if (dates.length === 0) {
    return { fresh: false, reason: '无有效日期数据', maxDate: null };
  }
  
  const maxDate = dates[0];
  
  // 计算日期差
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const maxDateObj = new Date(maxDate + 'T00:00:00');
  const diffDays = Math.floor((today - maxDateObj) / (1000 * 60 * 60 * 24));
  
  // 判断新鲜度（超过1天视为过期）
  const isFresh = diffDays <= 1;
  
  return {
    fresh: isFresh,
    reason: isFresh ? '数据新鲜' : `数据已过期${diffDays}天`,
    maxDate,
    diffDays,
    dayCount: days.length
  };
}

const freshness = checkDataFreshness();
const today = new Date().toISOString().slice(0, 10);

console.log(`📅 当前日期: ${today}`);
console.log(`📊 数据最新日期: ${freshness.maxDate || '无数据'}`);

if (freshness.fresh) {
  console.log('✅ 数据新鲜度: OK');
  console.log(`   数据天数: ${freshness.dayCount}`);
} else {
  console.log(`❌ 数据新鲜度: 过期 (${freshness.reason})`);
  if (verbose) {
    console.log(`   详细: ${freshness.diffDays}天前`);
  }
}

// 强制模式检查
if (!freshness.fresh && !forceMode) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  数据已过期，需要提取最新数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n返回码: 10 (触发浏览器提取)');
  console.log('\n如需强制使用过期数据，请使用 --force 参数');
  process.exit(10);
}

if (forceMode && !freshness.fresh) {
  console.log('⚠️  强制模式：使用过期数据继续执行');
}

console.log('');

// ============================================================
// 步骤2：加载数据
// ============================================================
console.log('📈 步骤2：加载数据');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 确保输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadData() {
  const rawFile = path.join(SKILL_DIR, 'raw_data.json');
  if (!fs.existsSync(rawFile)) return null;
  return JSON.parse(fs.readFileSync(rawFile, 'utf-8'));
}

// LMDI三因子分解
function lmdiDecompose(R0, R1, U0, U1, p0, p1) {
  if (R0 <= 0 || R1 <= 0) return null;
  
  const L = (R1 - R0) / Math.log(R1 / R0);
  const deltaR = R1 - R0;
  
  // 用户量效应
  const userEffect = L * Math.log(U1 / U0);
  
  // 渗透率效应
  const penetrationEffect = L * Math.log(p1 / p0);
  
  // ARPPU效应
  const ARPPU0 = R0 / U0;
  const ARPPU1 = R1 / U1;
  const arppuEffect = L * Math.log(ARPPU1 / ARPPU0);
  
  const userPct = Math.abs(userEffect / deltaR * 100);
  const penetrationPct = Math.abs(penetrationEffect / deltaR * 100);
  const arppuPct = Math.abs(arppuEffect / deltaR * 100);
  
  return {
    deltaR,
    userEffect,
    userPct,
    penetrationEffect,
    penetrationPct,
    arppuEffect,
    arppuPct
  };
}

// 基尼系数计算（从付费分档数据）
function calculateGini(tiers) {
  if (!tiers || tiers.length === 0) return null;
  
  let totalAmount = 0;
  let totalUsers = 0;
  
  tiers.forEach(tier => {
    totalAmount += tier.amt || tier.amount || 0;
    totalUsers += tier.cnt || tier.count || 0;
  });
  
  if (totalAmount === 0 || totalUsers === 0) return null;
  
  const sortedTiers = [...tiers].sort((a, b) => (a.amt || a.amount) - (b.amt || b.amount));
  let cumAmount = 0;
  let giniSum = 0;
  
  sortedTiers.forEach((tier, i) => {
    const prevAmount = cumAmount;
    cumAmount += tier.amt || tier.amount || 0;
    const proportion = (tier.cnt || tier.count || 0) / totalUsers;
    giniSum += proportion * (prevAmount + cumAmount);
  });
  
  const gini = 1 - giniSum / (2 * totalAmount);
  return Math.min(1, Math.max(0, gini));
}

// 集中度指标计算（从TOP频道数据）
function calculateConcentration(top) {
  if (!top || top.length === 0) return { cr3: 0, cr10: 0, hhi: 0, available: false };
  
  const shares = top.map(t => (t.share || 0)).sort((a, b) => b - a);
  
  const cr3 = shares.slice(0, 3).reduce((s, v) => s + v, 0);
  const cr10 = shares.slice(0, 10).reduce((s, v) => s + v, 0);
  
  const hhi = shares.reduce((s, v) => s + Math.pow(v / 100, 2), 0) * 10000;
  
  return {
    cr3: Math.round(cr3 * 100) / 100,
    cr10: Math.round(cr10 * 100) / 100,
    hhi: Math.round(hhi * 100) / 100,
    available: true,
    topCount: top.length
  };
}

// 综合集中度评估
function evaluateConcentration(tiers, top) {
  const gini = calculateGini(tiers);
  const conc = calculateConcentration(top);
  
  if (gini !== null) {
    return {
      gini,
      giniLevel: gini < 0.45 ? 'healthy' : gini < 0.6 ? 'warning' : 'danger',
      giniLabel: gini < 0.45 ? '较广基（健康）' : gini < 0.6 ? '中等集中（需关注）' : '高度集中（鲸鱼依赖风险）',
      source: 'tiers',
      conc
    };
  }
  
  const { hhi } = conc;
  let level, label;
  if (hhi < 100) {
    level = 'healthy'; label = '竞争充分（健康）';
  } else if (hhi < 1500) {
    level = 'warning'; label = '适度集中（需关注）';
  } else {
    level = 'danger'; label = '高度集中（依赖风险）';
  }
  
  return {
    gini: null,
    giniLevel: level,
    giniLabel: label,
    source: 'top',
    conc
  };
}

const data = loadData();

if (!data || !data.days || data.days.length < 2) {
  console.log('❌ 数据加载失败或数据不足');
  process.exit(1);
}

const days = data.days.sort((a, b) => a.date < b.date ? -1 : 1);
const periodA = days[0];
const periodB = days[days.length - 1];

console.log('✅ 数据加载成功');
console.log(`   数据期间: ${periodA.date} ~ ${periodB.date}`);
console.log(`   数据天数: ${days.length}`);

// ============================================================
// 步骤3：LMDI分解
// ============================================================
console.log('\n📈 步骤3：LMDI三因子分解');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const decomposition = lmdiDecompose(
  periodA.totR, periodB.totR,
  periodA.totPU, periodB.totPU,
  periodA.totp, periodB.totp
);

if (!decomposition) {
  console.log('❌ LMDI计算失败');
  process.exit(1);
}

console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   LMDI三因子分解结果');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   营收变化: ${decomposition.deltaR >= 0 ? '+' : ''}¥${decomposition.deltaR.toLocaleString()}`);
console.log(`   用户量效应: ${decomposition.userPct.toFixed(1)}%`);
console.log(`   渗透率效应: ${decomposition.penetrationPct.toFixed(1)}%`);
console.log(`   ARPPU效应: ${decomposition.arppuPct.toFixed(1)}%`);

// ============================================================
// 步骤4：集中度分析
// ============================================================
console.log('\n📊 步骤4：集中度分析');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const evaluation = evaluateConcentration(data.tiers || [], data.top || []);
console.log(`   数据源: ${evaluation.source === 'tiers' ? '付费分档' : 'TOP频道'}`);
if (evaluation.gini !== null) {
  console.log(`   基尼系数: ${evaluation.gini.toFixed(3)}`);
} else {
  console.log(`   CR3: ${evaluation.conc.cr3}%`);
  console.log(`   CR10: ${evaluation.conc.cr10}%`);
  console.log(`   HHI: ${evaluation.conc.hhi}`);
}
console.log(`   判定: ${evaluation.giniLabel}`);

// ============================================================
// 步骤5：生成HTML报告
// ============================================================
console.log('\n📄 步骤5：生成HTML报告');

const results = {
  meta: {
    stamp: new Date().toISOString(),
    source: 'vv/营收',
    period: `${periodA.date} ~ ${periodB.date}`
  },
  periodA,
  periodB,
  decomposition,
  days,
  tiers: data.tiers || [],
  top: data.top || [],
  evaluation
};

// 生成HTML（复用原有逻辑）
const html = generateHTML(results);
const htmlFile = path.join(OUTPUT_DIR, 'index.html');
fs.writeFileSync(htmlFile, html);

// 保存JSON
const jsonFile = path.join(SKILL_DIR, 'results.json');
fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));

console.log('   ✅ HTML报告已生成: ' + htmlFile);

// ============================================================
// 输出摘要
// ============================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ 营收诊断完成！');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('输出文件：');
console.log('  • raw_data.json    - 原始数据');
console.log('  • results.json     - 分解结果');
console.log('  • report/index.html - HTML报告\n');

console.log('诊断结果：');
console.log(`  • 数据期间: ${periodA.date} ~ ${periodB.date}`);
console.log(`  • 营收变化: ${decomposition.deltaR >= 0 ? '+' : ''}¥${Math.abs(decomposition.deltaR).toLocaleString()}`);
console.log(`  • 用户量效应: ${decomposition.userPct.toFixed(1)}%`);
console.log(`  • ARPPU效应: ${decomposition.arppuPct.toFixed(1)}%`);

// 判断主导因素
const dominant = decomposition.userPct > decomposition.arppuPct ? '用户量' : 'ARPPU';
console.log(`  • 主导因素: ${dominant} (${Math.max(decomposition.userPct, decomposition.arppuPct).toFixed(1)}%)`);

// 集中度
if (evaluation.gini !== null) {
  console.log(`  • 基尼系数: ${evaluation.gini.toFixed(3)} (${evaluation.giniLabel})`);
} else {
  console.log(`  • HHI指数: ${evaluation.conc.hhi} (${evaluation.giniLabel})`);
}

process.exit(0);

// ============================================================
// HTML生成函数
// ============================================================
function generateHTML(results) {
  const { meta, periodA, periodB, decomposition, days, tiers, top, evaluation } = results;
  const { gini, giniLevel, giniLabel, source: concSource, conc } = evaluation;
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VV渠道营收体检诊断报告</title>
<style>
${getStyles()}
</style>
</head>
<body>
<div class="container">
<header class="header">
<h1>VV渠道营收体检诊断报告</h1>
<div class="meta">数据期间：${periodA.date} ~ ${periodB.date} | 生成时间：${new Date().toLocaleString('zh-CN')} | 模型：LMDI三因子分解</div>
<div class="version-badge">v3.3</div>
</header>

<div class="tabs">
<button class="tab active" onclick="showTab('overview')">概览</button>
<button class="tab" onclick="showTab('lmdi')">LMDI分解</button>
<button class="tab" onclick="showTab('gini')">集中度</button>
<button class="tab" onclick="showTab('action')">行动方案</button>
<button class="tab" onclick="showTab('kpi')">KPI看板</button>
</div>

<div id="overview" class="tab-content active">
<div class="metrics-grid">
<div class="metric-card"><div class="label">营收变化</div><div class="value">${decomposition.deltaR >= 0 ? '+' : ''}${((decomposition.deltaR / periodA.totR) * 100).toFixed(2)}%</div><div class="change ${decomposition.deltaR >= 0 ? 'up' : 'down'}">${decomposition.deltaR >= 0 ? '↑' : '↓'} ¥${Math.abs(decomposition.deltaR).toLocaleString()}</div></div>
<div class="metric-card"><div class="label">用户量效应</div><div class="value">${decomposition.userPct.toFixed(1)}%</div><div class="change neutral">贡献占比</div></div>
<div class="metric-card highlight"><div class="label">${decomposition.arppuPct > decomposition.userPct ? 'ARPPU效应' : '用户量效应'}</div><div class="value">${Math.max(decomposition.arppuPct, decomposition.userPct).toFixed(1)}%</div><div class="change highlight">主导因素</div></div>
<div class="metric-card"><div class="label">${concSource === 'tiers' ? '基尼系数' : 'HHI指数'}</div><div class="value">${concSource === 'tiers' ? gini.toFixed(3) : conc.hhi.toFixed(1)}</div><div class="change ${giniLevel}">${giniLabel}</div></div>
</div>

<div class="card">
<h2>核心洞察</h2>
<div class="insight-box">
<h3>营收变化归因</h3>
<p>营收${decomposition.deltaR >= 0 ? '增加' : '减少'}的主要原因：<strong>${decomposition.arppuPct > decomposition.userPct ? 'ARPPU变化' : '用户量变化'}</strong>（贡献${Math.max(decomposition.arppuPct, decomposition.userPct).toFixed(1)}%）</p>
<p class="hint">诊断：${decomposition.deltaR >= 0 ? '营收增长' : '营收下滑'}，需关注${decomposition.arppuPct > 50 ? '人均付费深度' : '付费用户规模'}。</p>
</div>
</div>
</div>

<div id="lmdi" class="tab-content">
<div class="card">
<h2>LMDI三因子分解</h2>
<table>
<thead><tr><th>指标</th><th>上期(${periodA.date})</th><th>本期(${periodB.date})</th><th>变化</th></tr></thead>
<tbody>
<tr><td>总营收</td><td>¥${periodA.totR.toLocaleString()}</td><td>¥${periodB.totR.toLocaleString()}</td><td class="${decomposition.deltaR >= 0 ? 'pos' : 'neg'}">${decomposition.deltaR >= 0 ? '+' : ''}¥${decomposition.deltaR.toLocaleString()}</td></tr>
<tr><td>付费用户数</td><td>${periodA.totPU.toLocaleString()}</td><td>${periodB.totPU.toLocaleString()}</td><td class="${periodB.totPU >= periodA.totPU ? 'pos' : 'neg'}">${periodB.totPU >= periodA.totPU ? '+' : ''}${periodB.totPU - periodA.totPU}</td></tr>
<tr><td>付费渗透率</td><td>${periodA.totp.toFixed(2)}%</td><td>${periodB.totp.toFixed(2)}%</td><td class="${periodB.totp >= periodA.totp ? 'pos' : 'neg'}">${periodB.totp >= periodA.totp ? '+' : ''}${(periodB.totp - periodA.totp).toFixed(2)}pp</td></tr>
</tbody>
</table>

<h3>分解贡献</h3>
<div class="decomposition-grid">
<div class="dec-item"><div class="dec-label">总营收变化</div><div class="dec-value">${decomposition.deltaR >= 0 ? '+' : ''}¥${Math.abs(decomposition.deltaR).toLocaleString()}</div><div class="dec-pct">${decomposition.deltaR >= 0 ? '+' : ''}${((decomposition.deltaR / periodA.totR) * 100).toFixed(2)}%</div></div>
<div class="dec-item"><div class="dec-label">用户量效应</div><div class="dec-value">${decomposition.userEffect >= 0 ? '+' : ''}¥${Math.abs(decomposition.userEffect).toLocaleString()}</div><div class="dec-pct">${decomposition.userPct.toFixed(1)}%</div></div>
<div class="dec-item"><div class="dec-label">渗透率效应</div><div class="dec-value">${decomposition.penetrationEffect >= 0 ? '+' : ''}¥${Math.abs(decomposition.penetrationEffect).toLocaleString()}</div><div class="dec-pct">${decomposition.penetrationPct.toFixed(1)}%</div></div>
<div class="dec-item highlight"><div class="dec-label">ARPPU效应</div><div class="dec-value">${decomposition.arppuEffect >= 0 ? '+' : ''}¥${Math.abs(decomposition.arppuEffect).toLocaleString()}</div><div class="dec-pct highlight">${decomposition.arppuPct.toFixed(1)}%</div></div>
</div>
</div>
</div>

<div id="gini" class="tab-content">
<div class="card">
<h2>收入集中度分析</h2>
${concSource === 'tiers' ? `
<div class="gini-gauge ${giniLevel}">
<div class="gini-value">${gini.toFixed(3)}</div>
<div class="gini-label">${giniLabel}</div>
</div>
<h3>付费分档分布</h3>
<table>
<thead><tr><th>档位</th><th>用户数</th><th>付费金额</th><th>占比</th></tr></thead>
<tbody>
${(tiers || []).map(tier => '<tr><td>' + (tier.name || tier.tier) + '</td><td>' + (tier.cnt || tier.count || 0).toLocaleString() + '</td><td>¥' + (tier.amt || tier.amount || 0).toLocaleString() + '</td><td>' + (((tier.amt || tier.amount || 0) / (periodB.totR || 1)) * 100).toFixed(1) + '%</td></tr>').join('')}
</tbody>
</table>
` : `
<div class="gini-gauge ${giniLevel}">
<div class="gini-value">${conc.hhi.toFixed(1)}</div>
<div class="gini-label">${giniLabel}</div>
</div>
<div class="concentration-metrics">
<div class="conc-card"><div class="conc-label">CR3（前三集中度）</div><div class="conc-value ${conc.cr3 < 10 ? 'healthy' : conc.cr3 < 20 ? 'warning' : 'danger'}">${conc.cr3.toFixed(2)}%</div><div class="conc-threshold">健康阈值 &lt; 10%</div></div>
<div class="conc-card"><div class="conc-label">CR10（前十集中度）</div><div class="conc-value ${conc.cr10 < 20 ? 'healthy' : conc.cr10 < 40 ? 'warning' : 'danger'}">${conc.cr10.toFixed(2)}%</div><div class="conc-threshold">健康阈值 &lt; 20%</div></div>
<div class="conc-card"><div class="conc-label">HHI指数</div><div class="conc-value ${conc.hhi < 100 ? 'healthy' : conc.hhi < 1500 ? 'warning' : 'danger'}">${conc.hhi.toFixed(1)}</div><div class="conc-threshold">健康阈值 &lt; 100</div></div>
</div>
<h3>TOP频道营收分布</h3>
<table>
<thead><tr><th>排名</th><th>频道ID</th><th>营收</th><th>占比</th></tr></thead>
<tbody>
${(top || []).map((ch, i) => '<tr><td>' + (i + 1) + '</td><td>' + ch.channelId + '</td><td>¥' + (ch.revenue || 0).toLocaleString() + '</td><td>' + (ch.share || 0).toFixed(2) + '%</td></tr>').join('')}
</tbody>
</table>
<div class="note-box">⚠️ 付费分档数据不可用，集中度指标基于TOP频道数据计算。HHI仅统计已知的${conc.topCount}个频道，实际HHI可能更高。</div>
`}
</div>
</div>

<div id="action" class="tab-content">
<div class="card">
<h2>7天行动计划</h2>
<div class="action-box">
<h3>P0 - 守大R（运营组，D1-D7）</h3>
<ul>
<li>大R识别分层（Top 100用户）</li>
<li>流失预警模型（ARPPU连续下滑预警）</li>
<li>大R关怀活动（专属客服+定制福利）</li>
</ul>
</div>
<div class="action-box">
<h3>P1 - 修复新用户变现（产品组，D1-D7）</h3>
<ul>
<li>渗透率根因诊断</li>
<li>A/B测试首充礼包优化</li>
<li>新人引导流程优化</li>
</ul>
</div>
<div class="action-box">
<h3>P2 - 培养中R（运营组，D2-D7）</h3>
<ul>
<li>中R分层定义（101-500元档位）</li>
<li>阶梯充值活动设计</li>
<li>中R专属权益推出</li>
</ul>
</div>
</div>
</div>

<div id="kpi" class="tab-content">
<div class="card">
<h2>核心KPI看板</h2>
<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-label">总营收（本期）</div><div class="kpi-value">¥${periodB.totR.toLocaleString()}</div><div class="kpi-target">目标：维持或增长</div><div class="kpi-delta ${decomposition.deltaR >= 0 ? 'pos' : 'neg'}">${decomposition.deltaR >= 0 ? '↑' : '↓'} ${Math.abs((decomposition.deltaR / periodA.totR) * 100).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">付费用户数（本期）</div><div class="kpi-value">${periodB.totPU.toLocaleString()}</div><div class="kpi-target">目标：维持或增长</div><div class="kpi-delta ${periodB.totPU >= periodA.totPU ? 'pos' : 'neg'}">${periodB.totPU >= periodA.totPU ? '↑' : '↓'} ${Math.abs((periodB.totPU / periodA.totPU - 1) * 100).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">新用户渗透率</div><div class="kpi-value">${periodB.newp.toFixed(2)}%</div><div class="kpi-target">目标：24%+</div><div class="kpi-delta ${periodB.newp >= periodA.newp ? 'pos' : 'neg'}">${periodB.newp >= periodA.newp ? '↑' : '↓'} ${Math.abs(periodB.newp - periodA.newp).toFixed(2)}pp</div></div>
<div class="kpi-card"><div class="kpi-label">${concSource === 'tiers' ? '基尼系数' : 'HHI指数'}</div><div class="kpi-value">${concSource === 'tiers' ? gini.toFixed(3) : conc.hhi.toFixed(1)}</div><div class="kpi-target">目标：${concSource === 'tiers' ? '< 0.65' : '< 100'}</div><div class="kpi-level ${giniLevel}">${giniLabel}</div></div>
</div>
</div>
</div>

<footer class="footer">
<p>Powered by OpenClaw revenue-diagnosis v3.3 | LMDI三因子分解模型 | 数据新鲜度检查</p>
</footer>
</div>

<script>
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}
</script>
</body>
</html>`;
}

function getStyles() {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); color: #333; min-height: 100vh; padding: 20px; }
.container { max-width: 1400px; margin: 0 auto; }
.header { background: white; color: #333; padding: 40px; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); position: relative; }
.header h1 { font-size: 36px; margin-bottom: 12px; background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; }
.header .meta { color: #666; font-size: 14px; }
.version-badge { position: absolute; top: 20px; right: 20px; background: #E3F2FD; color: #2C6CAE; padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 2px solid #90CAF9; }
.tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
.tab { padding: 14px 24px; background: rgba(255,255,255,0.9); border: none; cursor: pointer; font-size: 14px; color: #666; border-radius: 10px; transition: all 0.3s; font-weight: 600; }
.tab:hover { transform: translateY(-2px); background: white; }
.tab.active { background: white; color: #0C6B5A; box-shadow: 0 4px 16px rgba(12,107,90,0.3); }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.card { background: white; border-radius: 16px; padding: 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.card h2 { font-size: 20px; margin-bottom: 20px; color: #333; border-left: 5px solid #0C6B5A; padding-left: 14px; }
.card h3 { font-size: 16px; margin: 24px 0 14px; color: #555; }
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; margin-bottom: 24px; }
.metric-card { background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); color: white; padding: 24px; border-radius: 14px; box-shadow: 0 6px 20px rgba(12,107,90,0.4); }
.metric-card.highlight { background: linear-gradient(135deg, #BC7314 0%, #9A5A10 100%); box-shadow: 0 6px 20px rgba(188,115,20,0.4); }
.metric-card .label { font-size: 12px; opacity: 0.9; margin-bottom: 6px; }
.metric-card .value { font-size: 32px; font-weight: 800; }
.metric-card .change { font-size: 13px; margin-top: 10px; font-weight: 600; }
.metric-card .change.up { color: #90EE90; }
.metric-card .change.down { color: #FFB6C1; }
.metric-card .change.neutral { color: #FFF; opacity: 0.8; }
.metric-card .change.highlight { color: #FFD700; font-weight: 700; }
.metric-card .change.healthy { color: #90EE90; }
.metric-card .change.warning { color: #FFD700; }
.metric-card .change.danger { color: #FFB6C1; }
.insight-box { background: #f8f9fb; border-radius: 12px; padding: 24px; border-left: 4px solid #0C6B5A; }
.insight-box h3 { margin-bottom: 12px; color: #333; font-size: 18px; }
.insight-box p { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 8px; }
.insight-box .hint { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e8eef5; color: #666; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 14px 10px; text-align: left; border-bottom: 1px solid #e8eef5; }
th { background: linear-gradient(135deg, #f8f9fb 0%, #e8eef5 100%); font-weight: 700; color: #555; font-size: 11px; text-transform: uppercase; }
tr:hover { background: #f8f9fb; }
.pos { color: #0C6B5A; font-weight: 600; }
.neg { color: #AE3E2D; font-weight: 600; }
.decomposition-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
.dec-item { background: #f8f9fb; padding: 20px; border-radius: 10px; text-align: center; }
.dec-item.highlight { border: 2px solid #BC7314; }
.dec-label { font-size: 12px; color: #666; margin-bottom: 8px; }
.dec-value { font-size: 22px; font-weight: 700; font-family: monospace; color: #333; }
.dec-pct { font-size: 14px; color: #999; margin-top: 4px; }
.dec-pct.highlight { color: #BC7314; font-weight: 700; }
.gini-gauge { text-align: center; padding: 40px 20px; margin: 30px 0; border-radius: 12px; }
.gini-gauge.healthy { background: #E8F5E9; border: 2px solid #0C6B5A; }
.gini-gauge.warning { background: #FFF9E6; border: 2px solid #BC7314; }
.gini-gauge.danger { background: #FFE5E5; border: 2px solid #AE3E2D; }
.gini-value { font-size: 48px; font-weight: 800; font-family: monospace; }
.gini-gauge.healthy .gini-value { color: #0C6B5A; }
.gini-gauge.warning .gini-value { color: #BC7314; }
.gini-gauge.danger .gini-value { color: #AE3E2D; }
.gini-label { font-size: 16px; margin-top: 10px; font-weight: 600; }
.gini-gauge.healthy .gini-label { color: #0C6B5A; }
.gini-gauge.warning .gini-label { color: #BC7314; }
.gini-gauge.danger .gini-label { color: #AE3E2D; }
.action-box { background: #f8f9fb; border-radius: 12px; padding: 24px; margin-bottom: 16px; border-left: 4px solid #0C6B5A; }
.action-box h3 { margin-bottom: 16px; color: #333; font-size: 18px; }
.action-box ul { margin-left: 18px; color: #555; font-size: 14px; }
.action-box li { margin: 8px 0; line-height: 1.6; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.kpi-card { background: #f8f9fb; border: 2px solid #e8eef5; border-radius: 12px; padding: 20px; text-align: center; }
.kpi-label { font-size: 13px; color: #666; margin-bottom: 12px; font-weight: 600; }
.kpi-value { font-size: 36px; font-weight: 800; color: #0C6B5A; margin-bottom: 8px; font-family: monospace; }
.kpi-target { font-size: 12px; color: #999; margin-bottom: 8px; }
.kpi-delta { font-size: 14px; font-weight: 600; padding: 4px 12px; border-radius: 12px; display: inline-block; }
.kpi-delta.pos { background: #E8F5E9; color: #0C6B5A; }
.kpi-delta.neg { background: #FFE5E5; color: #AE3E2D; }
.kpi-level { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 12px; display: inline-block; margin-top: 8px; }
.kpi-level.healthy { background: #E8F5E9; color: #0C6B5A; }
.kpi-level.warning { background: #FFF9E6; color: #BC7314; }
.kpi-level.danger { background: #FFE5E5; color: #AE3E2D; }
.concentration-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 24px 0; }
.conc-card { background: #f8f9fb; border-radius: 12px; padding: 20px; text-align: center; border: 2px solid #e8eef5; }
.conc-label { font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600; }
.conc-value { font-size: 28px; font-weight: 800; font-family: monospace; }
.conc-value.healthy { color: #0C6B5A; }
.conc-value.warning { color: #BC7314; }
.conc-value.danger { color: #AE3E2D; }
.conc-threshold { font-size: 11px; color: #999; margin-top: 8px; }
.note-box { background: #FFF9E6; border-left: 4px solid #BC7314; padding: 16px; margin-top: 20px; border-radius: 8px; font-size: 13px; color: #666; line-height: 1.6; }
.footer { text-align: center; padding: 24px; color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 30px; }
  `;
}
