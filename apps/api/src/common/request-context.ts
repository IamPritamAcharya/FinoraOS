import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(context: RequestContext, callback: () => T) {
    return storage.run(context, callback);
  },
  get() {
    return storage.getStore();
  },
};
