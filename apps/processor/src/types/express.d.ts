import type { Processor } from '@nihilium/core';
import type { QuorumEvidenceStore } from '../evidence';

declare global {
  namespace Express {
    interface Locals {
      processor: Processor;
      evidenceStore: QuorumEvidenceStore;
    }
  }
}

export {};
