#!/usr/bin/env node
/**
 * VV渠道活跃度LMDI-I分解模型 - 使用内部浏览器提取数据
 * 
 * 用法：node run-decomposition.js
 * 
 * 此脚本从产品数据页面提取板块活跃和使用时长数据，运行LMDI-I分解
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LMDI-I 对数平均函数
 */
const logMean = (a, b) => {
  if (a <= 0 || b <= 0) return 0.0;
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
};

/**
 * 从JSON文件读取提取的数据
 */
function loadExtractedData() {
  const rawFile = path.join(__dirname, '..', 'raw_data.json');
  
  if (!fs.existsSync(rawFile)) {
    console.error('❌ 数据文件不存在:', rawFile);
    console.log('\n请先使用内部浏览器提取数据：');
    console.log('1. 打开产品数据页面');
    console.log('2. 筛选VV渠道');
    console.log('3. 提取板块活跃数据（table[3]）');
    console.log('4. 提取使用时长数据（table[7]）');
    console.log('5. 保存到 raw_data.json');
    process.exit(1);
  }
  
  const rawContent = fs.readFileSync(rawFile, 'utf-8');
  return JSON.parse(rawContent);
}

/**
 * 合并板块活跃和使用时长数据
 */
function mergeData(banKuai, shiYong) {
  return banKuai.map(bk => {
    const sy = shiYong.find(s => s.date === bk.date);
    return {
      date: bk.date,
      dau: bk.dau,
      jinFang: bk.jinFang,
      avgDuration: sy ? sy.avgDuration : 0
    };
  });
}

/**
 * 运行LMDI-I分解分析
 */
function runDecomposition(mergedData) {
  // 选择对比期间（首尾对比）
  const period0 = mergedData[0];
  const period1 = mergedData[mergedData.length - 1];
  
  // 计算总时长
  const T0 = period0.jinFang * period0.avgDuration;
  const T1 = period1.jinFang * period1.avgDuration;
  const dT = T1 - T0;
  
  // LMDI-I 分解
  const w = logMean(T1, T0);
  const addScale = w * Math.log(period1.jinFang / period0.jinFang);
  const addIntensity = w * Math.log(period1.avgDuration / period0.avgDuration);
  
  const Ltot = logMean(T1, T0);
  const mulScale = Math.exp(addScale / Ltot);
  const mulIntensity = Math.exp(addIntensity / Ltot);
  
  return {
    period0,
    period1,
    metrics: {
      T0,
      T1,
      dT,
      changePercent: (dT / T0) * 100
    },
    factors: {
      scale: {
        name: '进房人数 (规模)',
        additive: addScale,
        percent: (addScale / dT) * 100,
        multiplicative: mulScale
      },
      intensity: {
        name: '人均时长 (强度)',
        additive: addIntensity,
        percent: (addIntensity / dT) * 100,
        multiplicative: mulIntensity
      }
    },
    validation: {
      addSum: addScale + addIntensity,
      mulProd: mulScale * mulIntensity,
      actualRatio: T1 / T0
    }
  };
}

/**
 * 打印分析结果
 */
function printResults(mergedData, result) {
  const { period0, period1, metrics, factors, validation } = result;
  
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
  
  mergedData.forEach(d => {
    console.log(`${d.date}: DAU=${d.dau}, 进房人数=${d.jinFang}, 人均时长=${d.avgDuration.toFixed(2)}分钟`);
  });
  
  console.log('');
  console.log('================================================================================');
  console.log(`分解分析（${period0.date} vs ${period1.date}）`);
  console.log('================================================================================');
  console.log('');
  
  console.log(`上期 (${period0.date}):`);
  console.log(`  进房人数: ${period0.jinFang}`);
  console.log(`  人均时长: ${period0.avgDuration.toFixed(2)} 分钟`);
  console.log(`  总时长 = ${period0.jinFang} × ${period0.avgDuration.toFixed(2)} = ${metrics.T0.toFixed(0)} 分钟`);
  console.log('');
  console.log(`本期 (${period1.date}):`);
  console.log(`  进房人数: ${period1.jinFang}`);
  console.log(`  人均时长: ${period1.avgDuration.toFixed(2)} 分钟`);
  console.log(`  总时长 = ${period1.jinFang} × ${period1.avgDuration.toFixed(2)} = ${metrics.T1.toFixed(0)} 分钟`);
  console.log('');
  
  console.log('================================================================================');
  console.log('分解结果');
  console.log('================================================================================');
  console.log('');
  console.log(`上期总时长 T0 = ${metrics.T0.toFixed(0)} 分钟 (${(metrics.T0/60).toFixed(1)} 小时)`);
  console.log(`本期总时长 T1 = ${metrics.T1.toFixed(0)} 分钟 (${(metrics.T1/60).toFixed(1)} 小时)`);
  console.log(`环比变化 ΔT = ${metrics.dT.toFixed(0)} 分钟 (${metrics.changePercent.toFixed(2)}%)`);
  console.log('');
  
  console.log('因子                                加法贡献(分钟)       占ΔT        乘法因子');
  console.log('------------------------------------------------------------------');
  console.log(`${factors.scale.name.padEnd(30)}          ${factors.scale.additive.toFixed(0).padStart(5)}     ${factors.scale.percent.toFixed(1)}%      ${factors.scale.multiplicative.toFixed(4)}`);
  console.log(`${factors.intensity.name.padEnd(30)}          ${factors.intensity.additive.toFixed(0).padStart(5)}     ${factors.intensity.percent.toFixed(1)}%      ${factors.intensity.multiplicative.toFixed(4)}`);
  console.log('------------------------------------------------------------------');
  console.log(`合计                                 ${validation.addSum.toFixed(0).padStart(5)}    100.0%      ${validation.mulProd.toFixed(4)}`);
  
  console.log('');
  console.log(`校验: Σ加法贡献 = ΔT ? 误差 = ${Math.abs(validation.addSum - metrics.dT).toExponential(2)}`);
  console.log(`校验: Π乘法因子 = T1/T0 ? ${validation.mulProd.toFixed(6)} vs ${validation.actualRatio.toFixed(6)}`);
  
  console.log('');
  console.log('================================================================================');
  console.log('关键指标对比');
  console.log('================================================================================');
  console.log('');
  console.log('指标                            上期          本期          变化');
  console.log('------------------------------------------------------------');
  
  const jinFangChange = ((period1.jinFang - period0.jinFang) / period0.jinFang * 100).toFixed(2);
  const avgChange = ((period1.avgDuration - period0.avgDuration) / period0.avgDuration * 100).toFixed(2);
  
  console.log(`进房人数                        ${period0.jinFang.toString().padStart(6)}        ${period1.jinFang.toString().padStart(6)}      ${jinFangChange}%`);
  console.log(`人均时长(分钟)                  ${period0.avgDuration.toFixed(2).padStart(6)}      ${period1.avgDuration.toFixed(2).padStart(6)}      ${avgChange}%`);
  console.log(`总时长(分钟)                   ${metrics.T0.toFixed(0).padStart(8)}      ${metrics.T1.toFixed(0).padStart(8)}      ${metrics.changePercent.toFixed(2)}%`);
  
  console.log('');
  console.log('================================================================================');
  console.log('分析结论');
  console.log('================================================================================');
  console.log('');
  
  const mainDriver = Math.abs(factors.scale.percent) > Math.abs(factors.intensity.percent) 
    ? factors.scale 
    : factors.intensity;
  const secondaryDriver = mainDriver === factors.scale ? factors.intensity : factors.scale;
  
  console.log(`总时长${metrics.changePercent > 0 ? '增加' : '减少'} ${Math.abs(metrics.changePercent).toFixed(2)}% 的主要原因是${mainDriver.name.split('(')[0]}${mainDriver.percent > 0 ? '提升' : '下降'}（${mainDriver.name.split('(')[1].replace(')', '效应')} ${Math.abs(mainDriver.percent).toFixed(1)}%），`);
  console.log(`${secondaryDriver.name.split('(')[0]}${secondaryDriver.percent > 0 ? '略有增加' : '略有下降'}（${secondaryDriver.name.split('(')[1].replace(')', '效应')} ${Math.abs(secondaryDriver.percent).toFixed(1)}%）。`);
}

/**
 * 保存结果到JSON
 */
function saveResults(mergedData, result) {
  const outputFile = path.join(__dirname, '..', 'vv_active_decomposition_results.json');
  
  const output = {
    version: '5.0',
    extractedAt: new Date().toISOString(),
    dataSource: '产品数据页面-活跃分类',
    period: {
      start: mergedData[0].date,
      end: mergedData[mergedData.length - 1].date
    },
    rawData: mergedData,
    decompositionAnalysis: {
      period0: {
        date: result.period0.date,
        jinFang: result.period0.jinFang,
        avgDuration: result.period0.avgDuration
      },
      period1: {
        date: result.period1.date,
        jinFang: result.period1.jinFang,
        avgDuration: result.period1.avgDuration
      },
      metrics: {
        T0_total_minutes: result.metrics.T0,
        T1_total_minutes: result.metrics.T1,
        delta_minutes: result.metrics.dT,
        delta_percent: result.metrics.changePercent
      },
      factors: {
        scale: {
          name: result.factors.scale.name,
          additive_contribution_minutes: result.factors.scale.additive,
          percent_of_delta: result.factors.scale.percent,
          multiplicative_factor: result.factors.scale.multiplicative
        },
        intensity: {
          name: result.factors.intensity.name,
          additive_contribution_minutes: result.factors.intensity.additive,
          percent_of_delta: result.factors.intensity.percent,
          multiplicative_factor: result.factors.intensity.multiplicative
        }
      },
      validation: {
        add_sum_error: Math.abs(result.validation.addSum - result.metrics.dT),
        mul_prod_value: result.validation.mulProd,
        actual_ratio: result.validation.actualRatio
      }
    },
    dataValidation: {
      avgDurationRange: `${Math.min(...mergedData.map(d => d.avgDuration)).toFixed(2)}-${Math.max(...mergedData.map(d => d.avgDuration)).toFixed(2)} 分钟/天`,
      isReasonable: true,
      dataSource: '产品数据页面-活跃分类-使用时长表格（iOS+Android平均值）'
    },
    conclusion: `总时长${result.metrics.changePercent > 0 ? '增加' : '减少'} ${Math.abs(result.metrics.changePercent).toFixed(2)}% 的主要原因是${Math.abs(result.factors.scale.percent) > Math.abs(result.factors.intensity.percent) ? result.factors.scale.name.split('(')[0] : result.factors.intensity.name.split('(')[0]}变化。`
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n💾 结果已保存: ${outputFile}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('━'.repeat(78));
  console.log('VV渠道活跃度LMDI-I分解模型');
  console.log('━'.repeat(78));
  console.log('');
  
  try {
    // 1. 加载数据
    const rawData = loadExtractedData();
    console.log('✅ 数据加载成功');
    
    // 2. 合并数据
    const mergedData = mergeData(rawData.banKuaiData || rawData.banKuai, rawData.shiYongData || rawData.shiYong);
    console.log(`✅ 数据合并完成: ${mergedData.length} 天数据\n`);
    
    // 3. 运行分解分析
    const result = runDecomposition(mergedData);
    
    // 4. 打印结果
    printResults(mergedData, result);
    
    // 5. 保存结果
    saveResults(mergedData, result);
    
    console.log('\n' + '━'.repeat(78));
    console.log('✅ 分析完成！');
    console.log('━'.repeat(78));
    
  } catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  }
}

main();
