import { useEffect, useState } from 'react'
import { CalibrationPanel } from '../components/glassMode/CalibrationPanel'
import { GlassTestPattern } from '../components/glassMode/GlassTestPattern'
import { MirrorModeSelector } from '../components/glassMode/MirrorModeSelector'
import { DEFAULT_CALIBRATION, getEffectiveColors, type CalibrationSettings } from '../engine/calibrationEngine'
import { useProfilesStore } from '../stores/profilesStore'

export function GlassTestPage() {
  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.loadProfiles)
  const createProfile = useProfilesStore((s) => s.createProfile)
  const updateProfile = useProfilesStore((s) => s.updateProfile)
  const deleteProfile = useProfilesStore((s) => s.deleteProfile)

  const [settings, setSettings] = useState<CalibrationSettings>(DEFAULT_CALIBRATION)
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  // Cargar los perfiles y, si ya existe alguno guardado, aplicar el más
  // reciente automáticamente — una sola vez al montar. Se resuelve dentro
  // del propio .then() de la carga (no reaccionando a que `profiles` cambie
  // en un efecto aparte) para que esto no vuelva a dispararse ni pise los
  // cambios en curso del usuario si la lista se recarga después de guardar.
  useEffect(() => {
    loadProfiles().then(() => {
      const [mostRecent] = useProfilesStore.getState().profiles
      if (!mostRecent) return
      setSelectedProfileId(mostRecent.id ?? null)
      setSettings(mostRecent)
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

  async function handleSaveAsNew() {
    const name = window.prompt('Nombre del perfil (ej. Teléfono, Tablet, Teleprompter principal):', 'Nuevo perfil')
    if (!name) return
    const id = await createProfile(name, settings)
    setSelectedProfileId(id)
  }

  async function handleSaveChanges() {
    if (selectedProfileId != null) {
      await updateProfile(selectedProfileId, settings)
    } else {
      await handleSaveAsNew()
    }
  }

  async function handleDelete() {
    if (selectedProfileId == null) return
    if (!window.confirm('¿Eliminar este perfil de calibración?')) return
    await deleteProfile(selectedProfileId)
    setSelectedProfileId(null)
    setSettings(DEFAULT_CALIBRATION)
  }

  const { background } = getEffectiveColors(settings)

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-auto" style={{ backgroundColor: background }}>
        {/* Cruce de referencia fijo al viewport (no se mueve con mirror/offset)
            para poder detectar desplazamientos horizontales y verticales. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-blue-500/30" />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-blue-500/30" />
        </div>

        <div className="flex min-h-full items-center justify-center p-8">
          <GlassTestPattern settings={settings} />
        </div>
      </div>

      <div className="flex flex-col border-t border-white/10 lg:h-screen lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold text-gray-100">Prueba de vidrio</h1>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-100 lg:hidden"
          >
            {panelOpen ? 'Ocultar controles' : 'Mostrar controles'}
          </button>
        </div>

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
                className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={handleSaveAsNew}
                className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
              >
                Guardar como nuevo
              </button>
              {selectedProfileId != null && (
                <button
                  type="button"
                  onClick={handleDelete}
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
    </div>
  )
}
