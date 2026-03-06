import type { AppPreset } from '../../lib/appPresets'
import { AppLogo } from '../atoms/AppLogo'

type AppPresetCardProps = {
  preset: AppPreset
  isSelected?: boolean
  onClick?: () => void
}

export function AppPresetCard({ preset, isSelected, onClick }: AppPresetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-lg border text-left transition-all
        ${isSelected 
          ? 'border-emerald-500 bg-emerald-500/10' 
          : 'border-zinc-800 hover:border-zinc-700'
        }
      `}
    >
      <AppLogo name={preset.name} image={preset.image} presetId={preset.id} className={`w-10 h-10 flex-shrink-0`} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100 truncate">{preset.name}</div>
        <div className="text-xs text-zinc-500 truncate" title={preset.longDescription || preset.description}>{preset.description}</div>
      </div>
    </button>
  )
}
