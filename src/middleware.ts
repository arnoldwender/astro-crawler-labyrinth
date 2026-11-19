import type { MiddlewareHandler } from 'astro';
import { createEdgeLabyrinthHandler } from './edge.js';
import type { EdgeLabyrinthOptions } from './types.js';

export function createLabyrinthMiddleware(options?: EdgeLabyrinthOptions): MiddlewareHandler {
  const handler = createEdgeLabyrinthHandler(options);

  return async (context, next) => {
    if ((context as { isPrerendered?: boolean }).isPrerendered) {
      return next();
    }

    let clientAddress: string | undefined;
    try {
      clientAddress = context.clientAddress;
    } catch {
      clientAddress = undefined;
    }

    const response = await handler(context.request, clientAddress);
    if (response) {
      return response;
    }
    return next();
  };
}

export const onRequest: MiddlewareHandler = createLabyrinthMiddleware();
