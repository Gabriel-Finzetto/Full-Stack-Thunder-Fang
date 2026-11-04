import { apiRoute, readJson } from '@/server/http';
import { contactSchema } from '@/server/schemas';
import { sendContact } from '@/server/contact';
export const runtime = 'nodejs';
export const POST = apiRoute(async request => Response.json(await sendContact(await readJson(request, contactSchema)), { status: 202 }), { mutation: true, rate: 'contact' });
