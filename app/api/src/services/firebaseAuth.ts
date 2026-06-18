import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { firebase, firebaseConfigured } from "../config.js";

let app: App | null = null;

function getApp(): App {
  if (!firebaseConfigured) throw new Error("Firebase not configured on the server");
  if (!app) {
    app = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: firebase.projectId,
        clientEmail: firebase.clientEmail,
        privateKey: firebase.privateKey,
      }),
    });
  }
  return app;
}

// Verify a Firebase ID token (from client phone auth) and return the verified phone number.
export async function verifyFirebasePhone(idToken: string): Promise<string> {
  const decoded = await getAuth(getApp()).verifyIdToken(idToken);
  const phone = decoded.phone_number;
  if (!phone) throw new Error("Token has no verified phone number");
  return phone;
}
