import type { Answer } from './app.contract.d.ts';

export const grants = '';

// The journeys declare no data sources: their state is in the ledger.
export const answer: Answer = (source) => {
  throw new Error(`no source ${String(source)}`);
};
