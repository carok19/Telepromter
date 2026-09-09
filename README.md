# Robress Teleprompter

Teleprompter profesional, optimizado inicialmente para teleprompters caseros de vidrio reflectivo.

## Estado

Proyecto en **Fase 0 (setup)**. Ver historial de commits y reportes de fase para el detalle de qué está implementado.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Dexie (IndexedDB) — persistencia local
- Zustand — estado global
- React Router
- vite-plugin-pwa (instalado, se configura en Fase 5)

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # typecheck + build de producción
npm run lint     # oxlint
npm run preview  # sirve el build de producción
```

## Arquitectura

```
src/
  engine/       # TeleprompterEngine, CalibrationEngine (independientes de la UI)
  stores/       # estado global (Zustand)
  db/           # esquema de persistencia local (Dexie)
  hooks/        # useFullscreen, useIdleControls, useWakeLock
  components/   # componentes de UI agrupados por área funcional
  pages/        # una página por ruta
  router.tsx    # definición de rutas
```
