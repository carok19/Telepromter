// Configuración (Parte 3 del rediseño de Biblioteca): antes era un
// placeholder vacío — ahora es la única puerta de entrada a Ayuda y
// Prueba de vidrio (ninguna de las dos tiene ya un link de sidebar) más
// la gestión de perfiles de calibración (ver, renombrar, eliminar, elegir
// el predeterminado). Crear un perfil nuevo se sigue haciendo solo desde
// Prueba de vidrio — acá no se duplica ese flujo, calibrar en vivo contra
// el vidrio real es lo que le da sentido a un perfil nuevo.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { ChevronDownIcon, FileTextIcon, MoreVerticalIcon, SettingsIcon } from '../components/shared/Icons'
import { PromptDialog } from '../components/shared/PromptDialog'
import type { CalibrationProfileRecord } from '../db/db'
import { useDropdownMenu } from '../hooks/useDropdownMenu'
import { useProfilesStore } from '../stores/profilesStore'
import {
  ACCENT_TEXT,
  FONT_DISPLAY,
  LINK,
  PAGE,
  RADIUS_CARD,
  RADIUS_MENU,
  SCREEN_TITLE,
  SURFACE,
  SURFACE_BORDER,
  SURFACE_HOVER,
  SURFACE_RAISED,
  TEXT_MUTED,
} from '../styles/tokens'

type DialogState =
  | { type: 'none' }
  | { type: 'rename'; profile: CalibrationProfileRecord }
  | { type: 'delete'; profile: CalibrationProfileRecord }

interface ProfileRowProps {
  profile: CalibrationProfileRecord
  onRename: () => void
  onSetDefault: () => void
  onDelete: () => void
}

function ProfileRow({ profile, onRename, onSetDefault, onDelete }: ProfileRowProps) {
  const { open, setOpen, position, anchorRef, menuRef } = useDropdownMenu<HTMLDivElement>('right')

  return (
    <div className={`flex items-center justify-between gap-3 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-4 py-3`}>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium text-gray-100 ${FONT_DISPLAY}`}>{profile.name}</p>
        {profile.isDefault && <p className={`mt-0.5 text-xs font-medium ${ACCENT_TEXT}`}>Predeterminado</p>}
      </div>
      <div ref={anchorRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Más acciones para el perfil ${profile.name}`}
          className="rounded-full p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
        {open &&
          createPortal(
            <div
              ref={menuRef}
              style={{ position: 'fixed', top: position.top ?? undefined, bottom: position.bottom ?? undefined, left: position.left }}
              className={`z-50 w-48 ${RADIUS_MENU} ${SURFACE_RAISED} py-1 shadow-xl`}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onRename()
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
              >
                Renombrar
              </button>
              {!profile.isDefault && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onSetDefault()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  Elegir como predeterminado
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
                className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
              >
                Eliminar
              </button>
            </div>,
            document.body,
          )}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.loadProfiles)
  const renameProfile = useProfilesStore((s) => s.renameProfile)
  const setDefaultProfile = useProfilesStore((s) => s.setDefaultProfile)
  const deleteProfile = useProfilesStore((s) => s.deleteProfile)

  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  function closeDialog() {
    setDialog({ type: 'none' })
  }

  return (
    <div className={PAGE}>
      <header className="mb-5 flex items-center justify-between">
        <button type="button" onClick={() => navigate('/guiones')} className={`text-sm font-medium ${LINK}`}>
          ‹ Biblioteca
        </button>
      </header>

      <h1 className={SCREEN_TITLE}>Configuración</h1>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => navigate('/ayuda')}
          className={`flex items-center gap-3 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-4 py-3 text-left transition-colors ${SURFACE_HOVER}`}
        >
          <FileTextIcon className={`h-4 w-4 shrink-0 ${TEXT_MUTED}`} />
          <span className="flex-1 text-sm text-gray-100">Ayuda</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-gray-500" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/glass-test')}
          className={`flex items-center gap-3 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-4 py-3 text-left transition-colors ${SURFACE_HOVER}`}
        >
          <SettingsIcon className={`h-4 w-4 shrink-0 ${TEXT_MUTED}`} />
          <span className="flex-1 text-sm text-gray-100">Prueba de vidrio</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-gray-500" />
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Perfiles de calibración</p>
        {profiles.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no creaste ningún perfil. Se crean desde{' '}
            <button type="button" onClick={() => navigate('/glass-test')} className={`${LINK} hover:underline`}>
              Prueba de vidrio
            </button>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                onRename={() => setDialog({ type: 'rename', profile })}
                onSetDefault={() => setDefaultProfile(profile.id!)}
                onDelete={() => setDialog({ type: 'delete', profile })}
              />
            ))}
          </div>
        )}
      </div>

      {dialog.type === 'rename' && (
        <PromptDialog
          title="Renombrar perfil"
          label="Nombre del perfil"
          initialValue={dialog.profile.name}
          confirmLabel="Guardar"
          onConfirm={(name) => {
            if (name !== dialog.profile.name) renameProfile(dialog.profile.id!, name)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      )}

      {dialog.type === 'delete' && (
        <ConfirmDialog
          title="Eliminar perfil"
          message={`¿Eliminar el perfil "${dialog.profile.name}"? Esta acción no se puede deshacer.`}
          actions={[
            { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
            {
              label: 'Eliminar',
              variant: 'danger',
              onClick: async () => {
                await deleteProfile(dialog.profile.id!)
                closeDialog()
              },
            },
          ]}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
