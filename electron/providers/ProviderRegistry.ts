import type { FreelaProvider } from './FreelaProvider';
import { WorkanaProvider } from './WorkanaProvider';
import { NoveNoveFreelasProvider } from './NoveNoveFreelasProvider';
import { FreelancerProvider } from './FreelancerProvider';
import { UpworkProvider } from './UpworkProvider';
import { RemoteOKProvider } from './RemoteOKProvider';

class Registry {
  private providers = new Map<string, FreelaProvider>();

  constructor() {
    this.register(new WorkanaProvider());
    this.register(new NoveNoveFreelasProvider());
    this.register(new FreelancerProvider());
    this.register(new UpworkProvider());
    this.register(new RemoteOKProvider());
  }

  register(p: FreelaProvider) {
    this.providers.set(p.slug, p);
  }

  get(slug: string): FreelaProvider | undefined {
    return this.providers.get(slug);
  }

  all(): FreelaProvider[] {
    return [...this.providers.values()];
  }
}

export const ProviderRegistry = new Registry();
