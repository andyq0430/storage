// LMDI-I 分解计算
const logMean = (a, b) => {
  if (a <= 0 || b <= 0) return 0.0;
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
};

// 合并数据
const banKuai = [
  { date: '2026-06-12', dau: 16836, jinFang: 10708 },
  { date: '2026-06-13', dau: 17122, jinFang: 10790 },
  { date: '2026-06-14', dau: 16470, jinFang: 10464 },
  { date: '2026-06-15', dau: 17061, jinFang: 10952 },
  { date: '2026-06-16', dau: 16932, jinFang: 10882 }
];

const shiYong = [
  { date: '2026-06-12', avgDuration: 135.235 },
  { date: '2026-06-13', avgDuration: 139.075 },
  { date: '2026-06-14', avgDuration: 143.09 },
  { date: '2026-06-15', avgDuration: 138.905 },
  { date: '2026-06-16', avgDuration: 145.295 }
];

// 合并数据
const merged = banKuai.map(bk => {
  const sy = shiYong.find(s => s.date === bk.date);
  return {
    date: bk.date,
    dau: bk.dau,
    jinFang: bk.jinFang,
    avgDuration: sy ? sy.avgDuration : 0
  };
});

console.log('================================================================================');
console.log('VV渠道活跃度LMDI-I分解模型');
console.log('================================================================================');
console.log('');
console.log('数据来源: 产品数据页面-活跃分类');
console.log('  - DAU、进房人数 → 板块活跃表格（语音区）');
console.log('  - 人均时长 → 使用时长表格（iOS+Android平均值）');
console.log('');
console.log('================================================================================');
console.log('原始数据');
console.log('================================================================================');
console.log('');

merged.forEach(d => {
  console.log(`${d.date}: DAU=${d.dau}, 进房人数=${d.jinFang}, 人均时长=${d.avgDuration.toFixed(2)}分钟`);
});

// 选择对比期间
const period0 = merged[0];  // 2026-06-12
const period1 = merged[4];  // 2026-06-16

console.log('');
console.log('================================================================================');
console.log('分解分析（2026-06-12 vs 2026-06-16）');
console.log('================================================================================');
console.log('');

// 计算总时长
const T0 = period0.jinFang * period0.avgDuration;
const T1 = period1.jinFang * period1.avgDuration;
const dT = T1 - T0;

console.log('上期 (2026-06-12):');
console.log('  进房人数: ' + period0.jinFang);
console.log('  人均时长: ' + period0.avgDuration.toFixed(2) + ' 分钟');
console.log('  总时长 = ' + period0.jinFang + ' × ' + period0.avgDuration.toFixed(2) + ' = ' + T0.toFixed(0) + ' 分钟');
console.log('');
console.log('本期 (2026-06-16):');
console.log('  进房人数: ' + period1.jinFang);
console.log('  人均时长: ' + period1.avgDuration.toFixed(2) + ' 分钟');
console.log('  总时长 = ' + period1.jinFang + ' × ' + period1.avgDuration.toFixed(2) + ' = ' + T1.toFixed(0) + ' 分钟');
console.log('');

// 分解计算
const w = logMean(T1, T0);
const C0 = period0.jinFang;
const C1 = period1.jinFang;
const addC = w * Math.log(C1 / C0);

const rho0 = period0.avgDuration;
const rho1 = period1.avgDuration;
const addRho = w * Math.log(rho1 / rho0);

const Ltot = logMean(T1, T0);
const mulC = Math.exp(addC / Ltot);
const mulRho = Math.exp(addRho / Ltot);

console.log('================================================================================');
console.log('分解结果');
console.log('================================================================================');
console.log('');
console.log('上期总时长 T0 = ' + T0.toFixed(0) + ' 分钟 (' + (T0/60).toFixed(1) + ' 小时)');
console.log('本期总时长 T1 = ' + T1.toFixed(0) + ' 分钟 (' + (T1/60).toFixed(1) + ' 小时)');
console.log('环比变化 ΔT = ' + dT.toFixed(0) + ' 分钟 (' + (dT/T0*100).toFixed(2) + '%)');
console.log('');

console.log('因子                                加法贡献(分钟)       占ΔT        乘法因子');
console.log('------------------------------------------------------------------');
console.log('进房人数 (规模)                          ' + addC.toFixed(0).padStart(5) + '     ' + (addC/dT*100).toFixed(1) + '%      ' + mulC.toFixed(4));
console.log('人均时长 (强度)                          ' + addRho.toFixed(0).padStart(5) + '     ' + (addRho/dT*100).toFixed(1) + '%      ' + mulRho.toFixed(4));
console.log('------------------------------------------------------------------');
const addSum = addC + addRho;
const mulProd = mulC * mulRho;
console.log('合计                                 ' + addSum.toFixed(0).padStart(5) + '    100.0%      ' + mulProd.toFixed(4));

console.log('');
console.log('校验: Σ加法贡献 = ΔT ? 误差 = ' + Math.abs(addSum-dT).toExponential(2));
console.log('校验: Π乘法因子 = T1/T0 ? ' + mulProd.toFixed(6) + ' vs ' + (T1/T0).toFixed(6));

console.log('');
console.log('================================================================================');
console.log('关键指标对比');
console.log('================================================================================');
console.log('');
console.log('指标                            上期          本期          变化');
console.log('------------------------------------------------------------');
const changeJinFang = ((period1.jinFang - period0.jinFang) / period0.jinFang * 100).toFixed(2);
const changeAvg = ((period1.avgDuration - period0.avgDuration) / period0.avgDuration * 100).toFixed(2);
const changeTotal = ((T1 - T0) / T0 * 100).toFixed(2);

console.log('进房人数                        ' + period0.jinFang + '        ' + period1.jinFang + '      ' + changeJinFang + '%');
console.log('人均时长(分钟)                  ' + period0.avgDuration.toFixed(2) + '      ' + period1.avgDuration.toFixed(2) + '      ' + changeAvg + '%');
console.log('总时长(分钟)                   ' + T0.toFixed(0) + '      ' + T1.toFixed(0) + '      ' + changeTotal + '%');

console.log('');
console.log('================================================================================');
console.log('分析结论');
console.log('================================================================================');
console.log('');
console.log('总时长增加 ' + changeTotal + '% 的主要原因是人均时长提升（强度效应 ' + (addRho/dT*100).toFixed(1) + '%），');
console.log('进房人数略有增加（规模效应 ' + (addC/dT*100).toFixed(1) + '%）。');
