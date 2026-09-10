// Capa mínima de inicialización de Firebase para el control remoto (F8).
// Nada de esto se ejecuta ni se importa desde el Teleprompter local: el
// control remoto es opt-in (se activará recién en F8.2+) y el resto de la
// app (Mis guiones, Editor, Teleprompter, Glass Test, perfiles) sigue
// dependiendo únicamente de Dexie/IndexedDB, sin ninguna relación con este
// archivo.
//
// La inicialización es perezosa y tolerante: si faltan variables de entorno,
// o si Firebase no puede inicializarse (sin conexión, proyecto mal
// configurado, etc.), las funciones de aquí devuelven `null`/`false` en vez
// de lanzar. Así, mientras Firebase no esté configurado, la app arranca y
// funciona exactamente igual que hoy.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

interface FirebaseEnvConfig {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

function readEnvConfig(): FirebaseEnvConfig | null {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID
  const appId = env.VITE_FIREBASE_APP_ID

  if (!apiKey || !authDomain || !databaseURL || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null
  }
  return { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId }
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let databaseInstance: Database | null = null
let initAttempted = false

function ensureInitialized(): boolean {
  if (initAttempted) return app !== null
  initAttempted = true
  const config = readEnvConfig()
  if (!config) return false
  try {
    app = initializeApp(config)
    authInstance = getAuth(app)
    databaseInstance = getDatabase(app)
    return true
  } catch (err) {
    console.error('[remote] No se pudo inicializar Firebase:', err)
    app = null
    authInstance = null
    databaseInstance = null
    return false
  }
}

// true solo si las 7 variables de entorno están presentes Y initializeApp no
// falló. El control remoto (F8.2+) debe usar esto para decidir si mostrar la
// opción de emparejamiento; el resto de la app nunca necesita llamarla.
export function isRemoteControlConfigured(): boolean {
  return ensureInitialized()
}

export function getFirebaseAuth(): Auth | null {
  return ensureInitialized() ? authInstance : null
}

export function getFirebaseDatabase(): Database | null {
  return ensureInitialized() ? databaseInstance : null
}

// Inicia sesión anónima si todavía no hay un usuario. Devuelve el UID, o
// `null` si Firebase no está configurado o si la autenticación falla (sin
// red, proyecto sin Anonymous Auth habilitado, etc.) — nunca lanza.
export async function signInAnonymouslyIfNeeded(): Promise<string | null> {
  const auth = getFirebaseAuth()
  if (!auth) return null
  if (auth.currentUser) return auth.currentUser.uid
  try {
    const credential = await signInAnonymously(auth)
    return credential.user.uid
  } catch (err) {
    console.error('[remote] Anonymous sign-in falló:', err)
    return null
  }
}

// Notifica el UID actual (o null) cada vez que cambia el estado de
// autenticación. Si Firebase no está configurado, llama a `callback(null)`
// una sola vez y devuelve un unsubscribe vacío, para que quien lo use no
// tenga que ramificar según si Firebase está disponible.
export function subscribeAuthUid(callback: (uid: string | null) => void): () => void {
  const auth = getFirebaseAuth()
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => callback(user?.uid ?? null))
}
