import 'server-only';
import type { ContactInput } from '@/contracts/api';
import { ApiError } from './errors';

const recipientEmail = 'thunder.fang.ecommerce@gmail.com';
const reasons: Record<ContactInput['reason'], string> = {
  products: 'Produtos e sabores', order: 'Pedido demonstrativo',
  partnerships: 'Parcerias', other: 'Outro assunto',
};

function unavailable() {
  return new ApiError(503, 'SERVICE_UNAVAILABLE', 'Não foi possível confirmar o envio da mensagem. Confira antes de tentar novamente.');
}

/** Accepting a request is not proof of delivery to the destination inbox. */
export async function sendContact(input: ContactInput): Promise<{ accepted: true; messageId: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = (process.env.BREVO_SENDER_NAME?.trim() || 'Thunder Fang').replace(/[\r\n\0]/g, ' ').slice(0, 120);
  if (!apiKey || /[\r\n\0]/.test(apiKey) || !senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'O serviço de contato ainda não está disponível.');
  }

  const reason = reasons[input.reason];
  if (!reason) throw new ApiError(400, 'INVALID_INPUT', 'Selecione um motivo de contato válido.', { reason: ['Selecione um motivo de contato válido.'] });
  const replyName = input.name.replace(/[\r\n\0]/g, ' ');
  // Official API supports textContent-only messages; visitor content is never interpolated into HTML.
  // https://developers.brevo.com/docs/send-a-transactional-email
  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: recipientEmail, name: 'Thunder Fang' }],
    replyTo: { email: input.email, name: replyName },
    subject: `Contato — Thunder Fang Energy | ${reason}`,
    textContent: [
      'Mensagem recebida pelo formulário da Thunder Fang Energy.',
      '', `Nome: ${input.name}`, `E-mail: ${input.email}`, `Motivo: ${reason}`,
      '', 'Mensagem:', input.message,
    ].join('\n'),
  };

  try {
    // No retry: an interrupted response can follow an accepted delivery attempt.
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 201) throw unavailable();
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('messageId' in result)
      || typeof result.messageId !== 'string' || !result.messageId.trim()
      || result.messageId.length > 1024 || /[\r\n\0]/.test(result.messageId)) throw unavailable();
    return { accepted: true, messageId: result.messageId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
