import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalibrationPanel } from '../components/glassMode/CalibrationPanel'
import { GlassTestPattern } from '../components/glassMode/GlassTestPattern'
import { MirrorModeSelector } from '../components/glassMode/MirrorModeSelector'
import { ReadingZoneGuides } from '../components/teleprompter/ReadingZoneGuides'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { PromptDialog } from '../components/shared/PromptDialog'
import { DEFAULT_CALIBRATION, getEffectiveColors, type CalibrationSettings } from '../engine/calibrationEngine'
import { useWakeLock } from '../hooks/useWakeLock'
import { useProfilesStore } from '../stores/profilesStore'
import { ACCENT_SURFACE, FONT_DISPLAY, LINK } from '../styles/tokens'

export function GlassTestPage() {
  const navigate = useNavigate()
  // Activo todo el tiempo que esta pantalla está montada — calibrar
  // detrás del vidrio con la pantalla apagándose sola tampoco sirve.
  const { supported: wakeLockSupported, failed: wakeLockFailed } = useWakeLock(true)

  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.loadProfiles)
  const createProfile = useProfilesStore((s) => s.createProfile)
  const updateProfile = useProfilesStore((s) => s.updateProfile)
  const deleteProfile = useProfilesStore((s) => s.deleteProfile)

  const [settings, setSettings] = useState<CalibrationSettings>(DEFAULT_CALIBRATION)
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [showSaveAsNewDialog, setShowSaveAsNewDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Cargar los perfiles y aplicar uno automáticamente al entrar — una sola
  // vez al montar. Se resuelve dentro del propio .then() de la carga (no
  // reaccionando a que `profiles` cambie en un efecto aparte) para que
  // esto no vuelva a dispararse ni pise los cambios en curso del usuario
  // si la lista se recarga después de guardar. Preferencia: el perfil
  // marcado como predeterminado en Configuración (Parte 3) si hay uno; si
  // no, el más reciente, como siempre.
  useEffect(() => {
    loadProfiles().then(() => {
      const profiles = useProfilesStore.getState().profiles
      const preferred = profiles.find((p) => p.isDefault) ?? profiles[0]
      if (!preferred) return
      setSelectedProfileId(preferred.id ?? null)
      setSettings(preferred)
    })
  }, [loadProfiles])

  function handleChange(patch: Partial<CalibrationSettings>) {
    setSettings((s) => ({ ...s, ...patch }))
  }

  function handleSelectProfile(idValue: string) {
    if (!idValue) {
      setSelectedProfileId(null)
      setSettings(DEFAULT_CALIBRATION)
      return
    }
    const profile = profiles.find((p) => p.id === Number(idValue))
    if (!profile) return
    setSelectedProfileId(profile.id ?? null)
    setSettings(profile)
  }

  async function handleSaveChanges() {
    if (selectedProfileId != null) {
      await updateProfile(selectedProfileId, settings)
    } else {
      setShowSaveAsNewDialog(true)
    }
  }

  const { background } = getEffectiveColors(settings)

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-auto" style={{ backgroundColor: background }}>
        {/* Cruce de referencia fijo al viewport (no se mueve con mirror/offset)
            para poder detectar desplazamientos horizontales y verticales. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/20" />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
        </div>

        <div className="flex min-h-full items-center justify-center p-8">
          <GlassTestPattern settings={settings} />
        </div>

        {/* A diferencia del Teleprompter, acá no hay "modo de ajuste"
            separado ni ocultado automático que proteger — Prueba de vidrio
            ya es una pantalla de calibración tranquila, así que las guías
            son arrastrables directamente en cuanto están activadas. */}
        {settings.readingZone.enabled && (
          <ReadingZoneGuides
            zone={settings.readingZone}
            onChange={(readingZone) => handleChange({ readingZone })}
            interactive
          />
        )}
      </div>

      <div className="flex flex-col border-t border-white/10 lg:h-screen lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/guiones')}
            className={`shrink-0 text-xs font-medium whitespace-nowrap ${LINK} hover:underline`}
          >
            ‹ Biblioteca
          </button>
          <h1 className={`min-w-0 flex-1 truncate text-center text-sm font-semibold text-gray-100 ${FONT_DISPLAY}`}>Prueba de vidrio</h1>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="shrink-0 text-xs whitespace-nowrap text-gray-400 hover:text-gray-100 lg:hidden"
          >
            {panelOpen ? 'Ocultar controles' : 'Mostrar controles'}
          </button>
        </div>
        {!wakeLockSupported && (
          <p className="border-b border-white/10 px-4 py-2 text-xs text-gray-500">
            La pantalla podría apagarse sola en este navegador.
          </p>
        )}
        {wakeLockSupported && wakeLockFailed && (
          <p className="border-b border-white/10 px-4 py-2 text-xs text-gray-500">
            No se pudo mantener la pantalla encendida (¿ahorro de batería?).
          </p>
        )}

        <div
          className={`${panelOpen ? 'flex max-h-[45vh] lg:max-h-none' : 'hidden'} flex-col gap-4 overflow-y-auto lg:flex`}
        >
          <div className="flex flex-col gap-2 border-b border-white/10 p-4">
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              <span>Perfil</span>
              <select
                value={selectedProfileId ?? ''}
                onChange={(e) => handleSelectProfile(e.target.value)}
                className="rounded border border-white/10 bg-[#0f1117] px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="">Sin guardar (predeterminado)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveChanges}
                className={`flex-1 ${ACCENT_SURFACE} px-3 py-1.5 text-xs font-medium`}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setShowSaveAsNewDialog(true)}
                className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
              >
                Guardar como nuevo
              </button>
              {selectedProfileId != null && (
                <button
                  type="button"
                  onClick={() => setShowDeleteDialog(true)}
                  className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>

          <div className="px-4">
            <MirrorModeSelector value={settings.mirror} onChange={(mirror) => handleChange({ mirror })} />
          </div>

          <CalibrationPanel settings={settings} onChange={handleChange} />
        </div>
      </div>

      {showSaveAsNewDialog && (
        <PromptDialog
          title="Guardar como nuevo perfil"
          label="Nombre del perfil"
          placeholder="Ej. Teléfono, Tablet, Teleprompter principal"
          confirmLabel="Guardar"
          onConfirm={async (name) => {
            const id = await createProfile(name, settings)
            setSelectedProfileId(id)
            setShowSaveAsNewDialog(false)
          }}
          onClose={() => setShowSaveAsNewDialog(false)}
        />
      )}

      {showDeleteDialog && selectedProfileId != null && (
        <ConfirmDialog
          title="Eliminar perfil"
          message="¿Eliminar este perfil de calibración? Esta acción no se puede deshacer."
          actions={[
            { label: 'Cancelar', variant: 'neutral', onClick: () => setShowDeleteDialog(false) },
            {
              label: 'Eliminar',
              variant: 'danger',
              onClick: async () => {
                await deleteProfile(selectedProfileId)
                setSelectedProfileId(null)
                setSettings(DEFAULT_CALIBRATION)
                setShowDeleteDialog(false)
              },
            },
          ]}
          onClose={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  )
}
