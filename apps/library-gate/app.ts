import type { Answer } from './app.contract.d.ts';

export const grants = '';

// The gate declares no data sources: every cell's values are in app.contract.
export const answer: Answer = (source) => {
  throw new Error(`no source ${String(source)}`);
};
