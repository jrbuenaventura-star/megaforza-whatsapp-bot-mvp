# Megaforza WhatsApp Bot MVP

Este repositorio contiene:
- `backend/`: Webhook de WhatsApp, API de gestión, scheduling por capacidad, Prisma/PostgreSQL.
- `admin/`: Panel (Next.js) para precios, clientes, pedidos, capacidad y pendientes.

## Pasos rápidos (local)
1. **Database**: crea una base PostgreSQL y copia la URL en `backend/.env` (usa `.env.example`).
2. **Backend**:
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run prisma:dev
   npm run seed
   npm run dev
   ```
3. **Admin**:
   ```bash
   cd ../admin
   npm install
   cp .env.local.example .env.local
   npm run dev
   ```
4. **WhatsApp (Cloud API)**:
   - Configura el webhook a `https://TU_DOMINIO/webhook` con el `WHATSAPP_VERIFY_TOKEN`.
   - Envía un mensaje desde WhatsApp al número empresarial **+57 315 897 3462**.
   - Puedes hacer un pedido escribiendo: `LEC-18P x 1200; SUP-GAN x 300`.

> Carga los **precios** desde el panel y configura **capacidades** para agendar correctamente.

## Producción
- Sube el backend a un VPS o a un servicio gestionado. El admin puede ir en Vercel.
- Sustituye la lógica de almacenamiento local de archivos por un servicio como S3 o Supabase Storage.
- Agrega autenticación al panel y plantillas HSM aprobadas en Meta.
