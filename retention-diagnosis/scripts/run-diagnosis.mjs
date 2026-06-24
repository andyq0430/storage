#!/usr/bin/env node
/**
 * 用户留存诊断分解模型
 * 
 * 活跃留存 = 新用户占比 × 新用户留存 + (1-新用户占比) × 老用户留存
 * Δ活跃留存 = 结构效应 + 新留存效应 + 老留存效应
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// 核心计算函数
// ============================================================================

/**
 * 计算活跃用户数
 */
function activeUsers(d) {
  return (+d.newUsers || 0) + (+d.oldUsers || 0);
}

/**
 * 计算新用户占比
 */
function newRatio(d) {
  const a = activeUsers(d);
  return a > 0 ? (+d.newUsers || 0) / a : 0;
}

/**
 * 计算活跃留存率
 */
function activeRetention(d) {
  const wn = newRatio(d);
  const rn = +d.newRetain1 || 0;
  const ro = +d.oldRetain1 || 0;
  return wn * rn + (1 - wn) * ro;
}

/**
 * 保留1位小数
 */
function r1(x) {
  return (Math.round(x * 10) / 10).toFixed(1);
}

/**
 * 带符号保留1位小数
 */
function sgn1(x) {
  return (x >= 0 ? '+' : '−') + (Math.abs(Math.round(x * 10) / 10)).toFixed(1);
}

/**
 * 整数千位分隔
 */
function intc(x) {
  return Math.round(x).toLocaleString('en-US');
}

/**
 * 分解活跃留存变化
 */
function decompose(A, B) {
  const wnA = newRatio(A);
  const wnB = newRatio(B);
  const woA = 1 - wnA;
  const woB = 1 - wnB;
  
  const rnA = +A.newRetain1 || 0;
  const rnB = +B.newRetain1 || 0;
  const roA = +A.oldRetain1 || 0;
  const roB = +B.oldRetain1 || 0;
  
  // 结构效应
  const mix = (wnB - wnA) * ((rnA + rnB) / 2) + (woB - woA) * ((roA + roB) / 2);
  
  // 新留存效应
  const newR = ((wnA + wnB) / 2) * (rnB - rnA);
  
  // 老留存效应
  const oldR = ((woA + woB) / 2) * (roB - roA);
  
  // 活跃留存变化
  const dRa = activeRetention(B) - activeRetention(A);
  
  return {
    mix: mix,
    newR: newR,
    oldR: oldR,
    dRa: dRa,
    raA: activeRetention(A),
    raB: activeRetention(B)
  };
}

/**
 * 判断主导因素
 */
function dominant(D) {
  const arr = [
    ['结构', D.mix],
    ['新留存', D.newR],
    ['老留存', D.oldR]
  ];
  
  arr.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  
  const top = arr[0];
  const val = top[1];
  
  let label, bg, col;
  
  if (top[0] === '结构') {
    label = val < 0 ? '结构稀释' : '结构优化';
    bg = val < 0 ? 'var(--warnbg)' : 'var(--posbg)';
    col = val < 0 ? 'var(--warn)' : 'var(--pos)';
  } else if (top[0] === '新留存') {
    label = val < 0 ? '新留存恶化' : '新留存改善';
    bg = val < 0 ? 'var(--negbg)' : 'var(--posbg)';
    col = val < 0 ? 'var(--neg)' : 'var(--pos)';
  } else {
    label = val < 0 ? '老留存恶化' : '老留存改善';
    bg = val < 0 ? 'var(--negbg)' : 'var(--posbg)';
    col = val < 0 ? 'var(--neg)' : 'var(--pos)';
  }
  
  return {
    key: top[0],
    val: val,
    label: label,
    bg: bg,
    col: col
  };
}

// ============================================================================
// 可视化函数
// ============================================================================

/**
 * 生成留存曲线SVG
 */
function generateRetentionChart(data) {
  if (data.length < 1) return '<p>没有数据。</p>';
  
  const W = 720, H = 280;
  const ml = 42, mr = 14, mt = 14, mb = 30;
  const pw = W - ml - mr, ph = H - mt - mb;
  
  // 计算Y轴范围
  const vals = [];
  data.forEach(x => {
    vals.push(activeRetention(x), +x.newRetain1 || 0, +x.oldRetain1 || 0);
  });
  const maxv = Math.max(...vals.concat([10]));
  const ymax = Math.ceil(maxv / 10) * 10;
  
  const n = data.length;
  
  function X(i) {
    return ml + (n === 1 ? pw / 2 : pw * i / (n - 1));
  }
  
  function Y(v) {
    return mt + ph - (v / ymax) * ph;
  }
  
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="var(--sans)">`;
  
  // 网格线
  for (let g = 0; g <= ymax; g += ymax / 4) {
    const yy = Y(g);
    svg += `<line x1="${ml}" y1="${yy.toFixed(1)}" x2="${W - mr}" y2="${yy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
    svg += `<text x="${ml - 7}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--faint)">${g}</text>`;
  }
  
  // X轴标签
  data.forEach((x, i) => {
    const lab = x.date || ('第' + (i + 1) + '天');
    if (n <= 12 || i % Math.ceil(n / 12) === 0) {
      svg += `<text x="${X(i).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="var(--faint)">${lab}</text>`;
    }
  });
  
  // 绘制曲线函数
  function series(get, color) {
    const pts = data.map((x, i) => `${X(i).toFixed(1)},${Y(get(x)).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    
    data.forEach((x, i) => {
      svg += `<circle cx="${X(i).toFixed(1)}" cy="${Y(get(x)).toFixed(1)}" r="3" fill="${color}"><title>${x.date}: ${r1(get(x))}%</title></circle>`;
    });
  }
  
  series(x => +x.oldRetain1 || 0, 'var(--oldc)');
  series(x => +x.newRetain1 || 0, 'var(--newc)');
  series(x => activeRetention(x), 'var(--active)');
  
  svg += '</svg>';
  return svg;
}

/**
 * 生成瀑布图SVG
 */
function generateWaterfall(steps) {
  const W = 720, H = 240;
  const ml = 10, mr = 10, mt = 22, base = 190;
  
  let run = 0;
  const bars = steps.map(s => {
    let b;
    if (s.abs) {
      b = { bv: 0, tv: s.val };
      run = s.val;
    } else {
      const a = run;
      const e = run + s.val;
      run = e;
      b = { bv: Math.min(a, e), tv: Math.max(a, e) };
    }
    return Object.assign({}, s, b);
  });
  
  const maxV = Math.max(...bars.map(b => b.tv).concat([1]));
  const scale = (base - mt) / maxV;
  
  function Y(v) {
    return base - v * scale;
  }
  
  const inner = W - ml - mr;
  const n = bars.length;
  const slot = inner / n;
  
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="var(--sans)">`;
  
  // 基准线
  svg += `<line x1="${ml}" y1="${base}" x2="${W - mr}" y2="${base}" stroke="var(--line2)" stroke-width="1"/>`;
  
  let runv = 0;
  bars.forEach((b, i) => {
    const cx = ml + slot * (i + 0.5);
    const bw = Math.min(slot * 0.5, 70);
    const x = cx - bw / 2;
    
    const col = b.abs ? 'var(--faint)' : (b.val >= 0 ? 'var(--pos)' : 'var(--neg)');
    const h = Math.max((b.tv - b.bv) * scale, 2);
    
    svg += `<rect x="${x.toFixed(1)}" y="${Y(b.tv).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}" opacity="0.9"/>`;
    
    const lab = b.abs ? (r1(b.val) + '%') : sgn1(b.val);
    svg += `<text x="${cx.toFixed(1)}" y="${(Y(b.tv) - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${lab}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${base + 18}" text-anchor="middle" font-size="12" fill="var(--muted)">${b.label}</text>`;
    
    const after = b.abs ? b.tv : runv + b.val;
    runv = after;
    
    if (i < bars.length - 1) {
      const ny = Y(after).toFixed(1);
      svg += `<line x1="${(cx + bw / 2).toFixed(1)}" y1="${ny}" x2="${(ml + slot * (i + 1.5) - bw / 2).toFixed(1)}" y2="${ny}" stroke="var(--line2)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
  });
  
  svg += '</svg>';
  return svg;
}

/**
 * 生成结论文本
 */
function generateConclusion(A, B, D) {
  const dom = dominant(D);
  const dir = D.dRa >= 0 ? '上升' : '下降';
  
  const head = `<b>${A.date} → ${B.date}</b>: 活跃留存 ${sgn1(D.dRa)}pt (${r1(D.raA)}% → ${r1(D.raB)}%)。结构 ${sgn1(D.mix)} / 新留存 ${sgn1(D.newR)} / 老留存 ${sgn1(D.oldR)} pt。`;
  
  let body;
  
  if (dom.key === '结构') {
    body = dom.val < 0
      ? '主因是<b class="tag-in">结构稀释</b>: 低留存的新用户占比上升（多半是获客放量），把活跃留存拉了下来，而新、老两段自身留存基本没恶化。此时不要急着改产品/onboarding——先确认这波放量的用户 LTV 是否仍为正，或给渠道设留存门槛。'
      : '主因是<b>结构优化</b>: 高留存的老用户占比上升带动活跃留存走高。注意这可能只是获客放缓的副作用，不等于产品变好。';
  } else if (dom.key === '新留存') {
    body = dom.val < 0
      ? '主因是<b class="tag-in">新用户留存恶化</b>: 不是占比问题，是新用户本身留得更差了。重点查近期 onboarding/激活改动、新进渠道质量、或产品对新人的首日体验。'
      : '主因是<b>新用户留存改善</b>: 新人首期体验在变好，onboarding 或渠道质量的优化见效了。';
  } else {
    body = dom.val < 0
      ? '主因是<b class="tag-out">老用户留存恶化</b>: 存量用户在加速流失，通常更危险。排查产品体验衰减、核心功能改动、竞品挤压或用户疲劳。'
      : '主因是<b>老用户留存改善</b>: 存量盘更稳了，长期价值的信号。';
  }
  
  return head + '<div style="margin-top:8px">' + body + '</div>';
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('用户留存诊断分解模型');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 读取数据
  const args = process.argv.slice(2);
  const dataArg = args.find(a => a.startsWith('--data='));
  const dataFile = args.find(a => a.startsWith('--data-file='));
  
  let data;
  
  try {
    if (dataFile) {
      // 从文件读取
      const filePath = dataFile.substring(12);
      const rawData = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(rawData);
    } else if (dataArg) {
      // 从命令行参数读取
      data = JSON.parse(dataArg.substring(7));
    } else {
      // 从默认文件读取
      const defaultPath = path.join(path.dirname(import.meta.url.replace('file:///', '')), '..', 'raw_data.json');
      const rawData = fs.readFileSync(defaultPath, 'utf-8');
      data = JSON.parse(rawData);
    }
  } catch (e) {
    console.error('❌ 错误: 数据读取失败');
    console.log('用法:');
    console.log("  node run-diagnosis.mjs --data='<json_array>'");
    console.log('  node run-diagnosis.mjs --data-file=<path_to_json>');
    console.log('  node run-diagnosis.mjs (使用默认raw_data.json)');
    process.exit(1);
  }
  
  console.log('✅ 数据加载成功\n');
  
  // 保存原始数据
  const rawDataPath = path.join(path.dirname(import.meta.url.replace('file:///', '')), '..', 'raw_data.json');
  fs.writeFileSync(rawDataPath, JSON.stringify(data, null, 2));
  
  // ============================================================================
  // 数据汇总表
  // ============================================================================
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('每日用户留存数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('日期       |  新增用户|  老用户|  新留存|  老留存|  活跃留存');
  console.log('----------------------------------------------------');
  
  data.forEach(d => {
    const date = d.date || '';
    const newU = intc(+d.newUsers || 0);
    const oldU = intc(+d.oldUsers || 0);
    const newR = r1(+d.newRetain1 || 0) + '%';
    const oldR = r1(+d.oldRetain1 || 0) + '%';
    const actR = r1(activeRetention(d)) + '%';
    
    console.log(`${date.padEnd(10)} | ${newU.padStart(9)} | ${oldU.padStart(7)} | ${newR.padStart(6)} | ${oldR.padStart(6)} | ${actR.padStart(9)}`);
  });
  
  console.log('');
  
  // ============================================================================
  // 留存曲线图
  // ============================================================================
  
  const chartSvg = generateRetentionChart(data);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('三条留存曲线（SVG已生成）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // ============================================================================
  // 活跃留存变化分解
  // ============================================================================
  
  if (data.length >= 2) {
    const A = data[0];
    const B = data[data.length - 1];
    const D = decompose(A, B);
    const dom = dominant(D);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`活跃留存变化分解 (${A.date} vs ${B.date})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`基准日活跃留存: ${r1(D.raA)}%`);
    console.log(`对比日活跃留存: ${r1(D.raB)}%`);
    console.log(`变化: ${sgn1(D.dRa)}pt\n`);
    
    console.log('因素分解:');
    console.log(`  结构效应: ${sgn1(D.mix)}pt`);
    console.log(`  新留存效应: ${sgn1(D.newR)}pt`);
    console.log(`  老留存效应: ${sgn1(D.oldR)}pt`);
    console.log(`\n主导原因: ${dom.label}\n`);
    
    // 瀑布图
    const steps = [
      { label: A.date || '基准', val: D.raA, abs: true },
      { label: '结构', val: D.mix },
      { label: '新留存', val: D.newR },
      { label: '老留存', val: D.oldR },
      { label: B.date || '对比', val: D.raB, abs: true }
    ];
    
    const waterfallSvg = generateWaterfall(steps);
    
    // 结论
    const conclusion = generateConclusion(A, B, D);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('分析结论');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(conclusion.replace(/<[^>]+>/g, '') + '\n');
  }
  
  // ============================================================================
  // 逐日驱动明细
  // ============================================================================
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('逐日驱动明细');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('日期       | 活跃留存| Δ vs前日|  结构| 新留存| 老留存|  主导');
  console.log('---------------------------------------------------------');
  
  data.forEach((d, i) => {
    if (i === 0) {
      console.log(`${d.date.padEnd(10)} | ${r1(activeRetention(d))}% |      — |     — |      — |      — |     —`);
    } else {
      const D = decompose(data[i - 1], d);
      const dom = dominant(D);
      
      const dRa = sgn1(D.dRa);
      const mix = sgn1(D.mix);
      const newR = sgn1(D.newR);
      const oldR = sgn1(D.oldR);
      
      console.log(`${d.date.padEnd(10)} | ${r1(activeRetention(d))}% | ${dRa.padStart(7)} | ${mix.padStart(5)} | ${newR.padStart(6)} | ${oldR.padStart(6)} | ${dom.label}`);
    }
  });
  
  console.log('');
  
  // ============================================================================
  // Playbook定义
  // ============================================================================
  
  const playbook = {
    '结构': {
      ws: '控结构·优化配比',
      color: 'var(--active)',
      恶化: {
        title: '优先:控结构 · 优化新老配比',
        acts: ['不要急着改产品/onboarding——结构稀释说明产品没坏', '管获客节奏:避免脉冲式放量把低留存新用户灌进来', '给渠道设留存质量门槛,低留存来源反馈到投放', '按 cohort 分群看新老,别把稀释误判成产品问题', '核算这波新用户后续留存与 LTV 是否仍为正'],
        watch: '新用户占比、各渠道新留存、结构效应'
      },
      改善: {
        title: '结构在帮你 · 留意是否只是获客放缓',
        acts: ['确认是高留存来源占比上升,还是获客放缓副作用', '固化高留存来源,纳入获客组合', '别因结构好看而放松对新/老自身留存的监控'],
        watch: '新用户占比、获客量趋势'
      }
    },
    '新留存': {
      ws: '提升新用户留存',
      color: 'var(--newc)',
      恶化: {
        title: '优先:提升新用户留存',
        acts: ['查近期 onboarding / 激活路径改动,定位变差环节', '排查新进渠道质量(是否买进低意愿用户)', '优化首日体验:aha 前置、缩短激活路径', '关键激活动作做 A/B,以留存为指标', '上新手 7 日旅程:引导任务 + 流失召回'],
        watch: 'D1/D7 新留存、激活率、新留存效应'
      },
      改善: {
        title: '新留存改善 · 固化有效动作',
        acts: ['把见效的激活/引导固化进默认新手流程', '复制到其他入口/渠道', '持续 A/B 守住增量'],
        watch: 'D7 新留存、激活率'
      }
    },
    '老留存': {
      ws: '守住老用户留存',
      color: 'var(--oldc)',
      恶化: {
        title: '优先:守住老用户留存',
        acts: ['存量流失最危险:建活跃度下降预警 + 定向召回', '排查产品体验衰减、核心功能改动、内容陈旧', '看竞品挤压与用户疲劳信号', '上忠诚/会员体系激励长期用户', '核心功能使用率下滑单独追根因'],
        watch: 'D7/D30 老留存、核心功能使用率、老留存效应'
      },
      改善: {
        title: '存量盘更稳 · 长期价值信号',
        acts: ['维持内容/版本更新节奏,保住核心循环新鲜度', '把稳住存量的做法机制化', '资源更多挪向新用户与配比问题'],
        watch: 'D30 老留存、复访频次'
      }
    }
  };
  
  // ============================================================================
  // 保存结果
  // ============================================================================
  
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      startDate: data[0]?.date,
      endDate: data[data.length - 1]?.date,
      days: data.length,
      startRetention: data[0] ? r1(activeRetention(data[0])) : null,
      endRetention: data[data.length - 1] ? r1(activeRetention(data[data.length - 1])) : null
    },
    dailyData: data.map(d => ({
      date: d.date,
      newUsers: +d.newUsers || 0,
      oldUsers: +d.oldUsers || 0,
      activeUsers: activeUsers(d),
      newRetention: +d.newRetain1 || 0,
      oldRetention: +d.oldRetain1 || 0,
      activeRetention: activeRetention(d),
      newRatio: newRatio(d)
    })),
    decomposition: data.length >= 2 ? {
      baseline: data[0].date,
      comparison: data[data.length - 1].date,
      ...decompose(data[0], data[data.length - 1])
    } : null
  };
  
  const resultsPath = path.join(path.dirname(import.meta.url.replace('file:///', '')), '..', 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 分析完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('💾 结果已保存:');
  console.log(`  - ${rawDataPath}`);
  console.log(`  - ${resultsPath}\n`);
}

main().catch(console.error);
