/* Any other /api/* path: a JSON 404 instead of the SPA's index.html. */
import type { Fn } from '../../server/env';
import { fail } from '../../server/http';

export const onRequest: Fn = async () => fail('not_found', 404);
