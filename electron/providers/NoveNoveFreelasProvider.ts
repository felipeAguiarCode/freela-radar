import type { FreelaProvider } from './FreelaProvider';
import type { RawOpportunity } from '../services/MatchEngine';

const SAMPLES: RawOpportunity[] = [
  {
    title: 'API REST para integração com ERP',
    description: 'Integração entre sistema interno e ERP via API REST. Node.js + PostgreSQL.',
    budget_min: 2500, budget_max: 4500, currency: 'BRL',
    source_url: 'https://www.99freelas.com.br/job/mock-1',
    raw_tags: ['API', 'Node.js', 'PostgreSQL', 'Integração'],
  },
  {
    title: 'Sistema de relatórios em React',
    description: 'Dashboard com filtros e exportação CSV/PDF.',
    budget_min: 2000, budget_max: 3500, currency: 'BRL',
    source_url: 'https://www.99freelas.com.br/job/mock-2',
    raw_tags: ['React', 'Dashboard', 'TypeScript'],
  },
];

export class NoveNoveFreelasProvider implements FreelaProvider {
  readonly slug = '99freelas';
  readonly name = '99Freelas';
  readonly siteUrl = 'https://www.99freelas.com.br';

  async authenticate() { return true; }
  async scan(): Promise<RawOpportunity[]> {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 700));
    return SAMPLES.map((s) => ({ ...s, source_url: `${s.source_url}-${Date.now()}` }));
  }
}
