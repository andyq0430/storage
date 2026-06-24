#!/usr/bin/env node
/**
 * analyze-ltv.mjs — 新增用户 LTV 诊断与行动映射
 *
 * 输入：input_data.json （transform-data.mjs 的产物，按日期正序的批次数组）
 * 输出：results.json     （分解 + 诊断 + Playbook + 甘特图 + KPI 看板基线）
 *
 * 模型恒等式（描述性归因，非因果）：
 *   新增价值 V = 新增用户数 N × 付费率 p × 客单价 ARPPU
 *   ΔV = 规模效应(N) + 转化效应(p) + 客单效应(ARPPU)   (LMDI-I 三因子，加法可加、无残差)
 *
 * 用法：
 *   node analyze-ltv.mjs                       # 默认读 ./input_data.json，无则用 demo 数据
 *   node analyze-ltv.mjs --data-file x.json    # 指定输入
 *   node analyze-ltv.mjs --cac 18.5            # 提供单用户获取成本 CAC，启用回本分析
 *   node analyze-ltv.mjs --out results.json    # 指定输出
 */

import fs from 'node:fs';

// ---------- 参数 ----------
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dataFile = getArg('--data-file', 'input_data.json');
const outFile = getArg('--out', 'results.json');
const cac = getArg('--cac', null) != null ? parseFloat(getArg('--cac')) : null;

// ---------- 工具 ----------
const num = (v) => (typeof v === 'number' ? v : parseFloat(v)) || 0;
// 把付费率统一成小数（>1 视为百分比）
const asRate = (v) => { const n = num(v); return n > 1 ? n / 100 : n; };
// 对数平均权重
const logMean = (a, b) => (a <= 0 || b <= 0) ? 0 : (Math.abs(a - b) < 1e-9 ? a : (a - b) / (Math.log(a) - Math.log(b)));

// ---------- demo 数据（无输入文件时使用，便于直接预览输出） ----------
const DEMO = [
  { batch: 'C1 VV·06-11', date: '2026-06-11', newUsers: 2405, payRateD0: 0.2120, payAmountD0: 41200, payAmountD7: 68900,
    ltv1: 18.4, ltv3: 24.1, ltv7: 28.6, ltv14: 33.0, ltv30: 38.2, ltv60: 44.1 },
  { batch: 'C2 VV·06-13', date: '2026-06-13', newUsers: 2510, payRateD0: 0.2080, payAmountD0: 39800, payAmountD7: 66100,
    ltv1: 17.6, ltv3: 23.0, ltv7: 26.3, ltv14: 30.4, ltv30: 35.1, ltv60: 40.9 },
  { batch: 'C3 VV·06-15', date: '2026-06-15', newUsers: 2640, payRateD0: 0.2240, payAmountD0: 47100, payAmountD7: 79300,
    ltv1: 19.9, ltv3: 26.0, ltv7: 30.0, ltv14: 35.2, ltv30: 41.0, ltv60: 47.8 },
  { batch: 'C4 VV·06-17', date: '2026-06-17', newUsers: 2293, payRateD0: 0.2037, payAmountD0: 45680, payAmountD7: 80120,
    ltv1: 21.3, ltv3: 28.4, ltv7: 33.1, ltv14: 39.0, ltv30: 45.6, ltv60: 53.2 },
];

// ---------- 加载数据 ----------
let raw;
try {
  raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('空数据');
  console.log(`✓ 已加载 ${dataFile}（${raw.length} 个批次）`);
} catch (e) {
  raw = DEMO;
  console.log(`⚠ 未找到/无法解析 ${dataFile}，使用内置 demo 数据（${raw.length} 个批次）`);
}

// 按日期正序
raw = [...raw].sort((a, b) => String(a.date).localeCompare(String(b.date)));

// LTV 取数：兼容 ltv7/ltvD7/ltv_d7 等写法
const ltvAt = (row, d) => {
  for (const k of [`ltv${d}`, `ltvD${d}`, `ltv_d${d}`, `LTV_D${d}`]) if (row[k] != null) return num(row[k]);
  return null;
};

// ---------- 逐批次派生指标 ----------
const rows = raw.map(r => {
  const N = num(r.newUsers);
  const p = asRate(r.payRateD0);
  const payD0 = num(r.payAmountD0);
  const ltvD0 = N > 0 ? payD0 / N : 0;                 // 人均 D0 价值
  const payingUsers = N * p;
  const arppuD0 = payingUsers > 0 ? payD0 / payingUsers : 0; // 客单价
  const ltvD60 = ltvAt(r, 60);
  const ltvD30 = ltvAt(r, 30);
  const ltvD7 = ltvAt(r, 7);
  const ltvD1 = ltvAt(r, 1);
  // 回本倍数：D60 相对 D0 的价值放大
  const recycleMult = (ltvD0 > 0 && ltvD60 != null) ? ltvD60 / ltvD0 : null;
  // 若提供 CAC，估算回本天数（首个累计 LTV ≥ CAC 的里程碑天）
  let paybackDay = null, ltvCac = null;
  if (cac != null && cac > 0) {
    ltvCac = ltvD60 != null ? +(ltvD60 / cac).toFixed(2) : null;
    const milestones = [[0, ltvD0], [1, ltvD1], [7, ltvD7], [30, ltvD30], [60, ltvD60]].filter(m => m[1] != null);
    for (const [d, v] of milestones) { if (v >= cac) { paybackDay = d; break; } }
    if (paybackDay === null && ltvD60 != null) paybackDay = '>60';
  }
  return {
    batch: r.batch || r.date, date: r.date,
    newUsers: N, payRateD0: +(p).toFixed(4), payAmountD0: payD0,
    ltvD0: +ltvD0.toFixed(2), arppuD0: +arppuD0.toFixed(2),
    ltvD1, ltvD7, ltvD30, ltvD60,
    recycleMult: recycleMult != null ? +recycleMult.toFixed(2) : null,
    ltvCac, paybackDay,
  };
});

// ---------- 关键指标汇总 ----------
const avg = (sel) => { const xs = rows.map(sel).filter(v => v != null && !isNaN(v)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
const summary = {
  batches: rows.length,
  dateRange: `${rows[0].date} → ${rows[rows.length - 1].date}`,
  avgNewUsers: Math.round(avg(r => r.newUsers)),
  avgPayRateD0: +avg(r => r.payRateD0).toFixed(4),
  avgArppuD0: +avg(r => r.arppuD0).toFixed(2),
  avgLtvD0: +avg(r => r.ltvD0).toFixed(2),
  avgLtvD60: +avg(r => r.ltvD60).toFixed(2),
  avgRecycleMult: +avg(r => r.recycleMult).toFixed(2),
  bestLtvD0: rows.reduce((m, r) => r.ltvD0 > m.ltvD0 ? r : m, rows[0]),
  worstLtvD0: rows.reduce((m, r) => r.ltvD0 < m.ltvD0 ? r : m, rows[0]),
};

// ---------- LMDI-I 三因子分解（首期 → 末期） ----------
const a = rows[0], b = rows[rows.length - 1];
const V0 = a.payAmountD0, V1 = b.payAmountD0;
const w = logMean(V1, V0);
const eN = w * Math.log((b.newUsers || 1) / (a.newUsers || 1));        // 规模效应
const eP = w * Math.log((b.payRateD0 || 1e-9) / (a.payRateD0 || 1e-9)); // 转化效应
const eA = w * Math.log((b.arppuD0 || 1e-9) / (a.arppuD0 || 1e-9));     // 客单效应
const dV = V1 - V0;
const pct = (x) => dV !== 0 ? +(x / dV * 100).toFixed(1) : 0;
const decomposition = {
  from: a.batch, to: b.batch, V0, V1, dV: +dV.toFixed(0), dVpct: V0 ? +((V1 / V0 - 1) * 100).toFixed(2) : 0,
  factors: [
    { key: 'scale', name: '新增用户 (规模)', add: +eN.toFixed(0), pct: pct(eN), mul: w ? +Math.exp(eN / w).toFixed(4) : 1 },
    { key: 'conversion', name: '付费率 (转化)', add: +eP.toFixed(0), pct: pct(eP), mul: w ? +Math.exp(eP / w).toFixed(4) : 1 },
    { key: 'arppu', name: '客单价 (深度)', add: +eA.toFixed(0), pct: pct(eA), mul: w ? +Math.exp(eA / w).toFixed(4) : 1 },
  ],
};

// ---------- 诊断主导因素 ----------
const dominant = [...decomposition.factors].sort((x, y) => Math.abs(y.add) - Math.abs(x.add))[0];
const dir = dominant.add >= 0 ? 'up' : 'down';
const dirLabel = dominant.add >= 0 ? '改善' : '恶化';

// 回本曲线健康度（独立维度）
const rm = b.recycleMult;
let curveHealth = 'unknown';
if (rm != null) curveHealth = rm >= 2.3 ? 'strong' : (rm >= 1.6 ? 'normal' : 'weak');

// ---------- Playbook 映射 ----------
const PLAYBOOK = {
  scale: {
    flow: '🟢 扩规模·稳获量', color: '#2e9e6b',
    up: { title: '获量在涨 · 固化高效渠道并守住 LTV', actions: ['确认是渠道/素材有效还是单纯放量', '固化高 ROI 渠道与素材，纳入常态预算', '放量同时监控 LTV/CAC，防价值被稀释', '为下一档预算留 holdout 验证增量真实性'], kpi: '新增用户、LTV/CAC、规模效应、渠道CPA' },
    down: { title: '优先:救获量 · 修复投放与获量漏斗', actions: ['排查投放预算/出价/素材近期改动与衰减', '拆解 曝光→点击→注册→新增 漏斗找掉点', '评估在投渠道质量，淘汰低 LTV 渠道', '补素材与定向，止住新增下滑'], kpi: '新增用户、投放消耗、渠道CPA、规模效应' },
  },
  conversion: {
    flow: '🔵 提转化·促首充', color: '#2f7fd4',
    up: { title: '首充转化在涨 · 固化并复制付费钩子', actions: ['定位本轮拉高付费率的首充钩子/礼包', '复制到更多档位与新手场景', '守住客单不要因低门槛档位而被拉低', 'A/B 确认转化提升非短期波动'], kpi: '付费率D0、首充率、转化效应、客单价(防回落)' },
    down: { title: '优先:救转化 · 排查首充入口与新手付费引导', actions: ['排查首充入口/新手引导/付费点近期改动', '上首充礼包/限时优惠，降低首次付费门槛', '优化定价档位结构与最低档位', '拆 新增→付费 漏斗，定位转化掉点环节'], kpi: '付费率D0、首充率、转化效应、新增→付费漏斗' },
  },
  arppu: {
    flow: '🟠 提客单·做付费深度', color: '#e08a2e',
    up: { title: '客单在涨 · 固化拉高客单的玩法/活动', actions: ['定位拉高 ARPPU 的高价值档位/活动', '强化大 R 供给与高价值玩法运营', '复制到更多付费场景做付费深度', '监控付费率不要因聚焦深度而回落'], kpi: 'ARPPU、付费档位分布、大R占比、客单效应' },
    down: { title: '优先:救客单 · 排查高价值供给与档位结构', actions: ['排查高价值档位/大R活动是否缺失或疲劳', '优化付费点与档位结构，引导上探高档位', '上复购券/进阶礼包做付费深度', '拆 客单 = 付费次数 × 单次金额 定位掉点'], kpi: 'ARPPU、付费次数、单次金额、客单效应' },
  },
  curve: {
    flow: '🟣 拉曲线·促复购留存', color: '#8b5cf6',
    weak: { title: '回本偏弱 · 优先做 D1–D30 留存与复购', actions: ['优化 D1/D3/D7 留存，做新手生命周期营销', '上复购触达/召回，延长 LTV 长尾', '排查中后期付费供给是否断档', '将 LTV_D7/D30 纳入投放回收口径'], kpi: 'LTV_D7/D30/D60、回本倍数、次留/7留、复购率' },
    normal: { title: '回本正常 · 守住曲线并向上拉尾部', actions: ['维持留存与复购运营节奏', '试验中长期付费供给抬升 D30→D60 尾部', '按回本倍数分层评估渠道质量'], kpi: 'LTV_D30/D60、回本倍数、留存' },
    strong: { title: '回本强 · 固化并放大长尾价值', actions: ['固化拉长尾的留存/复购机制', '据强回本曲线提高对应渠道预算', '复制高 LTV 人群定向'], kpi: 'LTV_D60、回本倍数、LTV/CAC' },
  },
};

const primaryPb = PLAYBOOK[dominant.key][dir];
const curvePb = curveHealth !== 'unknown' ? PLAYBOOK.curve[curveHealth] : null;

const diagnosis = {
  dominantKey: dominant.key,
  dominantName: dominant.name,
  direction: dir, directionLabel: dirLabel,
  share: dominant.pct,
  flow: PLAYBOOK[dominant.key].flow,
  primary: primaryPb,
  curveHealth,
  curveMult: rm,
  curve: curvePb,
};

// ---------- 6 周甘特图（★ = 诊断命中的本周优先工作流） ----------
const star = (key) => key === dominant.key ? '★' : '';
const gantt = [
  { flow: PLAYBOOK.scale.flow, star: star('scale'), task: '投放漏斗诊断(曝光→新增)', s: 1, e: 2 },
  { flow: PLAYBOOK.scale.flow, star: star('scale'), task: '渠道/素材优化与淘汰', s: 2, e: 5 },
  { flow: PLAYBOOK.scale.flow, star: star('scale'), task: '高 ROI 渠道复制放量', s: 3, e: 6 },
  { flow: PLAYBOOK.conversion.flow, star: star('conversion'), task: '首充漏斗诊断(新增→付费)', s: 1, e: 2 },
  { flow: PLAYBOOK.conversion.flow, star: star('conversion'), task: '首充礼包/定价档位实验', s: 2, e: 5 },
  { flow: PLAYBOOK.arppu.flow, star: star('arppu'), task: '客单结构诊断(次数×单次)', s: 1, e: 2 },
  { flow: PLAYBOOK.arppu.flow, star: star('arppu'), task: '高价值档位/付费深度运营', s: 2, e: 6 },
  { flow: PLAYBOOK.curve.flow, star: curveHealth === 'weak' ? '★' : '', task: 'D1–D30 留存与复购优化', s: 1, e: 4 },
  { flow: PLAYBOOK.curve.flow, star: '', task: '中长期付费供给抬尾部', s: 3, e: 6 },
  { flow: '🟤 控成本·保ROI', star: '', task: 'LTV/CAC 与回本周期监控', s: 1, e: 6 },
  { flow: '⚪ 横向', star: '', task: 'LTV 日报看板', s: 1, e: 2 },
  { flow: '⚪ 横向', star: '', task: 'A/B & holdout 框架', s: 1, e: 4 },
  { flow: '⚪ 横向', star: '', task: '周复盘', s: 1, e: 6 },
];

// ---------- KPI 看板基线 ----------
const kpiBaseline = [
  { kpi: '新增用户', baseline: b.newUsers, target: dominant.key === 'scale' && dir === 'down' ? '↑ 优先回升' : '稳健/↑' },
  { kpi: '付费率D0', baseline: (b.payRateD0 * 100).toFixed(2) + '%', target: dominant.key === 'conversion' && dir === 'down' ? '↑ 优先回升' : '↑/守住' },
  { kpi: '客单价 ARPPU', baseline: b.arppuD0, target: dominant.key === 'arppu' && dir === 'down' ? '↑ 优先回升' : '↑/守住' },
  { kpi: 'LTV_D0', baseline: b.ltvD0, target: '↑' },
  { kpi: 'LTV_D7', baseline: b.ltvD7, target: '↑' },
  { kpi: 'LTV_D30', baseline: b.ltvD30, target: '↑' },
  { kpi: 'LTV_D60', baseline: b.ltvD60, target: '↑' },
  { kpi: '回本倍数(D60/D0)', baseline: b.recycleMult, target: curveHealth === 'weak' ? '↑ 优先拉升' : '守住/↑' },
];
if (cac != null) {
  kpiBaseline.push({ kpi: 'LTV/CAC', baseline: b.ltvCac, target: '≥1.0 越快越好' });
  kpiBaseline.push({ kpi: '回本天数', baseline: b.paybackDay, target: '尽量提前' });
}

const results = {
  meta: { generatedAt: new Date().toISOString(), model: 'LTV three-factor LMDI-I + curve health', cac },
  summary, rows, decomposition, diagnosis, gantt, kpiBaseline,
};

fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

// ---------- 控制台输出（保留原技能的"数据分析结论"风格） ----------
const fmt = (n) => n == null ? '-' : Number(n).toLocaleString();
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 关键指标汇总  ' + summary.dateRange);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`平均新增用户   ${fmt(summary.avgNewUsers)}`);
console.log(`平均付费率D0   ${(summary.avgPayRateD0 * 100).toFixed(2)}%`);
console.log(`平均客单价     ${summary.avgArppuD0}`);
console.log(`平均 LTV_D0    ${summary.avgLtvD0}`);
console.log(`平均 LTV_D60   ${summary.avgLtvD60}`);
console.log(`平均回本倍数   ${summary.avgRecycleMult}×`);
console.log(`最高 LTV_D0    ${summary.bestLtvD0.batch} (${summary.bestLtvD0.ltvD0})`);
console.log(`最低 LTV_D0    ${summary.worstLtvD0.batch} (${summary.worstLtvD0.ltvD0})`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧮 LTV 三因子分解  ' + decomposition.from + ' → ' + decomposition.to);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`V0=${fmt(V0)}  V1=${fmt(V1)}  ΔV=${dV >= 0 ? '+' : ''}${fmt(decomposition.dV)} (${decomposition.dVpct >= 0 ? '+' : ''}${decomposition.dVpct}%)`);
for (const f of decomposition.factors) console.log(`  ${f.name.padEnd(14)} ${f.add >= 0 ? '+' : ''}${fmt(f.add)}  ${f.pct}%  ×${f.mul}`);
console.log(`\n主导原因: ${diagnosis.flow} · ${dominant.name}${dir === 'up' ? '↑' : '↓'} (${dirLabel}, 占 ΔV ${dominant.pct}%)`);
console.log(`回本曲线: 回本倍数 ${rm != null ? rm + '×' : '-'} → ${curveHealth}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 实行方案（诊断 → 行动）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`${diagnosis.flow}  ·  ${primaryPb.title}`);
primaryPb.actions.forEach(x => console.log('  • ' + x));
console.log('  盯的指标: ' + primaryPb.kpi);
if (curvePb) { console.log(`\n${PLAYBOOK.curve.flow}  ·  ${curvePb.title}`); curvePb.actions.forEach(x => console.log('  • ' + x)); }

console.log(`\n✓ 已写出 ${outFile}`);
