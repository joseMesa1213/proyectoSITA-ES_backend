import "dotenv/config";

const requeridas = ["DATABASE_URL", "JWT_SECRET"];
for (const nombre of requeridas) {
  if (!process.env[nombre]) {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  // Varios orígenes separados por coma: "https://sita-es.onrender.com,http://localhost:5173"
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origen) => origen.trim().replace(/\/$/, ""))
    .filter(Boolean),
  // Inicio de sesión con Google (opcional): sin GOOGLE_CLIENT_ID, /auth/google responde 503
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  // Dominio de correo permitido con Google (sin @). Por defecto, el institucional.
  googleDominio: (process.env.GOOGLE_DOMINIO || "udea.edu.co").trim().toLowerCase().replace(/^@/, ""),
  // Login con correo y contraseña: SOLO para desarrollo (cuentas de la semilla, Postman).
  // Apagado por defecto: en producción se entra únicamente con Google. Solo "true" lo enciende.
  loginContrasena: process.env.LOGIN_CONTRASENA === "true",
};
