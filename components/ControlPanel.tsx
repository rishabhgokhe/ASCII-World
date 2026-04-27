import React from 'react';
import { AsciiOptions, DENSITY_MAPS } from '../types';
import { Sliders, Monitor, Type, Palette } from 'lucide-react';
import { playButtonSound } from '../utils/soundEffects';

interface ControlPanelProps {
  options: AsciiOptions;
  setOptions: React.Dispatch<React.SetStateAction<AsciiOptions>>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ options, setOptions }) => {
  const handleChange = (key: keyof AsciiOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleModeChange = (key: keyof AsciiOptions, value: any) => {
    playButtonSound();
    handleChange(key, value);
  };

  return (
    <div className="absolute bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 rounded-2xl border border-green-500/20 bg-black/72 px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.45),0_0_24px_rgba(0,255,65,0.08)] backdrop-blur-xl transition-all duration-300">
      <div className="flex flex-wrap gap-6 justify-center items-center text-green-500 text-xs font-mono">
        <div className="flex flex-col gap-1 w-32">
          <div className="flex items-center gap-2 mb-1">
            <Type className="w-3 h-3" />
            <label>FONT SIZE: {options.fontSize}px</label>
          </div>
          <input
            type="range"
            min="6"
            max="24"
            value={options.fontSize}
            onChange={(e) => handleChange('fontSize', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-1 w-32">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-3 h-3" />
            <label>GAIN: {options.brightness.toFixed(1)}</label>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={options.brightness}
            onChange={(e) => handleChange('brightness', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-1 w-32">
          <div className="flex items-center gap-2 mb-1">
            <Monitor className="w-3 h-3" />
            <label>CONTRAST: {options.contrast.toFixed(1)}</label>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={options.contrast}
            onChange={(e) => handleChange('contrast', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-3 h-3" />
            <span>MODE</span>
          </div>
          <div className="flex gap-1">
            {(['matrix', 'bw', 'retro', 'color'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange('colorMode', mode)}
                className={`px-2 py-1 border ${options.colorMode === mode ? 'bg-green-500 text-black border-green-500' : 'bg-transparent border-green-800 text-green-700 hover:border-green-500'} text-[10px] uppercase transition-colors`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Type className="w-3 h-3" />
            <span>CHARSET</span>
          </div>
          <div className="flex gap-1">
            {(Object.keys(DENSITY_MAPS) as Array<keyof typeof DENSITY_MAPS>).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange('density', mode)}
                className={`px-2 py-1 border ${options.density === mode ? 'bg-green-500 text-black border-green-500' : 'bg-transparent border-green-800 text-green-700 hover:border-green-500'} text-[10px] uppercase transition-colors`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
