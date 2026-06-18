import type { RawOpportunity } from '../services/MatchEngine';

export interface FreelaProvider {
  readonly slug: string;
  readonly name: string;
  readonly siteUrl: string;
  authenticate(): Promise<boolean>;
  scan(): Promise<RawOpportunity[]>;
}
