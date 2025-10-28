/**
 * 数字格式化工具
 * 解决 JavaScript 浮点数显示为 0.899999999999 等问题
 * 仅在展示层做舍入，不改变内部计算精度
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0';
  // 使用 EPSILON 避免 0.1+0.2 等边界误差
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  // 去掉多余的尾随 0
  return rounded.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

