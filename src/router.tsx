import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Layout } from './components/shared/Layout'
import { RootShell } from './components/shared/RootShell'
import { LibraryPage } from './pages/LibraryPage'
import { FolderPage } from './pages/FolderPage'
import { EditorPage } from './pages/EditorPage'
import { TeleprompterPage } from './pages/TeleprompterPage'
import { GlassTestPage } from './pages/GlassTestPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage } from './pages/HelpPage'
import { RemoteJoinPage } from './pages/RemoteJoinPage'
import { RemoteControlPage } from './pages/RemoteControlPage'

export const router = createBrowserRouter([
  {
    // F8.6 (PWA): capa raíz sin path propio, solo para montar
    // <UpdateBanner /> (dentro de RootShell) por encima de las tres ramas
    // de abajo (Layout, /remote y /teleprompter son hermanas entre sí) sin
    // duplicarlo en cada una ni tocar Layout.tsx.
    element: <RootShell />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          // Rediseño de Biblioteca: la app abre siempre en la cuadrícula de
          // carpetas (Nivel 1), nunca en una pantalla de bienvenida aparte.
          { index: true, element: <Navigate to="/guiones" replace /> },
          { path: 'guiones', element: <LibraryPage /> },
          // Nivel 2: contenido de una carpeta. :folderId es un número, o el
          // literal 'sin-carpeta' para el cajón fijo (ver FolderPage.tsx).
          { path: 'guiones/:folderId', element: <FolderPage /> },
          { path: 'editor', element: <EditorPage /> },
          { path: 'editor/:id', element: <EditorPage /> },
          { path: 'glass-test', element: <GlassTestPage /> },
          // Alias: la navegación (Fase 0) ya enlazaba a esta ruta como
          // "Prueba de vidrio" antes de que Glass Test existiera. Se
          // mantiene apuntando a la misma página para no romper el enlace
          // previo.
          { path: 'prueba-de-vidrio', element: <GlassTestPage /> },
          { path: 'configuracion', element: <SettingsPage /> },
          { path: 'ayuda', element: <HelpPage /> },
        ],
      },
      // Fuera de Layout a propósito: el modo remoto (F8) es una interfaz
      // independiente, mobile-first y sin sidebar — no la vista con el
      // menú lateral del resto de la app.
      {
        path: '/remote',
        children: [
          { index: true, element: <RemoteJoinPage /> },
          { path: ':sessionId', element: <RemoteControlPage /> },
        ],
      },
      // Fuera de Layout a propósito (fase "pantalla limpia"): detrás del
      // vidrio no debe verse nada más que el texto — ni sidebar ni el
      // resto del chrome de Layout.
      {
        path: '/teleprompter',
        children: [
          { index: true, element: <TeleprompterPage /> },
          { path: ':id', element: <TeleprompterPage /> },
        ],
      },
    ],
  },
])
