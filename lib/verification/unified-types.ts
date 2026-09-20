export type EngineMode='RUN'|'RUN_TESTS'|'SUBMIT';
export type UnifiedTestStatus='AC'|'WA'|'TLE'|'MLE'|'RE'|'CE';

export interface DiffLocation{
  rowIndex:number;
  columnName:string;
  expectedValue:string;
  actualValue:string;
}

export interface UnifiedCase{
  id:string;
  name:string;
  isPublic:boolean;
  status:UnifiedTestStatus;
  executionTimeMs:number;
  inputFixturePreview?:{columns:string[];rows:Record<string,unknown>[]};
  expectedOutputPreview?:{columns:string[];rows:Record<string,unknown>[]};
  actualOutputPreview?:{columns:string[];rows:Record<string,unknown>[]};
  diff?:DiffLocation;
  diagnosticAdvice?:string;
  errorMessage?:string;
}

export interface UnifiedEngineResponse{
  mode:EngineMode;
  verdict:'ACCEPTED'|'WRONG_ANSWER'|'COMPILE_ERROR'|'RUNTIME_ERROR'|'TIME_LIMIT_EXCEEDED'|'MEMORY_LIMIT_EXCEEDED';
  runtimeMs:number;
  summary:{passed:number;total:number;publicPassed:number;publicTotal:number;hiddenPassed:number;hiddenTotal:number};
  cases:UnifiedCase[];
  sqlAnalysis?:{singleStatement:boolean;allowedTablesOnly:boolean;detectedClauses:string[];performanceObservation?:string;complexity?:{theoreticalTime:'O(n)'|'O(n log n)'|'O(n^2)';theoreticalSpace:'O(1)'|'O(n)';rationale:string};partitionKeys?:string[];orderKeys?:string[];windowFrameExplicit?:boolean;hasUnboundedPreceding?:boolean;observations?:string[];codeSmells?:string[]};
  executionDigest:string;
  nextStepAvailable:boolean;
}
