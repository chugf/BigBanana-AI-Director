import React from 'react';
import { BookOpen, Wand2, BrainCircuit, AlertCircle, ChevronRight, Aperture, Languages } from 'lucide-react';
import OptionSelector from './OptionSelector';
import { DURATION_OPTIONS, LANGUAGE_OPTIONS, MODEL_OPTIONS, VISUAL_STYLE_OPTIONS, STYLES } from './constants';

interface Props {
  title: string;
  duration: string;
  language: string;
  model: string;
  visualStyle: string;
  customDurationInput: string;
  customModelInput: string;
  customStyleInput: string;
  isProcessing: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onVisualStyleChange: (value: string) => void;
  onCustomDurationChange: (value: string) => void;
  onCustomModelChange: (value: string) => void;
  onCustomStyleChange: (value: string) => void;
  onAnalyze: () => void;
}

const ConfigPanel: React.FC<Props> = ({
  title,
  duration,
  language,
  model,
  visualStyle,
  customDurationInput,
  customModelInput,
  customStyleInput,
  isProcessing,
  error,
  onTitleChange,
  onDurationChange,
  onLanguageChange,
  onModelChange,
  onVisualStyleChange,
  onCustomDurationChange,
  onCustomModelChange,
  onCustomStyleChange,
  onAnalyze
}) => {
  return (
    <div className="w-96 border-r border-zinc-800 flex flex-col bg-[#0A0A0A]">
      {/* Header */}
      <div className="h-14 px-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-400" />
          项目配置
        </h2>
      </div>

      {/* Config Form */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <label className={STYLES.label}>项目标题</label>
          <input 
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={STYLES.input}
            placeholder="输入项目名称..."
          />
        </div>

        {/* Language */}
        <div className="space-y-2">
          <label className={STYLES.label}>输出语言</label>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className={STYLES.select}
            >
              {LANGUAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="absolute right-3 top-3 pointer-events-none">
              <ChevronRight className="w-4 h-4 text-zinc-600 rotate-90" />
            </div>
          </div>
        </div>

        {/* Duration */}
        <OptionSelector
          label="目标时长"
          options={DURATION_OPTIONS}
          value={duration}
          onChange={onDurationChange}
          customInput={customDurationInput}
          onCustomInputChange={onCustomDurationChange}
          customPlaceholder="输入时长 (如: 90s, 3m)"
          gridCols={2}
        />

        {/* Model */}
        <OptionSelector
          label="分镜生成模型"
          icon={<Aperture className="w-3 h-3" />}
          options={MODEL_OPTIONS}
          value={model}
          onChange={onModelChange}
          customInput={customModelInput}
          onCustomInputChange={onCustomModelChange}
          customPlaceholder="输入模型名称 (如: GPT-5.2)"
          gridCols={1}
          helpText="查看更多模型："
          helpLink={{
            text: 'https://api.antsk.cn/pricing',
            url: 'https://api.antsk.cn/pricing'
          }}
        />

        {/* Visual Style */}
        <OptionSelector
          label="视觉风格"
          icon={<Wand2 className="w-3 h-3" />}
          options={VISUAL_STYLE_OPTIONS}
          value={visualStyle}
          onChange={onVisualStyleChange}
          customInput={customStyleInput}
          onCustomInputChange={onCustomStyleChange}
          customPlaceholder="输入风格 (如: 水彩风格, 像素艺术)"
          gridCols={2}
        />
      </div>

      {/* Action Button */}
      <div className="p-6 border-t border-zinc-800 bg-[#0A0A0A]">
        <button
          onClick={onAnalyze}
          disabled={isProcessing}
          className={`w-full py-3.5 font-bold text-xs tracking-widest uppercase rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
            isProcessing 
              ? STYLES.button.disabled
              : STYLES.button.primary
          }`}
        >
          {isProcessing ? (
            <>
              <BrainCircuit className="w-4 h-4 animate-spin" />
              智能分析中...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              生成分镜脚本
            </>
          )}
        </button>
        {error && (
          <div className="mt-4 p-3 bg-red-900/10 border border-red-900/50 text-red-500 text-xs rounded flex items-center gap-2">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigPanel;
