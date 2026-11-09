/** Mensagens em português para os erros do Firebase Auth (como no Registro de Horários). */
export function authErrorMsg(e: unknown): string {
  const c = String((e as { code?: string })?.code ?? '');
  if (c.includes('wrong-password') || c.includes('invalid-credential') || c.includes('invalid-login')) return 'E-mail ou senha incorretos.';
  if (c.includes('user-not-found')) return 'Conta não encontrada. As contas de administrador são criadas pelo administrador do sistema.';
  if (c.includes('email-already-in-use')) return 'Este e-mail já tem conta. Use “Entrar” ou “Esqueci minha senha”.';
  if (c.includes('invalid-email')) return 'E-mail inválido.';
  if (c.includes('weak-password')) return 'Senha fraca: use pelo menos 6 caracteres.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (c.includes('network-request-failed')) return 'Sem conexão com a internet.';
  if (c.includes('operation-not-allowed')) return 'Login por e-mail e senha não está ativado no Firebase.';
  return 'Não foi possível concluir (' + (c || 'erro desconhecido') + ').';
}
