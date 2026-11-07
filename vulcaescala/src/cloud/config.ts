/* ══════════════ FIREBASE — CONTRATO AMT (projeto próprio, separado do Suzano) ══════════════
   Cole aqui os 6 valores do projeto Firebase do AMT
   (Console Firebase → Configurações do projeto → Seus apps → Web).
   Esses valores são públicos por natureza; quem protege os dados são as regras
   do Firestore (firebase/firestore.rules). Sem config → modo local (só neste aparelho). */
const realConfig = {
  apiKey: 'AIzaSyAkW2iyZgB_pSruPBQ03QySq8CwAhis8Jc',
  authDomain: 'vulcaescala-amt.firebaseapp.com',
  projectId: 'vulcaescala-amt',
  storageBucket: 'vulcaescala-amt.firebasestorage.app',
  messagingSenderId: '265495118168',
  appId: '1:265495118168:web:4d303b48c23c8cc7ade52d',
};

/** Teste local com o emulador do Firebase: localStorage 'vulcaescala:emulador' = '127.0.0.1'.
 *  Só afeta o navegador onde foi ativado; os dados vão para o emulador local. */
export function emulatorHost(): string | null {
  try {
    return localStorage.getItem('vulcaescala:emulador');
  } catch {
    return null;
  }
}

export const firebaseConfig = emulatorHost()
  ? { ...realConfig, apiKey: 'demo-key', projectId: 'demo-vulcaescala', authDomain: 'demo-vulcaescala.firebaseapp.com' }
  : realConfig;

export function isConfigured(cfg: { apiKey: string; projectId: string } = firebaseConfig): boolean {
  const k = cfg.apiKey;
  const p = cfg.projectId;
  return !!(k && p && !/^COLE_AQUI/.test(k) && !/^COLE_AQUI/.test(p));
}

/** Administradores: gerenciam quem tem acesso. Manter igual à lista em firebase/firestore.rules. */
export const ADMIN_EMAILS = [
  'plantao.amt@benetechbrasil.com.br',
  'glauber.dutra@benetechbrasil.com.br',
  'warley.silva@benetechbrasil.com.br',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Mesma versão do SDK usada nos demais apps CTV. */
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
