import type { FreelaProvider } from './FreelaProvider';
import type { RawOpportunity } from '../services/MatchEngine';

const SAMPLES: RawOpportunity[] = [
  {
    title: 'App desktop para automação de processos',
    description: 'Electron + TypeScript para automatizar tarefas internas.',
    budget_min: 3500, budget_max: 6000, currency: 'BRL',
    source_url: 'https://www.freelancer.com/job/mock-1',
    raw_tags: ['Electron', 'TypeScript', 'Desktop', 'Automação'],
  },
  {
    title: 'Dashboard administrativo com IA',
    description: 'Painel admin com insights gerados por IA.',
    budget_min: 4000, budget_max: 7000, currency: 'BRL',
    source_url: 'https://www.freelancer.com/job/mock-2',
    raw_tags: ['React', 'IA', 'Dashboard', 'SaaS'],
  },
];

export class FreelancerProvider implements FreelaProvider {
  readonly slug = 'freelancer';
  readonly name = 'Freelancer.com';
  readonly siteUrl = 'https://www.freelancer.com';

  async authenticate() { return true; }
  async scan(): Promise<RawOpportunity[]> {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    return SAMPLES.map((s) => ({ ...s, source_url: `${s.source_url}-${Date.now()}` }));
  }
}
