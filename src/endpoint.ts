import type { APIRoute } from 'astro';
import { createEdgeLabyrinthHandler } from './edge.js';
import type { EdgeLabyrinthOptions } from './types.js';

export const prerender = false;

export function createLabyrinthEndpoint(options?: EdgeLabyrinthOptions): APIRoute {
  const handler = createEdgeLabyrinthHandler(options);

  return async (context) => {
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

    const isHead = (context.request.method ?? 'GET').toUpperCase() === 'HEAD';
    return new Response(isHead ? null : 'Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  };
}

export const GET: APIRoute = createLabyrinthEndpoint();
export const HEAD: APIRoute = GET;
