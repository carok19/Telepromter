// Ayuda: antes un placeholder vacío. Pensada para alguien que nunca usó la
// app — español simple, en segunda persona, sin palabras técnicas sin
// explicar. Cada sección es una tarjeta plegable (AccordionSection) con un
// id estable, para poder abrir una sección puntual desde otra pantalla (ver
// los accesos "?" en Prueba de vidrio y en el modal de emparejamiento) en
// vez de obligar a leer todo desde arriba.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AccordionSection } from '../components/shared/AccordionSection'
import { TeleprompterGlassDiagram } from '../components/help/TeleprompterGlassDiagram'
import {
  AlertCircleIcon,
  DownloadIcon,
  FolderIcon,
  GamepadIcon,
  PlayIcon,
  SlidersIcon,
  SmartphoneIcon,
} from '../components/shared/Icons'
import { LINK, PAGE, SCREEN_TITLE } from '../styles/tokens'

interface HelpSection {
  id: string
  label: string
  icon: typeof SmartphoneIcon
}

const SECTIONS: HelpSection[] = [
  { id: 'vidrio', label: 'Armar el vidrio', icon: SmartphoneIcon },
  { id: 'calibrar', label: 'Calibrar', icon: SlidersIcon },
  { id: 'usar', label: 'Usar el teleprompter', icon: PlayIcon },
  { id: 'remoto', label: 'Control remoto', icon: GamepadIcon },
  { id: 'organizar', label: 'Organizar guiones', icon: FolderIcon },
  { id: 'instalar', label: 'Instalar la app', icon: DownloadIcon },
  { id: 'problemas', label: 'Problemas comunes', icon: AlertCircleIcon },
]

const SECTION_IDS = new Set(SECTIONS.map((s) => s.id))

interface HelpLocationState {
  from?: string
}

export function HelpPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Si llegaste con un "?" desde otra pantalla, la URL trae un ancla (por
  // ejemplo /ayuda#calibrar): esa sección arranca abierta. Calculado en el
  // estado inicial (no en un efecto): en el primer render de esta página
  // (siempre un montaje nuevo, viniendo de otra ruta) el hash ya está en
  // la URL, así que no hace falta esperar a nada para saberlo.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const id = location.hash.slice(1)
    return SECTION_IDS.has(id) ? { [id]: true } : {}
  })

  // "Ajustar estado durante el render" (mismo patrón que SettingsSheet.tsx):
  // si el ancla cambia mientras la página ya está montada (poco común acá,
  // pero puede pasar editando la URL a mano), se abre esa sección en este
  // mismo render en vez de a través de un efecto, que dispararía un
  // segundo render para algo que ya se sabe en este.
  const [lastHash, setLastHash] = useState(location.hash)
  if (location.hash !== lastHash) {
    setLastHash(location.hash)
    const id = location.hash.slice(1)
    if (SECTION_IDS.has(id)) {
      setOpenSections((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
    }
  }

  // Esto sí es un efecto de verdad: mover el scroll del documento es un
  // sistema externo al render de React, no algo que se pueda calcular acá.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!SECTION_IDS.has(id)) return
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [location.hash])

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Si viniste de un "?" (Prueba de vidrio, el emparejamiento del control
  // remoto), Volver te lleva de nuevo ahí — no tiene sentido mandarte a la
  // Biblioteca cuando estabas en medio de otra cosa. Sin ese dato (por
  // ejemplo, entraste desde Configuración), Volver va a la Biblioteca,
  // como siempre.
  const backTo = (location.state as HelpLocationState | null)?.from ?? '/guiones'

  return (
    <div className={PAGE}>
      <header className="mb-5 flex items-center justify-between">
        <button type="button" onClick={() => navigate(backTo)} className={`text-sm font-medium ${LINK}`}>
          ‹ Volver
        </button>
      </header>

      <h1 className={SCREEN_TITLE}>Ayuda</h1>
      <p className="mt-1.5 text-sm text-gray-400">Todo lo que necesitás para armar, calibrar y usar tu teleprompter.</p>

      {/* Índice: mismas 7 etiquetas que las secciones de abajo, para saltar
          directo sin tener que abrir una por una buscando. */}
      <nav className="mt-4 flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault()
              setOpenSections((prev) => ({ ...prev, [id]: true }))
              document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/5"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-5 flex flex-col gap-3">
        <AccordionSection
          id="vidrio"
          title="Armar el teleprompter de vidrio"
          icon={SmartphoneIcon}
          open={!!openSections.vidrio}
          onToggle={() => toggleSection('vidrio')}
        >
          <p>
            Apoyá el celular o la tablet boca arriba, detrás del vidrio, con la pantalla mirando hacia arriba. El
            vidrio va inclinado, más o menos a 45 grados, entre la pantalla y la cámara.
          </p>
          <p>
            Así funciona: el texto que ves en la pantalla se refleja en el vidrio, y quien esté grabando lo lee
            mirando directo a la cámara, sin bajar la vista. Para que se lea bien una vez reflejado, la app da vuelta
            el texto (lo espeja) antes de mostrarlo — vos lo ves al revés desde atrás, pero reflejado en el vidrio se
            ve normal.
          </p>
          <div className="my-1 rounded-xl bg-black/20 p-3 text-gray-500">
            <TeleprompterGlassDiagram />
          </div>
          <p>
            El vidrio tiene dos caras, y cada una refleja un poco. Por eso a veces se ve una segunda imagen, más
            débil, superpuesta al texto — se la conoce como <strong className="text-gray-100">"fantasma"</strong>. Es
            una cuestión física del vidrio: la app no lo puede eliminar del todo. Ayuda usar un vidrio pensado para
            teleprompter (más fino que un vidrio común) y evitar luces fuertes apuntando directo a él.
          </p>
        </AccordionSection>

        <AccordionSection
          id="calibrar"
          title="Cómo calibrar"
          icon={SlidersIcon}
          open={!!openSections.calibrar}
          onToggle={() => toggleSection('calibrar')}
        >
          <p>
            Antes de grabar, entrá a <strong className="text-gray-100">Prueba de vidrio</strong> (se abre desde la
            Biblioteca) con el equipo ya armado tal cual vas a grabar: mismo celular, mismo vidrio, misma distancia.
          </p>
          <p>
            Vas a ver un patrón de prueba con líneas y texto. Mirá si todo queda derecho, centrado, y si el
            "fantasma" del vidrio tapa algo importante — ahí es cuando conviene tocar los controles.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-gray-100">Tamaño de letra:</strong> qué tan grandes se ven las palabras.</li>
            <li><strong className="text-gray-100">Grosor:</strong> qué tan gruesa se ve la letra — más grueso suele leerse mejor de lejos.</li>
            <li><strong className="text-gray-100">Margen:</strong> qué tan ancha es la columna de texto.</li>
            <li><strong className="text-gray-100">Interlineado:</strong> el espacio entre una línea y la siguiente.</li>
            <li><strong className="text-gray-100">Brillo y contraste:</strong> para que el texto se note bien contra el fondo, sin encandilar.</li>
          </ul>
          <p>
            Cuando quede como te gusta, guardalo como un perfil con un nombre que lo identifique (por ejemplo,
            "Celular en el trípode chico"). La próxima vez que uses ese mismo equipo, elegís ese perfil y no hace
            falta calibrar de nuevo.
          </p>
        </AccordionSection>

        <AccordionSection
          id="usar"
          title="Cómo usar el teleprompter"
          icon={PlayIcon}
          open={!!openSections.usar}
          onToggle={() => toggleSection('usar')}
        >
          <p>Abrí un guion guardado tocando su tarjeta desde Mis guiones.</p>
          <p>Pasá a pantalla completa con el ícono de expandir, así no se ve nada más que el texto.</p>
          <p>Tocá Play para que el texto empiece a subir solo, y ajustá la velocidad con el control de PPM (palabras por minuto): más alto sube más rápido.</p>
          <p>
            El triángulo que aparece a un costado (el <strong className="text-gray-100">indicador de Señal</strong>)
            marca la altura ideal de lectura. Arrastralo a la altura que te resulte más cómoda para vos.
          </p>
          <p>
            El modo <strong className="text-gray-100">Margen</strong> te deja arrastrar dos barras para angostar o
            ensanchar la columna de texto en el momento, sin entrar a ningún menú.
          </p>
          <p>
            Si el guion tiene marcadores: <strong className="text-gray-100">[PAUSA]</strong> frena el scroll solo en
            ese punto (tocás Play de nuevo para seguir); <strong className="text-gray-100">Nota</strong> es un
            recordatorio para vos, como "mirar a cámara" — no frena nada, solo se ve distinto en el texto.
          </p>
        </AccordionSection>

        <AccordionSection
          id="remoto"
          title="Cómo usar el control remoto"
          icon={GamepadIcon}
          open={!!openSections.remoto}
          onToggle={() => toggleSection('remoto')}
        >
          <p>Desde el teleprompter, tocá "Control remoto". Va a aparecer un código QR.</p>
          <p>Escaneá ese código con otro celular — el que vas a usar para manejar la lectura desde afuera. Se emparejan solos, sin cables.</p>
          <p>Desde el control remoto podés: reproducir y pausar, avanzar o retroceder unos segundos, cambiar la velocidad, ajustar la calibración en vivo, y elegir qué guion mostrar.</p>
          <p>
            Los dos dispositivos necesitan internet: el emparejamiento se hace a través de un servidor, no es una
            conexión directa entre los dos celulares.
          </p>
          <p>
            Si el control remoto dice <strong className="text-gray-100">"Reconectando con el teleprompter…"</strong>:
            el teleprompter perdió la conexión un momento (por ejemplo, se recargó la página) y está volviendo solo.
            No hace falta que hagas nada, esperá unos segundos.
          </p>
          <p>
            Si dice <strong className="text-gray-100">"Sesión finalizada"</strong> o{' '}
            <strong className="text-gray-100">"Teleprompter no disponible"</strong>: la conexión ya no se puede
            recuperar. Volvé al teleprompter y tocá "Control remoto" de nuevo para conseguir un código nuevo.
          </p>
        </AccordionSection>

        <AccordionSection
          id="organizar"
          title="Organizar tus guiones"
          icon={FolderIcon}
          open={!!openSections.organizar}
          onToggle={() => toggleSection('organizar')}
        >
          <p>Podés agrupar tus guiones en carpetas, igual que en el explorador de archivos de tu celular.</p>
          <p>
            Importante: nada se guarda solo. Cuando termines de escribir o editar, tocá{' '}
            <strong className="text-gray-100">Guardar</strong>. Si intentás salir sin guardar, la app te avisa antes
            de dejarte ir.
          </p>
          <p>Un guion que todavía no guardaste queda como borrador — no aparece en tus carpetas hasta que lo guardes por primera vez.</p>
        </AccordionSection>

        <AccordionSection
          id="instalar"
          title="Instalar la app y usarla sin internet"
          icon={DownloadIcon}
          open={!!openSections.instalar}
          onToggle={() => toggleSection('instalar')}
        >
          <p>Podés agregar esta app a la pantalla de inicio de tu celular, para abrirla directo, sin pasar por el navegador cada vez.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-gray-100">Android (Chrome):</strong> tocá el menú (los tres puntos) y elegí "Instalar app" o "Agregar a pantalla de inicio".</li>
            <li><strong className="text-gray-100">iPhone (Safari):</strong> tocá el ícono de compartir y elegí "Agregar a pantalla de inicio".</li>
          </ul>
          <p>
            Sin internet podés seguir leyendo y reproduciendo los guiones que ya tenías guardados. Lo único que
            necesita internet es el control remoto, porque empareja los dos dispositivos a través de un servidor.
          </p>
        </AccordionSection>

        <AccordionSection
          id="problemas"
          title="Problemas comunes"
          icon={AlertCircleIcon}
          open={!!openSections.problemas}
          onToggle={() => toggleSection('problemas')}
        >
          <div>
            <p className="font-semibold text-gray-100">Cambio el tamaño de letra y el texto no responde</p>
            <p className="mt-1">
              Puede que ese texto lo hayas pegado desde Word, WhatsApp u otro lado, y haya traído su propio tamaño
              fijo pegado a cada línea. Seleccionalo en el editor y quitale el formato, o volvé a escribirlo
              directamente ahí, para que vuelva a responder a la calibración.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-100">La pantalla se apaga sola mientras leo</p>
            <p className="mt-1">
              Algunos celulares apagan la pantalla para ahorrar batería aunque la app pida que se mantenga encendida.
              Si ves el aviso "No se pudo mantener la pantalla encendida", revisá la configuración de ahorro de
              energía de tu celular para esta app o para el navegador.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-100">El código QR no hace nada al escanearlo</p>
            <p className="mt-1">
              Confirmá que el celular que escanea tenga internet. También puede que hayan pasado más de dos horas
              desde que se generó el código — expira solo, por seguridad. Volvé al teleprompter y generá uno nuevo.
            </p>
          </div>
        </AccordionSection>
      </div>
    </div>
  )
}
