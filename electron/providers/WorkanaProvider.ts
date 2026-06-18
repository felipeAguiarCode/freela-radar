import type { FreelaProvider } from './FreelaProvider';
import type { RawOpportunity } from '../services/MatchEngine';

const SAMPLES: RawOpportunity[] = [
  {
    title: 'Plataforma de gestão financeira',
    description: 'SaaS para controle financeiro pessoal e empresarial com React e Node.js.',
    budget_min: 5000, budget_max: 9000, currency: 'BRL',
    source_url: 'https://www.workana.com/job/mock-1',
    raw_tags: ['React', 'Node.js', 'SaaS', 'Dashboard'],
  },
  {
    title: 'API de integração com gateways de pagamento',
    description: 'API REST em Node.js para integrar Stripe, PayPal e Mercado Pago.',
    budget_min: 3000, budget_max: 5000, currency: 'BRL',
    source_url: 'https://www.workana.com/job/mock-2',
    raw_tags: ['API', 'Node.js', 'Integração'],
  },
  {
    title: 'Migração de banco MySQL para PostgreSQL',
    description: 'Migração de dados e procedures de MySQL para PostgreSQL.',
    budget_min: 2500, budget_max: 4500, currency: 'BRL',
    source_url: 'https://www.workana.com/job/mock-3',
    raw_tags: ['PostgreSQL', 'MySQL'],
  },
];

export class WorkanaProvider implements FreelaProvider {
  readonly slug = 'workana';
  readonly name = 'Workana';
  readonly siteUrl = 'https://www.workana.com';

  async authenticate() { return true; }

  async scan(): Promise<RawOpportunity[]> {
    // mock: simula latência de varredura e retorna entre 1 e 3 amostras
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
    const count = 1 + Math.floor(Math.random() * SAMPLES.length);
    return SAMPLES.slice(0, count).map((s) => ({ ...s, source_url: `${s.source_url}-${Date.now()}` }));
  }
}
