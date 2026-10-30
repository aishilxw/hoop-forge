import { env } from 'cloudflare:workers';
import { handleReviewRequest } from '../../../../lib/review-service.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleReviewRequest(request,env);}
