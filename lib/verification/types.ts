export type TestCaseVerdict='AC'|'WA'|'TLE'|'MLE'|'RE'|'CE';

export interface ScalingBenchmark {
  inputSizeN:number;
  maxAllowedTimeMs:number;
}

export type AdversarialGeneratorFamily='SORT_PATHOLOGICAL'|'GRAPH_CYCLIC'|'HASH_COLLISION'|'SQL_SKEW_NULLS';

export interface AdversarialGeneratorConfig {
  generatorFamily:AdversarialGeneratorFamily;
  params:Record<string,unknown>;
}

export interface AuthoredQuestionContract {
  id:string;
  domain:string;
  language:'sql'|'python'|'java';
  targetComplexity?:{time:string;space:string};
  scalingBenchmarks:ScalingBenchmark[];
  adversarialGenerators:AdversarialGeneratorConfig[];
}

export interface TestCaseResult{id:string;name:string;isPublic:boolean;status:TestCaseVerdict;executionTimeMs:number;memoryUsedKb:number|null;inputSnippet?:string;expectedOutput?:string;actualOutput?:string;errorMessage?:string}

export interface SubmissionEvaluationReport{
  verdict:'ACCEPTED'|'WRONG_ANSWER'|'TIME_LIMIT_EXCEEDED'|'MEMORY_LIMIT_EXCEEDED'|'RUNTIME_ERROR'|'COMPILE_ERROR';
  allPassed:boolean;
  publicTestsPassed:number;
  publicTestsTotal:number;
  hiddenTestsPassed:number;
  hiddenTestsTotal:number;
  executionTimeMs:number;
  peakMemoryKb:number|null;
  testCases:TestCaseResult[];
  firstFailingTestCase?:TestCaseResult;
  executionDigest:string;
}
