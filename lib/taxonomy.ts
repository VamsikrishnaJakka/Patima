export interface CapabilityTaxonomyNode {
  slug: string;
  name: string;
  domain: string;
}

export const CANONICAL_CAPABILITY_TAXONOMY: CapabilityTaxonomyNode[] = [
  {slug:'sql.window_functions', name:'SQL Window Functions', domain:'Analytics & SQL'},
  {slug:'python.concurrency.rate_limiter', name:'Python Concurrency & Rate Limiting', domain:'Backend Engineering'},
  {slug:'distributed_systems.consensus.raft', name:'Distributed Consensus (Raft)', domain:'Distributed Systems'},
  {slug:'data_engineering.streaming', name:'Stream Processing & Deduplication', domain:'Data Engineering'},
];
