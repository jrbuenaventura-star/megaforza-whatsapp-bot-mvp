# Megaforza WhatsApp Bot - Backend

Node.js (Express) + Prisma + PostgreSQL + Luxon.

## Requisitos
- Node 18+
- PostgreSQL
- Cuenta de WhatsApp Business (Cloud API) con `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`.
- Endpoint público para webhook (puedes usar ngrok para pruebas locales).

## Configuración
1. Copia `.env.example` a `.env` y completa las variables.
2. Instala dependencias:
   ```bash
   npm install
   npx prisma generate
   npm run prisma:dev   # crea tablas
   npm run seed         # carga productos y capacidad
   ```
3. Ejecuta:
   ```bash
   npm run dev
   ```
4. Configura el webhook en Meta con:
   - URL de verificación: `https://TU_DOMINIO/webhook`
   - Verify token = `WHATSAPP_VERIFY_TOKEN`

## Endpoints principales
- `GET /webhook` (verificación)
- `POST /webhook` (recepción)
- `GET /api/health`
- `GET /api/products` | `PATCH /api/products/:id`
- `GET /api/config/capacity` | `POST /api/config/capacity`
- `GET /api/customers?q=` | `POST /api/customers` | `PATCH /api/customers/:id`
- `GET /api/orders?status=` | `POST /api/orders`
- `POST /api/orders/:id/markDelivered`
- `GET /api/reports/pendingByCustomer`

> El webhook acepta pedidos escritos tipo: `LEC-18P x 1200; SUP-GAN x 300` y calcula la fecha/hora de entrega según capacidad.
