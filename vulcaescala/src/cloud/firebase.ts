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

/** Carrega o SDK em segundo plano (padrão dos apps CTV). Nunca bloqueia o uso local. */
export function loadFirebase(): Promise<FirebaseApi> {
  if (!loading) {
    loading = (async () => {
      const [appMod, authMod, fsMod] = (await Promise.all([
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-app.js'),
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-auth.js'),
        import(/* @vite-ignore */ FIREBASE_SDK + 'firebase-firestore.js'),
      ])) as [typeof AppMod, typeof AuthMod, typeof FsMod];
      const app = appMod.initializeApp(firebaseConfig, 'vulcaescala-amt');
      const auth = authMod.getAuth(app);
      const emu = emulatorHost();
      let fs: FsMod.Firestore;
      if (emu) {
        authMod.connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
        fs = fsMod.getFirestore(app);
        fsMod.connectFirestoreEmulator(fs, emu, 8085);
      } else {
        // cache offline do próprio Firestore (IndexedDB), como nos demais apps
        fs = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache() });
      }
      return { auth, fs, authMod, fsMod };
    })();
    loading.catch(() => {
      loading = null; // permite tentar de novo depois
    });
  }
  return loading;
}
