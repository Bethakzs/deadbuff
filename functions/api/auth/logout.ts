/* POST /api/auth/logout → clears the session cookies (sessions are stateless, nothing to delete). */
import type { Fn } from '../../../server/env';
import { fail, json, sameOrigin } from '../../../server/http';
import { clearCookies } from '../../../server/session';

export const onRequestPost: Fn = async ({ request }) => {
  if (!sameOrigin(request)) return fail('bad_origin', 403);
  return json({ ok: true }, {}, clearCookies());
};
