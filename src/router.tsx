import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/shared/Layout'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { EditorPage } from './pages/EditorPage'
import { TeleprompterPage } from './pages/TeleprompterPage'
import { GlassTestPage } from './pages/GlassTestPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage } from './pages/HelpPage'
import { RemoteJoinPage } from './pages/RemoteJoinPage'
import { RemoteControlPage } from './pages/RemoteControlPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'guiones', element: <LibraryPage /> },
      { path: 'editor', element: <EditorPage /> },
      { path: 'editor/:id', element: <EditorPage /> },
      { path: 'teleprompter', element: <TeleprompterPage /> },
      { path: 'teleprompter/:id', element: <TeleprompterPage /> },
      { path: 'glass-test', element: <GlassTestPage /> },
      // Alias: la navegación (Fase 0) ya enlazaba a esta ruta como "Prueba
      // de vidrio" antes de que Glass Test existiera. Se mantiene apuntando
      // a la misma página para no romper el enlace previo.
      { path: 'prueba-de-vidrio', element: <GlassTestPage /> },
      { path: 'configuracion', element: <SettingsPage /> },
      { path: 'ayuda', element: <HelpPage /> },
    ],
  },
  // Fuera de Layout a propósito: el modo remoto (F8) es una interfaz
  // independiente, mobile-first y sin sidebar — no la vista con el menú
  // lateral del resto de la app.
  {
    path: '/remote',
    children: [
      { index: true, element: <RemoteJoinPage /> },
      { path: ':sessionId', element: <RemoteControlPage /> },
    ],
  },
])
