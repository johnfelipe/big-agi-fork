/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import * as z from 'zod/v4';
import { initTRPC, TRPCError } from '@trpc/server';

import { env } from '~/server/env.server';

import { transformer } from './trpc.transformer';
import { TRPCFetcherError } from './trpc.router.fetchers';


/**
 * Type of the Context object passed to procedures/resolvers, to avoid circular dependencies.
 */
export type ChatGenerateContentContext = Awaited<ReturnType<typeof createTRPCFetchContext>>;


/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */
export const createTRPCFetchContext = async ({ req }: FetchCreateContextFnOptions) => {
  // const user = { name: req.headers.get('username') ?? 'anonymous' };
  // return { req, resHeaders };
  return {
    // only used by Backend Analytics
    hostName: req.headers?.get('host') ?? 'localhost',
    // enables cancelling upstream requests when the downstream request is aborted
    reqSignal: req.signal,
    // checked by httpBasicAuthMiddleware, when HTTP Basic Auth is configured
    reqAuthorization: req.headers?.get('authorization') ?? null,
  };
};


/**
 * 2. SERVER-SIDE INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCFetchContext>().create({
  // server transformer - serialize: -> client, deserialize: <- client
  transformer: transformer,
  errorFormatter({ shape, error }) {

    // Important: remove the 'stack' from the error data to avoid leaking internals and shorten the payload
    const { stack, ...nonStackData } = shape.data;

    // Enable client-side decisions: communicate fetcher/network error details downstream
    const fetcherError = error instanceof TRPCFetcherError ? {
      aixFCategory: error.category,
      aixFHttpStatus: error.httpStatus ?? null,
      aixFNetError: error.connErrorName ?? null,
    } : {};

    return {
      ...shape,
      data: {
        ...nonStackData,
        ...fetcherError,
        zodError:
          error.cause instanceof z.ZodError ? z.treeifyError(error.cause) : null,
      },
    };
  },
});

/**
 * HTTP Basic Auth: when HTTP_BASIC_AUTH_USERNAME/PASSWORD are set, every procedure requires matching
 * credentials, independently of the optional Next.js middleware (middleware_BASIC_AUTH.ts).
 * Server-side vendor keys are only honored in this configuration (see env.server.ts).
 */
function _timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}

function _isValidHttpBasicAuth(authorization: string | null, username: string, password: string): boolean {
  if (!authorization?.startsWith('Basic ')) return false;
  let credentials: string;
  try {
    credentials = atob(authorization.slice(6).trim());
  } catch {
    return false;
  }
  const sep = credentials.indexOf(':');
  if (sep < 0) return false;
  const userOk = _timingSafeEqual(credentials.slice(0, sep), username);
  const passOk = _timingSafeEqual(credentials.slice(sep + 1), password);
  return userOk && passOk;
}

const httpBasicAuthMiddleware = t.middleware(({ ctx, next }) => {
  const username = env.HTTP_BASIC_AUTH_USERNAME;
  const password = env.HTTP_BASIC_AUTH_PASSWORD;
  if (username && password && !_isValidHttpBasicAuth(ctx.reqAuthorization, username, password))
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  return next();
});

const baseProcedure = t.procedure.use(httpBasicAuthMiddleware);


/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @link https://trpc.io/docs/v11/router
 */
export const createTRPCRouter = t.router;

/**
 * Public procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. No per-user
 * authorization; only the deployment-wide HTTP Basic Auth check, when configured.
 *
 * @link https://trpc.io/docs/v11/procedures
 */
export const publicProcedure = baseProcedure;

/**
 * Edge procedures for the AI inference Edge network:
 * - AIX streaming endpoints
 * - specific endpoints: Anthropic, Gemini, Ollama, OpenAI
 *
 * Pass-through with service keys inside the request usually. Server-side keys are only used when
 * HTTP Basic Auth is configured (or explicitly allowed anonymously), see env.server.ts.
 */
export const edgeProcedure = baseProcedure;


/**
 * Authenticated users only. - FORWARD-LOOKING: no per-user auth on this branch, same as publicProcedure
 */
export const authedProcedure = baseProcedure;

/**
 * Premium procedure - FORWARD-LOOKING
 */
export const premiumProcedure = baseProcedure;

/**
 * User-feature-gated procedure - FORWARD-LOOKING
 */
export const authGatedProcedure = baseProcedure;

/**
 * Tenant Admin procedure - FORWARD-LOOKING
 */
export const tenantAdminProcedure = baseProcedure;


// /**
//  * Create a server-side caller
//  * @link https://trpc.io/docs/v11/server/server-side-calls
//  */
// export const createCallerFactory = t.createCallerFactory;
