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
import { ChevronDownIcon, MoreHorizontalIcon, PlusIcon } from '../components/shared/Icons'
import { PromptDialog } from '../components/shared/PromptDialog'
import type { CalibrationProfileRecord } from '../db/db'
import type { MirrorMode } from '../engine/calibrationEngine'
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
  TEXT_FAINT,
  TEXT_MUTED,
} from '../styles/tokens'

type DialogState =
  | { type: 'none' }
  | { type: 'rename'; profile: CalibrationProfileRecord }
  | { type: 'delete'; profile: CalibrationProfileRecord }

// Resumen corto para la fila del perfil ("56 px · espejo H") — mismo
// vocabulario abreviado que pide el handoff, sin PPM (eso es propio de
// cada guion/sesión, no del perfil de calibración: acá no hay ese dato).
const MIRROR_LABEL: Record<MirrorMode, string> = {
  none: 'sin espejo',
  horizontal: 'espejo H',
  vertical: 'espejo V',
}

interface ProfileRowProps {
  profile: CalibrationProfileRecord
  isFirst: boolean
  onRename: () => void
  onSetDefault: () => void
  onDelete: () => void
}

function ProfileRow({ profile, isFirst, onRename, onSetDefault, onDelete }: ProfileRowProps) {
  const { open, setOpen, position, anchorRef, menuRef } = useDropdownMenu<HTMLDivElement>('right')

  return (
    <div className={`flex items-center gap-3 px-3.5 py-3.5 ${isFirst ? '' : 'border-t border-white/[0.07]'}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${profile.isDefault ? 'bg-accent' : 'bg-white/20'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[16px] font-semibold tracking-[-0.3px] text-gray-100 ${FONT_DISPLAY}`}>{profile.name}</p>
        <p className={`mt-0.5 truncate text-[13px] ${TEXT_MUTED}`}>
          {profile.fontSize} px · {MIRROR_LABEL[profile.mirror]}
          {profile.isDefault && <span className={`ml-1.5 font-medium ${ACCENT_TEXT}`}>· Predeterminado</span>}
        </p>
      </div>
      <div ref={anchorRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Más acciones para el perfil ${profile.name}`}
          className="rounded-full p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
        >
          <MoreHorizontalIcon className="h-4 w-4" />
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
      <header className="mb-3.5 flex items-center justify-between">
        <button type="button" onClick={() => navigate('/guiones')} className={`text-[17px] tracking-[-0.3px] ${LINK}`}>
          ‹ Biblioteca
        </button>
      </header>

      <h1 className={`${SCREEN_TITLE} mb-[22px]`}>Configuración</h1>

      <p className={`mb-2.5 text-xs font-semibold tracking-[0.7px] uppercase ${TEXT_MUTED}`}>Perfiles de calibración</p>
      <div className={`mb-6 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} overflow-hidden`}>
        {profiles.map((profile, index) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            isFirst={index === 0}
            onRename={() => setDialog({ type: 'rename', profile })}
            onSetDefault={() => setDefaultProfile(profile.id!)}
            onDelete={() => setDialog({ type: 'delete', profile })}
          />
        ))}
        <button
          type="button"
          onClick={() => navigate('/glass-test')}
          className={`flex w-full items-center gap-2.5 px-3.5 py-3.5 text-left text-[16px] ${ACCENT_TEXT} transition-colors hover:bg-white/5 ${
            profiles.length > 0 ? 'border-t border-white/[0.07]' : ''
          }`}
        >
          <PlusIcon className="h-4 w-4 shrink-0" />
          Nuevo perfil
        </button>
      </div>

      <p className={`mb-2.5 text-xs font-semibold tracking-[0.7px] uppercase ${TEXT_MUTED}`}>Aplicación</p>
      <div className={`${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} overflow-hidden`}>
        <button
          type="button"
          onClick={() => navigate('/glass-test')}
          className={`flex w-full items-center justify-between gap-3 px-3.5 py-3.5 text-left text-[16px] text-gray-100 transition-colors ${SURFACE_HOVER}`}
        >
          Prueba de vidrio
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 -rotate-90 text-gray-500" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/ayuda')}
          className={`flex w-full items-center justify-between gap-3 border-t border-white/[0.07] px-3.5 py-3.5 text-left text-[16px] text-gray-100 transition-colors ${SURFACE_HOVER}`}
        >
          Ayuda
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 -rotate-90 text-gray-500" />
        </button>
      </div>

      <p className={`mt-5 text-[13px] ${TEXT_FAINT}`}>Robress · datos guardados en este dispositivo</p>

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
