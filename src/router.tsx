import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/shared/Layout'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { EditorPage } from './pages/EditorPage'
import { TeleprompterPage } from './pages/TeleprompterPage'
import { GlassTestPage } from './pages/GlassTestPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage } from './pages/HelpPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'guiones', element: <LibraryPage /> },
      { path: 'editor', element: <EditorPage /> },
      { path: 'teleprompter', element: <TeleprompterPage /> },
      { path: 'prueba-de-vidrio', element: <GlassTestPage /> },
      { path: 'configuracion', element: <SettingsPage /> },
      { path: 'ayuda', element: <HelpPage /> },
    ],
  },
])
