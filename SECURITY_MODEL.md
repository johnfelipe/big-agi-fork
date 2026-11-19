# Modelo de amenazas - johnfelipe/big-agi-fork

Fork de enricoros/big-AGI (v2.x). App Next.js 15 local-first: UI en el navegador, chats en IndexedDB, claves de proveedores en localStorage, backend tRPC sin autenticacion en `main` (`src/server/trpc/trpc.server.ts`: todos los procedimientos son `t.procedure`).

## Datos del usuario (Felipe)

- **Despliegue: solo en local (localhost).** El servidor no esta expuesto a internet.
- **Configurado:** claves de LLM en variables de entorno del servidor y Postgres activo (enlaces de chat compartidos, `trade.storage*`).
- **Activos:** todos importan por igual.
- **Fuera de alcance / riesgo aceptado:** nada; todo atacante cuenta.
- **Etiquetas:** Component, CVE, Upstream.
- Historial: los hallazgos altos que afectan a upstream se reportan en privado a enricoros/big-AGI; medios/bajos como PR publicos.

## Componentes

| Componente | Codigo |
|---|---|
| Web client | `pages/`, `src/apps/`, `src/common/` (stores, attachment-drafts, layout), `public/` |
| Blocks | `src/modules/blocks/` (Mermaid, SVG, PlantUML, HTML iframe, markdown), `src/apps/chat/components/live-svg/` |
| AIX/LLM | `app/api/edge/`, `src/modules/aix/`, `src/modules/llms/`, `src/modules/speex/`, `src/modules/t2i/` |
| Browse & fetchers | `app/api/cloud/`, `src/modules/browse/`, `src/modules/youtube/`, `src/modules/google/`, `src/modules/backend/`, `src/server/trpc/trpc.router.fetchers.ts` |
| Share links | `src/modules/trade/`, `src/server/prisma/`, `pages/link/` |
| Infra | `Dockerfile`, `docker-compose.yaml`, `docs/k8s/`, `docs/docker/`, `next.config.ts`, `.github/workflows/` |

## Fronteras de confianza y puntos de entrada

- **Navegador <-> servidor local:** `/api/edge/[trpc]` (AIX, routers LLM, speex, youtube, google, backend) y `/api/cloud/[trpc]` (browse, trade). Sin auth ni comprobacion de Origin/Host. En localhost solo los alcanza el usuario... o cualquier pagina web que visite (peticiones cross-site a `http://localhost:3000`, DNS rebinding).
- **Servidor -> proveedores/hosts:** hosts configurables por el cliente (`ollamaHost`, `oaiHost`, LocalAI, Azure, `wssEndpoint` de browse) -> SSRF hacia la red local del equipo.
- **Contenido no confiable -> origen de la app:** salida de LLM (inyeccion de prompt via paginas navegadas, adjuntos, YouTube), chats compartidos/importados, renderizado en Blocks.
- **CSF:** el navegador llama directo al proveedor con la clave del usuario.

## Activos

- Claves API de los usuarios en localStorage (`app-models`) e historial de chats en IndexedDB: un XSS en el origen las roba.
- Claves de LLM del servidor (env): abuso de cuota si una pagina externa puede disparar peticiones al servidor local.
- Base Postgres de enlaces (contenido, `deletionKey`).
- Red local del equipo (SSRF).

## Atacantes relevantes

1. Autor de contenido malicioso que llega al chat (prompt injection, documentos, paginas navegadas, enlace compartido importado).
2. Sitio web malicioso que el usuario visita mientras big-AGI corre en localhost (CSRF / DNS rebinding contra tRPC).
3. Atacante de red remoto: **no alcanza el servidor directamente** (solo localhost, dato del usuario); solo cuenta a traves de 1 o 2.
4. Cadena de suministro (dependencias npm, CDN de Mermaid, workflows de CI).

## Controles existentes

- Zod en entradas tRPC; `browse` limita URLs a http(s) y valida `ws(s)://`.
- Fixes recientes: SVG/PlantUML/Mermaid saneados con DOMPurify (PR #10, #16), iframe HTML con sandbox de origen opaco via srcdoc (PR #14).
- Docker: usuario no root.

## Preguntas abiertas

- Puerto/host exacto de escucha (127.0.0.1 vs 0.0.0.0 en la LAN).
- Si las claves del servidor tienen limites de gasto en el proveedor.
