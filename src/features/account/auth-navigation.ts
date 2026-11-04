import { isLocale, type Locale } from '@/i18n/config';

const destinations = new Set(['/carrinho', '/checkout', '/pedidos', '/conta', '/conta#meus-pedidos', '/conta#meu-perfil', '/conta#entrega-padrao', '/conta/meus-dados', '/perfil']);
export const confirmationDestination = '/carrinho';
export function safeReturn(value: string | null | undefined): string {
  return value && destinations.has(value) ? value : '/conta';
}
/** Confirmation always resumes the cart, including callbacks from older emails. */
export function emailReturn(value: string | null | undefined, flow: 'confirm' | 'recovery'): string {
  return flow === 'confirm' ? confirmationDestination : safeReturn(value);
}
export function authLocale(value: string | null | undefined): Locale { return isLocale(value) ? value : 'pt-BR'; }
export function localizedAuthPath(locale: Locale, path: string): string { return `/${locale}${path}`; }

/** Provider diagnostics never become UI content, including any raw address or token. */
export function authErrorMessage(error: { code?: string; status?: number } | null | undefined): string {
  if (error?.status === 429 || ['over_request_rate_limit','over_email_send_rate_limit','rate_limit_exceeded'].includes(error?.code ?? '')) return 'Aguarde antes de tentar novamente.';
  switch (error?.code) {
    case 'invalid_credentials': return 'E-mail ou senha inválidos.';
    case 'email_not_confirmed': return 'Confirme seu e-mail antes de entrar.';
    case 'user_already_exists': case 'email_exists': return 'Já existe uma conta com este e-mail.';
    case 'weak_password': return 'A senha não atende aos requisitos de segurança.';
    case 'same_password': return 'Escolha uma senha diferente da anterior.';
    case 'otp_expired': case 'otp_disabled': case 'flow_state_not_found': case 'flow_state_expired': return 'Este link é inválido ou expirou. Solicite outro link.';
    default: return !error?.status || error.status >= 500 ? 'O serviço de acesso está temporariamente indisponível.' : 'Não foi possível concluir a solicitação. Tente novamente.';
  }
}
