import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContactInput } from '../src/contracts/api';
import { sendContact } from '../src/server/contact';

const input: ContactInput = { name: 'Visitante de teste', email: 'visitor@example.test', reason: 'products', message: 'Quero conhecer os sabores.' };
function configure() {
  vi.stubEnv('BREVO_API_KEY', 'test-provider-key');
  vi.stubEnv('BREVO_SENDER_EMAIL', 'verified@example.test');
  vi.stubEnv('BREVO_SENDER_NAME', 'Thunder Fang');
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('transporte de contato', () => {
  it('não tenta enviar quando o transporte não está configurado', async () => {
    vi.stubEnv('BREVO_API_KEY', ''); vi.stubEnv('BREVO_SENDER_EMAIL', '');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fixa o destinatário, usa replyTo e preserva a mensagem como texto sem permitir sobrescrita', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ messageId: '<provider-confirmed-id>' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const hostile = { ...input, message: '<script>alert(1)</script>', to: [{ email: 'other@example.test' }], recipient: 'other@example.test' };
    await expect(sendContact(hostile)).resolves.toEqual({ accepted: true, messageId: '<provider-confirmed-id>' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(options.body);
    expect(payload.to).toEqual([{ email: 'thunder.fang.ecommerce@gmail.com', name: 'Thunder Fang' }]);
    expect(payload.sender.email).toBe('verified@example.test');
    expect(payload.replyTo).toEqual({ email: input.email, name: input.name });
    expect(payload.textContent).toContain(hostile.message);
    expect(payload).not.toHaveProperty('htmlContent');
    expect(payload).not.toHaveProperty('headers');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([{}, { messageId: '' }, { messageId: '  ' }, { messageIds: ['one', 'two'] }, { messageId: 42 }])('não declara sucesso sem um ID confirmado: %j', async result => {
    configure(); const fetchMock = vi.fn().mockResolvedValue(Response.json(result, { status: 201 })); vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 429, 500])('não anuncia envio nem repete a tentativa após HTTP %s', async status => {
    configure(); const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: 'provider detail must not leak' }, { status })); vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trata timeout e resultado desconhecido sem repetir a mensagem', async () => {
    configure(); const fetchMock = vi.fn().mockRejectedValue(new DOMException('Provider timing detail', 'TimeoutError')); vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não transforma uma resposta inválida em envio aceito', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 201 })));
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('recusa remetente inválido sem chamar o provedor', async () => {
    configure(); vi.stubEnv('BREVO_SENDER_EMAIL', 'sender@example.test\nBcc:other@example.test');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(input)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
