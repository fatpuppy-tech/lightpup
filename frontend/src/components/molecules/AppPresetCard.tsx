import type { AppPreset } from '../../lib/appPresets'

type AppPresetCardProps = {
  preset: AppPreset
  isSelected?: boolean
  onClick?: () => void
}

export function AppPresetCard({ preset, isSelected, onClick }: AppPresetCardProps) {
  const Icon = preset.Icon

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
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${isSelected ? 'bg-emerald-500/20' : 'bg-zinc-800'}
      `}>
        <Icon className={`w-5 h-5 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100 truncate">{preset.name}</div>
        <div className="text-xs text-zinc-500 truncate">{preset.description}</div>
      </div>
    </button>
  )
}
