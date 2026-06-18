import type { FreelaProvider } from './FreelaProvider';
import type { RawOpportunity } from '../services/MatchEngine';

const SAMPLES: RawOpportunity[] = [
  {
    title: 'AI Chatbot for customer support',
    description: 'Build OpenAI-based chatbot integrated with our SaaS support flow.',
    budget_min: 2500, budget_max: 4000, currency: 'USD',
    source_url: 'https://www.upwork.com/job/mock-1',
    raw_tags: ['IA', 'OpenAI', 'Node.js', 'SaaS'],
  },
  {
    title: 'TypeScript engineer for API integrations',
    description: 'Integrate Stripe, Slack and HubSpot into our platform.',
    budget_min: 3000, budget_max: 5000, currency: 'USD',
    source_url: 'https://www.upwork.com/job/mock-2',
    raw_tags: ['TypeScript', 'API', 'Integração'],
  },
];

export class UpworkProvider implements FreelaProvider {
  readonly slug = 'upwork';
  readonly name = 'Upwork';
  readonly siteUrl = 'https://www.upwork.com';

  async authenticate() { return true; }
  async scan(): Promise<RawOpportunity[]> {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
    return SAMPLES.map((s) => ({ ...s, source_url: `${s.source_url}-${Date.now()}` }));
  }
}
