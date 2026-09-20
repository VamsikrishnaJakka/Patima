export type TargetComplexity = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)';

export interface BenchmarkMeasurement {
  n: number;
  timeMs: number;
  memoryKb?: number | null;
}

export interface ComplexityVerdict {
  passed: boolean;
  measurements: BenchmarkMeasurement[];
  reason?: string;
}

const exponentLimit: Record<TargetComplexity, number> = {
  'O(1)': 0.35,
  'O(log n)': 0.75,
  'O(n)': 1.35,
  'O(n log n)': 1.65,
  'O(n^2)': 2.25,
};

export function evaluateEmpiricalComplexity(
  measurements: BenchmarkMeasurement[],
  targetComplexity: TargetComplexity,
): ComplexityVerdict {
  const sorted = [...measurements].filter(m => m.n > 0 && m.timeMs >= 0).sort((a,b)=>a.n-b.n);
  if (sorted.length < 2) return {passed:true,measurements:sorted};

  const first = sorted[0];
  const last = sorted[sorted.length-1];
  const nRatio = last.n / first.n;
  const timeRatio = Math.max(1,last.timeMs) / Math.max(1,first.timeMs);
  const observedExponent = Math.log(timeRatio) / Math.log(nRatio);
  const allowed = exponentLimit[targetComplexity];

  // This is empirical evidence, not a proof of Big-O. It deliberately uses
  // multiple authored N values and rejects curves materially above the target.
  if (observedExponent > allowed && last.timeMs > 250) {
    return {
      passed:false,
      measurements:sorted,
      reason:`Observed scaling exponent ${observedExponent.toFixed(2)} exceeds the ${targetComplexity} envelope (${allowed.toFixed(2)}). N grew ${nRatio.toFixed(1)}x while time grew ${timeRatio.toFixed(1)}x.`,
    };
  }

  return {passed:true,measurements:sorted};
}
