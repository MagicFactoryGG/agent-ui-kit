import type { Answer } from './app.contract.d.ts';

export const grants = '';

// The gallery declares no data sources: its sample state is in the ledger.
export const answer: Answer = (source) => {
  throw new Error(`no source ${String(source)}`);
};
