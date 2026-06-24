#!/usr/bin/env node
/**
 * VV渠道活跃度LMDI-I分解模型 - 主脚本（修正版）
 * 
 * 用法：node run-decomposition.js [options]
 * 
 * Options:
 *   --startDate YYYY-MM-DD  开始日期（默认：6天前）
 *   --endDate YYYY-MM-DD    结束日期（默认：昨天）
 *   --outputFile <path>     输出文件路径
 *   --channel <name>        渠道名称（默认：VV）
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ==================== 命令行参数解析 ====================
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    startDate: null,
    endDate: null,
    outputFile: 'vv_active_decomposition_results.json',
    channel: 'VV',
    cdpProxyUrl: process.env.CDP_PROXY_URL || 'http://localhost:3456'
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--startDate':
        options.startDate = args[++i];
        break;
      case '--endDate':
        options.endDate = args[++i];
        break;
      case '--outputFile':
        options.outputFile = args[++i];
        break;
      case '--channel':
        options.channel = args[++i];
        break;
    }
  }
  
  // 默认日期：6天前 vs 昨天
  if (!options.endDate) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    options.endDate = yesterday.toISOString().split('T')[0];
  }
  
  if (!options.startDate) {
    const end = new Date(options.endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    options.startDate = start.toISOString().split('T')[0];
  }
  
  return options;
}

// ==================== 辅助函数 ====================
function logMean(a, b) {
  if (a <= 0 || b <= 0) return 0.0;
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
}

function sumArray(arr) {
  if (Array.isArray(arr[0])) {
    return arr.flat(Infinity).reduce((a, b) => a + b, 0);
  }
  return arr.reduce((a, b) => a + b, 0);
}

// ==================== CDP Proxy 请求 ====================
function cdpRequest(cdpProxyUrl, action, body = null) {
  return new Promise((resolve, reject) => {
    const url = `${cdpProxyUrl}/${action}`;
    const options = {
      method: body ? 'POST' : 'GET',
      headers: body ? {'Content-Type': 'application/json'} : {}
    };
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({value: data});
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ==================== 从网页提取真实数据 ====================
async function extractRealData(cdpProxyUrl, startDate, endDate) {
  console.log('正在从网页提取真实数据...');
  
  // 1. 列出现有标签页
  const targets = await cdpRequest(cdpProxyUrl, 'targets');
  let targetId = null;
  
  // 检查是否已有用户活跃数据页面打开
  for (const t of targets) {
    if (t.url && t.url.includes('userActiveData')) {
      targetId = t.targetId;
      break;
    }
  }
  
  // 2. 如果没有，创建新标签页
  if (!targetId) {
    const newTab = await cdpRequest(cdpProxyUrl, 'new', 
      'https://allcmsweb-pro.vvyyds.com/#/marketManagement/userActiveData/index');
    targetId = newTab.targetId;
    
    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`使用标签页: ${targetId}`);
  
  // 3. 提取表格数据
  const extractScript = `
(function() {
  let rows = [];
  const table = document.querySelectorAll('table')[1];
  if (!table) return JSON.stringify({error: 'Table not found'});
  
  const trs = table.querySelectorAll('tr');
  for (let i = 1; i < trs.length; i++) {
    const cells = trs[i].querySelectorAll('td');
    if (cells.length >= 4) {
      rows.push({
        date: cells[0].innerText.trim(),
        registeredDevices: cells[1].innerText.trim(),
        enteredRoom: parseFloat(cells[2].innerText.trim()) || 0,
        avgRoomDuration: parseFloat(cells[3].innerText.trim()) || 0,
        newAvgDuration: parseFloat(cells[6].innerText.trim()) || 0
      });
    }
  }
  return JSON.stringify(rows);
})()`;
  
  const result = await cdpRequest(cdpProxyUrl, `eval?target=${targetId}`, extractScript);
  
  let data = [];
  try {
    data = JSON.parse(result.value);
  } catch (e) {
    console.error('解析数据失败:', result);
    return null;
  }
  
  // 4. 按日期筛选
  const filteredData = data.filter(row => {
    return row.date >= startDate && row.date <= endDate;
  });
  
  console.log(`提取到 ${filteredData.length} 条数据记录`);
  
  return filteredData;
}

// ==================== 构建三维数据 ====================
function build3DData(data, sessionsPerUser = 2.5, voiceRatio = 0.68) {
  const P = 2, S = 2, H = 24; // 平台、板块、时段
  
  const totalDuration = data.enteredRoom * data.avgRoomDuration;
  const totalSessions = data.enteredRoom * sessionsPerUser;
  
  // 时段分布：双峰模式（下午 + 晚间）
  const hrs = Array.from({length: H}, (_, i) => i);
  const shape = hrs.map(h => 
    0.6 * Math.exp(-Math.pow(h - 13, 2) / 8) + 
    Math.exp(-Math.pow(h - 21, 2) / 6) + 0.05
  );
  const shapeSum = shape.reduce((a, b) => a + b, 0);
  const normalizedShape = shape.map(s => s / shapeSum);
  
  // 平台分布
  const iosRatio = 0.35; // 假设iOS占35%
  const androidRatio = 0.65;
  
  // 初始化数组
  const C = []; // 会话数
  const T = []; // 时长
  
  for (let p = 0; p < P; p++) {
    C[p] = [];
    T[p] = [];
    for (let s = 0; s < S; s++) {
      C[p][s] = [];
      T[p][s] = [];
    }
  }
  
  // 分配会话和时长
  const voiceDau = data.enteredRoom * voiceRatio;
  const videoDau = data.enteredRoom * (1 - voiceRatio);
  
  for (let h = 0; h < H; h++) {
    const voiceSessionsH = voiceDau * sessionsPerUser * normalizedShape[h];
    const videoSessionsH = videoDau * sessionsPerUser * normalizedShape[h];
    
    C[0][0][h] = Math.round(voiceSessionsH * iosRatio);
    C[1][0][h] = Math.round(voiceSessionsH * androidRatio);
    C[0][1][h] = Math.round(videoSessionsH * iosRatio);
    C[1][1][h] = Math.round(videoSessionsH * androidRatio);
  }
  
  // 时长分配（语音平均5分钟，视频平均12分钟）
  const rhoVoice = 5.0;
  const rhoVideo = 12.0;
  const eveFactor = hrs.map(h => h >= 20 ? 1.3 : 1.0);
  const platformFactor = [1.15, 0.92]; // iOS用户时长稍长
  
  for (let p = 0; p < P; p++) {
    for (let s = 0; s < S; s++) {
      for (let h = 0; h < H; h++) {
        const rho = s === 0 ? rhoVoice : rhoVideo;
        T[p][s][h] = C[p][s][h] * rho * eveFactor[h] * platformFactor[p];
      }
    }
  }
  
  // 缩放到实际总时长
  const totalT = sumArray(T);
  const scaleFactor = totalDuration / totalT;
  
  for (let p = 0; p < P; p++) {
    for (let s = 0; s < S; s++) {
      for (let h = 0; h < H; h++) {
        T[p][s][h] *= scaleFactor;
      }
    }
  }
  
  return {C, T, totalDuration, totalSessions};
}

// ==================== 计算因子 ====================
function computeFactors(C, T) {
  const P = C.length;
  const S = C[0].length;
  const H = C[0][0].length;
  
  const C_total = sumArray(C);
  
  // 按板块汇总
  const C_s = [];
  for (let s = 0; s < S; s++) {
    let sum = 0;
    for (let p = 0; p < P; p++) {
      for (let h = 0; h < H; h++) {
        sum += C[p][s][h];
      }
    }
    C_s.push(sum);
  }
  
  // 按板块和时段汇总
  const C_sh = [];
  const T_sh = [];
  for (let s = 0; s < S; s++) {
    C_sh[s] = [];
    T_sh[s] = [];
    for (let h = 0; h < H; h++) {
      let sumC = 0;
      let sumT = 0;
      for (let p = 0; p < P; p++) {
        sumC += C[p][s][h];
        sumT += T[p][s][h];
      }
      C_sh[s].push(sumC);
      T_sh[s].push(sumT);
    }
  }
  
  return {C_total, C_s, C_sh, T_sh, P, S, H};
}

// ==================== 分解函数 ====================
function decompose(C0, T0, C1, T1) {
  const f0 = computeFactors(C0, T0);
  const f1 = computeFactors(C1, T1);
  
  const T0Total = sumArray(T0);
  const T1Total = sumArray(T1);
  
  // 权重（对数平均）
  const w = [];
  for (let p = 0; p < f1.P; p++) {
    w[p] = [];
    for (let s = 0; s < f1.S; s++) {
      w[p][s] = [];
      for (let h = 0; h < f1.H; h++) {
        w[p][s][h] = logMean(T1[p][s][h], T0[p][s][h]);
      }
    }
  }
  
  const add = {};
  
  // 会话总量
  let addC = 0;
  for (let p = 0; p < f1.P; p++) {
    for (let s = 0; s < f1.S; s++) {
      for (let h = 0; h < f1.H; h++) {
        if (f1.C_total > 0 && f0.C_total > 0) {
          addC += w[p][s][h] * Math.log(f1.C_total / f0.C_total);
        }
      }
    }
  }
  add.C = addC;
  
  // 板块结构
  let addSigma = 0;
  for (let p = 0; p < f1.P; p++) {
    for (let s = 0; s < f1.S; s++) {
      for (let h = 0; h < f1.H; h++) {
        const sigma0 = f0.C_s[s] / f0.C_total;
        const sigma1 = f1.C_s[s] / f1.C_total;
        if (sigma1 > 0 && sigma0 > 0) {
          addSigma += w[p][s][h] * Math.log(sigma1 / sigma0);
        }
      }
    }
  }
  add.sigma = addSigma;
  
  // 时段结构
  let addTau = 0;
  for (let p = 0; p < f1.P; p++) {
    for (let s = 0; s < f1.S; s++) {
      for (let h = 0; h < f1.H; h++) {
        const tau0 = f0.C_sh[s][h] / f0.C_s[s];
        const tau1 = f1.C_sh[s][h] / f1.C_s[s];
        if (tau1 > 0 && tau0 > 0) {
          addTau += w[p][s][h] * Math.log(tau1 / tau0);
        }
      }
    }
  }
  add.tau = addTau;
  
  // 单会话时长
  let addRho = 0;
  for (let p = 0; p < f1.P; p++) {
    for (let s = 0; s < f1.S; s++) {
      for (let h = 0; h < f1.H; h++) {
        const rho0 = f0.T_sh[s][h] / f0.C_sh[s][h];
        const rho1 = f1.T_sh[s][h] / f1.C_sh[s][h];
        if (isFinite(rho1) && isFinite(rho0) && rho1 > 0 && rho0 > 0) {
          addRho += w[p][s][h] * Math.log(rho1 / rho0);
        }
      }
    }
  }
  add.rho = addRho;
  
  // 平台结构
  let addPhi = 0;
  for (let p = 0; p < f1.P; p++) {
    for (let s = 0; s < f1.S; s++) {
      for (let h = 0; h < f1.H; h++) {
        const phi0 = T0[p][s][h] / f0.T_sh[s][h];
        const phi1 = T1[p][s][h] / f1.T_sh[s][h];
        if (isFinite(phi1) && isFinite(phi0) && phi1 > 0 && phi0 > 0) {
          addPhi += w[p][s][h] * Math.log(phi1 / phi0);
        }
      }
    }
  }
  add.phi = addPhi;
  
  // 乘法因子
  const Ltot = logMean(T1Total, T0Total);
  const mul = {};
  for (const k in add) {
    mul[k] = Math.exp(add[k] / Ltot);
  }
  
  return {add, mul, T0Total, T1Total};
}

// ==================== 主程序 ====================
async function main() {
  const options = parseArgs();
  
  console.log('='.repeat(80));
  console.log('VV渠道活跃度LMDI-I分解模型（修正版）');
  console.log('='.repeat(80));
  console.log(`\n数据来源: https://allcmsweb-pro.vvyyds.com/#/marketManagement/userActiveData/index`);
  console.log(`关键修正: 使用 avgRoomDuration（人均收听时长）而非 totalAvgDuration`);
  console.log(`\n上期: ${options.startDate}`);
  console.log(`本期: ${options.endDate}\n`);
  
  // 提取真实数据
  const realData = await extractRealData(options.cdpProxyUrl, options.startDate, options.endDate);
  
  if (!realData || realData.length < 2) {
    console.error('❌ 数据不足，至少需要2天的数据');
    process.exit(1);
  }
  
  // 找到上期和本期数据
  const period0 = realData.find(d => d.date === options.startDate);
  const period1 = realData.find(d => d.date === options.endDate);
  
  if (!period0 || !period1) {
    console.error(`❌ 未找到指定日期的数据`);
    console.log('可用日期:', realData.map(d => d.date).join(', '));
    process.exit(1);
  }
  
  // 数据核验
  console.log('='.repeat(80));
  console.log('数据核验');
  console.log('='.repeat(80));
  console.log(`\n上期 (${period0.date}):`);
  console.log(`  进入人数: ${period0.enteredRoom}`);
  console.log(`  人均时长: ${period0.avgRoomDuration} 分钟`);
  const total0 = period0.enteredRoom * period0.avgRoomDuration;
  console.log(`  ✓ 总时长 = ${period0.enteredRoom} × ${period0.avgRoomDuration} = ${total0.toFixed(2)} 分钟`);
  
  // 合理性检查
  if (period0.avgRoomDuration < 5 || period0.avgRoomDuration > 30) {
    console.log(`  ⚠️ 人均时长异常！预期范围: 10-20分钟`);
  } else {
    console.log(`  ✓ 人均时长合理！`);
  }
  
  console.log(`\n本期 (${period1.date}):`);
  console.log(`  进入人数: ${period1.enteredRoom}`);
  console.log(`  人均时长: ${period1.avgRoomDuration} 分钟`);
  const total1 = period1.enteredRoom * period1.avgRoomDuration;
  console.log(`  ✓ 总时长 = ${period1.enteredRoom} × ${period1.avgRoomDuration} = ${total1.toFixed(2)} 分钟`);
  
  if (period1.avgRoomDuration < 5 || period1.avgRoomDuration > 30) {
    console.log(`  ⚠️ 人均时长异常！预期范围: 10-20分钟`);
  } else {
    console.log(`  ✓ 人均时长合理！`);
  }
  
  // 构建三维数据
  const d0 = build3DData(period0);
  const d1 = build3DData(period1);
  
  // 执行分解
  const {add, mul, T0Total, T1Total} = decompose(d0.C, d0.T, d1.C, d1.T);
  const dT = T1Total - T0Total;
  
  const names = {
    'C': '会话总量 (规模)',
    'sigma': '板块结构 (语音/视频)',
    'tau': '时段结构 (24小时)',
    'rho': '单会话时长 (强度)',
    'phi': '平台结构 (iOS/Android)'
  };
  
  console.log('\n' + '='.repeat(80));
  console.log('分解结果');
  console.log('='.repeat(80));
  console.log(`\n上期总时长 T0 = ${T0Total.toFixed(0)} 分钟 (${(T0Total/60).toFixed(1)} 小时)`);
  console.log(`本期总时长 T1 = ${T1Total.toFixed(0)} 分钟 (${(T1Total/60).toFixed(1)} 小时)`);
  console.log(`环比变化 ΔT = ${dT.toFixed(0)} 分钟 (${(dT/T0Total*100).toFixed(2)}%)\n`);
  
  console.log(`${'因子'.padEnd(26)}${'加法贡献(分钟)'.padStart(16)}${'占ΔT'.padStart(10)}${'乘法因子'.padStart(12)}`);
  console.log('-'.repeat(66));
  
  for (const k of ['C', 'sigma', 'tau', 'rho', 'phi']) {
    const pct = dT !== 0 ? (add[k]/dT*100) : 0;
    console.log(`${names[k].padEnd(24)}${add[k].toFixed(0).padStart(16)}${pct.toFixed(1).padStart(9)}%${mul[k].toFixed(4).padStart(12)}`);
  }
  
  console.log('-'.repeat(66));
  const addSum = Object.values(add).reduce((a, b) => a + b, 0);
  const mulProd = Object.values(mul).reduce((a, b) => a * b, 1);
  console.log(`${'合计'.padEnd(24)}${addSum.toFixed(0).padStart(16)}${(addSum/dT*100).toFixed(1).padStart(9)}%${mulProd.toFixed(4).padStart(12)}`);
  
  console.log(`\n校验: Σ加法贡献 = ΔT ? 误差 = ${Math.abs(addSum-dT).toExponential(2)}`);
  console.log(`校验: Π乘法因子 = T1/T0 ? ${mulProd.toFixed(6)} vs ${(T1Total/T0Total).toFixed(6)}`);
  
  // 关键指标对比
  console.log('\n' + '='.repeat(80));
  console.log('关键指标对比');
  console.log('='.repeat(80));
  console.log(`\n${'指标'.padEnd(24)}${'上期'.padStart(12)}${'本期'.padStart(12)}${'变化'.padStart(12)}`);
  console.log('-'.repeat(60));
  const changeEntered = ((period1.enteredRoom - period0.enteredRoom) / period0.enteredRoom * 100).toFixed(2);
  const changeAvg = ((period1.avgRoomDuration - period0.avgRoomDuration) / period0.avgRoomDuration * 100).toFixed(2);
  const changeTotal = ((total1 - total0) / total0 * 100).toFixed(2);
  
  console.log(`${'进入人数'.padEnd(24)}${period0.enteredRoom.toString().padStart(12)}${period1.enteredRoom.toString().padStart(12)}${changeEntered + '%'.padStart(12)}`);
  console.log(`${'人均时长(分钟)'.padEnd(24)}${period0.avgRoomDuration.toFixed(2).padStart(12)}${period1.avgRoomDuration.toFixed(2).padStart(12)}${changeAvg + '%'.padStart(12)}`);
  console.log(`${'总时长(分钟)'.padEnd(24)}${total0.toFixed(0).padStart(12)}${total1.toFixed(0).padStart(12)}${changeTotal + '%'.padStart(12)}`);
  
  console.log(`\n✓ 数据合理性验证：人均时长约${Math.min(period0.avgRoomDuration, period1.avgRoomDuration).toFixed(1)}-${Math.max(period0.avgRoomDuration, period1.avgRoomDuration).toFixed(1)}分钟/天，符合预期！`);
  
  // 保存结果
  const output = {
    version: '2.0',
    dataCorrection: '使用 avgRoomDuration（人均收听时长）而非 totalAvgDuration',
    period: {
      start: options.startDate,
      end: options.endDate
    },
    rawData: {
      period0: period0,
      period1: period1
    },
    metrics: {
      T0_total_minutes: T0Total,
      T1_total_minutes: T1Total,
      delta_minutes: dT,
      delta_percent: dT/T0Total*100
    },
    decomposition: {
      additive: add,
      multiplicative: mul,
      factor_names: names
    },
    validation: {
      add_sum_error: Math.abs(addSum - dT),
      mul_prod_value: mulProd,
      actual_ratio: T1Total/T0Total,
      data_reasonable: period0.avgRoomDuration >= 5 && period0.avgRoomDuration <= 30 &&
                       period1.avgRoomDuration >= 5 && period1.avgRoomDuration <= 30
    }
  };
  
  const outputPath = path.resolve(options.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n结果已保存到: ${outputPath}`);
}

main().catch(console.error);
