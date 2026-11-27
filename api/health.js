import { handleVercelRequest } from '../server/vercel-api.mjs';
export default { fetch: request => handleVercelRequest(request,'health') };
