import { env } from 'cloudflare:workers';
import { forwardGameAi } from '../../../../lib/game-ai.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return forwardGameAi(request, env); }
