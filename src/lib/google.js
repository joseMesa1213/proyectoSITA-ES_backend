import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

// Verificación del ID token que entrega el botón "Continuar con Google" del frontend.
// Está en su propio archivo para que las pruebas puedan reemplazarlo sin llamar a Google.

const cliente = new OAuth2Client();

/**
 * Comprueba la firma del token con las llaves públicas de Google, que lo emitió Google,
 * que es para NUESTRA app (audience = GOOGLE_CLIENT_ID) y que no está vencido.
 * Devuelve los datos de la cuenta (payload): email, email_verified, hd, given_name, family_name, name.
 * Si el token no es válido, lanza un error (el servicio lo convierte en 401).
 */
export async function verificarCredencialGoogle(credential) {
  const ticket = await cliente.verifyIdToken({ idToken: credential, audience: env.googleClientId });
  return ticket.getPayload();
}
