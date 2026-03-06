import { useState } from 'react'
import { APP_CATEGORIES, getPresetsByCategory } from '../../lib/appPresets'
import type { AppPreset, AppCategory } from '../../lib/appPresets'
import { AppPresetCard } from './AppPresetCard'
import { Input } from '../atoms/Input'

type AppPresetSelectorProps = {
  selectedPreset: AppPreset | null
  onSelect: (preset: AppPreset) => void
}

export function AppPresetSelector({ selectedPreset, onSelect }: AppPresetSelectorProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<AppCategory>('database')

  const filteredPresets = search
    ? APP_CATEGORIES.flatMap(cat => getPresetsByCategory(cat.id)).filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase())
      )
    : getPresetsByCategory(activeCategory)

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search applications..."
        className="w-full"
      />

      {!search && (
        <div className="flex flex-wrap gap-2">
          {APP_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeCategory === category.id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }
              `}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-2 ${search ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {filteredPresets.map((preset) => (
          <AppPresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPreset?.id === preset.id}
            onClick={() => onSelect(preset)}
          />
        ))}
      </div>

      {filteredPresets.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-4">
          No applications found
        </p>
      )}
    </div>
  )
}
