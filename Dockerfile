# --- Etapa de Compilación ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json tsconfig.json vite.config.ts index.html ./

# Instalar todas las dependencias
RUN npm ci

# Copiar código fuente
COPY src/ ./src/
COPY server.ts ./

# Compilar tanto el frontend de React con Vite como el backend con esbuild
RUN npm run build

# --- Etapa de Producción (Ligera) ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar metadatos para que se reconozca el proyecto y dependencias de producción
COPY package*.json ./

# Instalar solo dependencias de producción (express, etc.)
RUN npm ci --omit=dev

# Copiar la aplicación compilada (React static en dist/ y backend express compilado en dist/server.cjs)
COPY --from=builder /app/dist ./dist

# Crear el directorio donde se montará el volumen persistente de la base de datos
RUN mkdir -p data

# Exponer el puerto de comunicación
EXPOSE 3000

# Comando para ejecutar la base de datos distribuida
CMD ["node", "dist/server.cjs"]
