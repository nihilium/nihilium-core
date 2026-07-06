import type { Processor } from '@nihilium/core';
import type { QuorumEvidenceStore } from '../evidence';
import type { PaymentContext, PaymentVerifier } from '../payment/types';

declare global {
  namespace Express {
    interface Locals {
      processor: Processor;
      evidenceStore: QuorumEvidenceStore;
      paymentVerifier?: PaymentVerifier;
      payment?: PaymentContext;
    }
  }
}

export {};

