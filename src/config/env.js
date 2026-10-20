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
};
