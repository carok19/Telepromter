// Elegir perfil / guardar en el perfil elegido / guardar como uno nuevo —
// compartido por Prueba de vidrio y por la hoja de Ajustes del
// Teleprompter, que ya tenían casi la misma UI duplicada dos veces con
// pequeñas diferencias de comportamiento por pantalla:
//
// - Teleprompter: un solo botón "Guardar en perfil" (su `onSave` ya decide
//   internamente si actualiza el perfil elegido o abre el diálogo para
//   crear uno nuevo cuando no hay ninguno seleccionado) y sin "Eliminar".
// - Prueba de vidrio: dos botones separados (uno actualiza si hay perfil
//   elegido, el otro siempre crea uno nuevo) más "Eliminar" cuando hay un
//   perfil seleccionado.
//
// En vez de forzar una sola forma en las dos pantallas, `onSaveAsNew` y
// `onDelete` son opcionales: cada pantalla sigue mostrando exactamente los
// botones que ya tenía, con este componente solo evitando duplicar el JSX.
import { ACCENT_SURFACE } from '../../styles/tokens'

interface Profile {
  id?: number
  name: string
}

interface ProfileControlsProps {
  profiles: Profile[]
  selectedProfileId: number | null
  onSelectProfile: (value: string) => void
  placeholderLabel: string
  saveLabel: string
  onSave: () => void
  onSaveAsNew?: () => void
  onDelete?: () => void
  /** 'primary' = relleno de acento (como ya tenía Prueba de vidrio); 'neutral' = borde sutil (como ya tenía el Teleprompter). */
  saveVariant?: 'primary' | 'neutral'
}

export function ProfileControls({
  profiles,
  selectedProfileId,
  onSelectProfile,
  placeholderLabel,
  saveLabel,
  onSave,
  onSaveAsNew,
  onDelete,
  saveVariant = 'neutral',
}: ProfileControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>Perfil</span>
        <select
          value={selectedProfileId ?? ''}
          onChange={(e) => onSelectProfile(e.target.value)}
          className="rounded border border-white/10 bg-[#0f1117] px-2 py-1.5 text-sm text-gray-200"
        >
          <option value="">{placeholderLabel}</option>
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
          onClick={onSave}
          className={
            saveVariant === 'primary'
              ? `flex-1 ${ACCENT_SURFACE} px-3 py-1.5 text-xs font-medium`
              : 'flex-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5'
          }
        >
          {saveLabel}
        </button>
        {onSaveAsNew && (
          <button
            type="button"
            onClick={onSaveAsNew}
            className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
          >
            Guardar como nuevo
          </button>
        )}
        {onDelete && selectedProfileId != null && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}
