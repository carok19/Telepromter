import logo from '../../assets/logo.svg'
import { FONT_DISPLAY } from '../../styles/tokens'

interface LogoProps {
  showWordmark?: boolean
}

export function Logo({ showWordmark = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <img src={logo} alt="" width={32} height={32} />
      {showWordmark && (
        <span className={`text-sm font-semibold leading-tight text-gray-100 ${FONT_DISPLAY}`}>
          Robress
          <br />
          Teleprompter
        </span>
      )}
    </div>
  )
}
