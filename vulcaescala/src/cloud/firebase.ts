import type * as AppMod from 'firebase/app';
import type * as AuthMod from 'firebase/auth';
import type * as FsMod from 'firebase/firestore';
import { FIREBASE_SDK, emulatorHost, firebaseConfig } from './config';

/** Módulos do SDK + instâncias. Mesmo formato vindo do gstatic (produção) ou do npm (testes). */
export interface FirebaseApi {
  auth: AuthMod.Auth;
  fs: FsMod.Firestore;
  authMod: typeof AuthMod;
  fsMod: typeof FsMod;
}

let loading: Promise<FirebaseApi> | null = null;
let appModRef: typeof AppMod | null = null;

/** Carrega o SDK em segundo plano (padrão dos apps CTV). Nunca bloqueia o uso local. */
export function loadFirebase(): Promise<FirebaseApi> {
  if (!loading) {
    loading = (async () => {
      const [appMod, authMod, fsMod] = (await Promise.all([
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-app.js'),
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-auth.js'),
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-firestore.js'),
      ])) as [typeof AppMod, typeof AuthMod, typeof FsMod];
      appModRef = appMod;
      const app = appMod.initializeApp(firebaseConfig, 'vulcaescala-amt');
      const auth = authMod.getAuth(app);
      const emu = emulatorHost();
      let fs: FsMod.Firestore;
      if (emu) {
        authMod.connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
        fs = fsMod.getFirestore(app);
        fsMod.connectFirestoreEmulator(fs, emu, 8085);
      } else {
        // cache offline do próprio Firestore (IndexedDB), como nos demais apps;
        // várias abas: escala e emenda podem ficar abertas ao mesmo tempo
        fs = fsMod.initializeFirestore(app, {
          localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
        });
      }
      return { auth, fs, authMod, fsMod };
    })();
    loading.catch(() => {
      loading = null; // permite tentar de novo depois
    });
  }
  return loading;
}

/**
 * Cria uma conta de e-mail/senha numa instância SEPARADA do Firebase (memória), para o
 * administrador cadastrar outra pessoa sem perder a própria sessão.
 */
export async function criarContaSeparada(email: string, senha: string): Promise<void> {
  const api = await loadFirebase();
  if (!appModRef) throw new Error('SDK do Firebase não carregado');
  const app2 = appModRef.initializeApp(firebaseConfig, `cadastro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const auth2 = api.authMod.initializeAuth(app2, { persistence: api.authMod.inMemoryPersistence });
    const emu = emulatorHost();
    if (emu) api.authMod.connectAuthEmulator(auth2, `http://${emu}:9099`, { disableWarnings: true });
    await api.authMod.createUserWithEmailAndPassword(auth2, email, senha);
    await api.authMod.signOut(auth2);
  } finally {
    await appModRef.deleteApp(app2).catch(() => {});
  }
}
