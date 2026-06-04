# NocoClone Database Studio

Una alternativa ligera, autónoma y auto-hospedable (self-hosted) inspirada en NocoDB y Airtable para la gestión visual de bases de datos tabulares, construida sobre un stack moderno y de alto rendimiento utilizando **React 19**, **Vite** y **Node.js/Express**.

Este espacio de trabajo está diseñado de manera modular y segura para gestionar esquemas, visualizar datos en múltiples formatos y facilitar la integración directa con flujos de automatización externos como **n8n**.

---

## 🎨 Características Clave

### 1. Vistas Multidimensionales de Información
*   **Editor de Tabla (Grid View):** Visualización tabular en tiempo real. Soporta búsqueda, ordenación, filtrado y edición instantánea de celdas.
*   **Vista Kanban:** Organización interactiva y ágil de filas basada en columnas select/estado, permitiendo arrastrar y actualizar flujos lógicos de trabajo.
*   **Diccionario de Esquema:** Detalle minucioso de cada columna, sus tipos de datos (Text, Number, Boolean, Date, Dropdown Select, Attachment Files) y la capacidad exclusiva de **Establecer la Columna Identificadora Principal (Primary Key)** de forma dinámica.
*   **Vista Calendario:** Programación temporal de registros correlacionando fechas asignadas en tus filas de datos.

### 2. Gestión de Usuarios y Permisos Integrada
*   **Simulación Multiusuario:** Soporte para múltiples roles concurrentes con sistema de inicio de sesión seguro.
*   **Control de Accesos Dinámico:**
    *   **Administradores:** Control absoluto sobre la edición de esquemas, reconstrucción de tablas, backups y configuración de credenciales del API.
    *   **Lectores / Editores:** Capacidad para visualizar o transaccionar datos en filas sin exponer la integridad del diseño de la base de datos principal.

### 3. API REST Optimizada para n8n e Integraciones
NocoClone provee un motor de endpoints de alto rendimiento para interconexión exterior sin redundancias.
*   **Nombres Humanos Limpios:** Por defecto, las respuestas de consulta devuelven un formato plano y legible (ej: `"Nombre": "Martinez Rufina"`, `"Obra social": "Pami"`).
*   **Control de Vistas mediante Parámetros (`?view=`):**
    *   `?view=human` (Por defecto): Estilo limpio.
    *   `?view=api`: Formato sanitizado en minúsculas y snacks (`"fecha_de_cirugia"`).
    *   `?view=id`: Retorna identificadores físicos internos (`"col_5_0"`).
    *   `?view=all`: El modo enriquecido para soporte de legado completo.
*   **Mapeadores Inteligentes en Inserción (POST/PATCH):** Reconoce de manera automatizada cualquiera de las nomenclaturas para poblar las celdas sin necesidad de duplicar los parámetros en el cuerpo del payload JSON.

### 4. Respaldo y Auditoría Continua
*   **Copias de Seguridad (Backups):** Generación instantánea de respaldos locales y restauración en caliente de cualquier punto en el tiempo.
*   **Bitácora de Auditoría (Audit Logs):** Historial inalterable de todos los cambios de esquema y transacciones de datos registrados en el workspace con marca de tiempo y usuario responsable.

---

## 🚀 Despliegue con Docker

NocoClone Database Studio está preparado para operar de inmediato mediante contenedores. Puedes iniciarlo localmente ejecutando:

```bash
docker-compose up --build
```

El servicio estará disponible en **http://localhost:3000**, con la persistencia local de la base de datos de datos y los archivos adjuntos montados de forma segura en `./nococlone_data`.

---

## 💻 Desarrollo Local

Para ejecutar el entorno de desarrollo local paso a paso:

1. Instalar las dependencias recomendadas:
   ```bash
   npm install
   ```

2. Ejecutar el servidor de desarrollo híbrido (Express + Vite) en vivo:
   ```bash
   npm run dev
   ```

3. Compilar los artefactos listos para producción para un despliegue optimizado en la nube:
   ```bash
   npm run build
   ```

---

## 🔒 Arquitectura Tecnológica y Persistencia

*   **Front-end:** SPA enriquecido con React 19, componentes estilizados de forma quirúrgica usando Tailwind CSS, iconos integrados de Lucide-React y transiciones fluidas.
*   **Back-end:** Servidor Express montado sobre Node.js con soporte para compilación robusta en CommonJS (`dist/server.cjs`) para cold-starts ultrarrápidos y portabilidad absoluta.
*   **Persistencia:** Canal de almacenamiento síncrono local que garantiza la durabilidad transparente de los datos en disco, apto para entornos escalables y copias de seguridad de un solo clic.
