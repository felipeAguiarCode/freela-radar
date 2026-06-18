import type { FreelaProvider } from './FreelaProvider';
import type { RawOpportunity } from '../services/MatchEngine';

const SAMPLES: RawOpportunity[] = [
  {
    title: 'Real-time metrics dashboard',
    description: 'React + WebSocket dashboard with live charts.',
    budget_min: 2000, budget_max: 3000, currency: 'USD',
    source_url: 'https://remoteok.com/job/mock-1',
    raw_tags: ['React', 'Charts', 'WebSocket', 'Dashboard'],
  },
];

export class RemoteOKProvider implements FreelaProvider {
  readonly slug = 'remoteok';
  readonly name = 'RemoteOK';
  readonly siteUrl = 'https://remoteok.com';

  async authenticate() { return true; }
  async scan(): Promise<RawOpportunity[]> {
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
    return SAMPLES.map((s) => ({ ...s, source_url: `${s.source_url}-${Date.now()}` }));
  }
}
