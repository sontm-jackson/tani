import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const env = (import.meta as any).env ?? {};
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
};

// When Firebase is configured, the app uses Firebase Phone Auth for OTP.
// Otherwise it falls back to the backend dev OTP (code shown on screen).
export const firebaseEnabled = Boolean(cfg.apiKey);
export const auth: Auth | null = firebaseEnabled ? getAuth(initializeApp(cfg)) : null;
