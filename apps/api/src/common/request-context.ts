import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestPrincipal } from '@finora/platform';

type RequestContext = { requestId: string; principal?: RequestPrincipal };

const storage = new AsyncLocalStorage<RequestContext>();

// Carries request identity through async work without passing it through every service signature.
export const requestContext = {
  run<T>(context: RequestContext, callback: () => T) {
    return storage.run(context, callback);
  },
  get() {
    return storage.getStore();
  },
};
