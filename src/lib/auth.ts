import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const TOKEN_KEY = 'gsheets_oauth_token';
const TOKEN_EXP_KEY = 'gsheets_oauth_token_exp';

// Reuse existing app if initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Sheets Workspace scope for reading catalogs & saving approved yields
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const exp = localStorage.getItem(TOKEN_EXP_KEY);
    if (!token) return null;
    // Check if expired (with 3-minute grace period)
    if (exp && Date.now() > Number(exp)) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const saveStoredAccessToken = (token: string, expiresInSeconds = 3600) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    const expiresAt = Date.now() + (expiresInSeconds - 120) * 1000;
    localStorage.setItem(TOKEN_EXP_KEY, String(expiresAt));
    cachedAccessToken = token;
  } catch (err) {
    console.error('Error saving stored access token:', err);
  }
};

export const clearStoredAccessToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
    cachedAccessToken = null;
  } catch (err) {
    console.error('Error clearing access token:', err);
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check stored token immediately for instant seamless connection
  const storedToken = getStoredAccessToken();
  if (storedToken) {
    cachedAccessToken = storedToken;
    if (auth.currentUser && onAuthSuccess) {
      onAuthSuccess(auth.currentUser, storedToken);
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || getStoredAccessToken();
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        // User is logged in to Firebase but needs token refresh
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (!cachedAccessToken && !getStoredAccessToken()) {
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Sheets.');
    }

    saveStoredAccessToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Error al iniciar sesión con Google:', error);
    if (
      error?.code === 'auth/unauthorized-domain' ||
      String(error?.message || '').includes('unauthorized-domain')
    ) {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'vercel.app';
      const enhancedError: any = new Error(
        `El dominio actual (${currentHost}) no está autorizado en Firebase Authentication. Agrega "${currentHost}" a los Dominios Autorizados de Firebase.`
      );
      enhancedError.code = 'auth/unauthorized-domain';
      enhancedError.isUnauthorizedDomain = true;
      enhancedError.domain = currentHost;
      enhancedError.projectId = firebaseConfig.projectId;
      throw enhancedError;
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || getStoredAccessToken();
};

export const setCachedAccessToken = (token: string | null) => {
  if (token) {
    saveStoredAccessToken(token);
  } else {
    clearStoredAccessToken();
  }
};

export const logout = async () => {
  await signOut(auth);
  clearStoredAccessToken();
};

