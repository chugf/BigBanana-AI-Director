import React from 'react';
import { Loader2, Edit2, Upload, ArrowRight } from 'lucide-react';
import { Keyframe } from '../../types';

interface KeyframeEditorProps {
  startKeyframe?: Keyframe;
  endKeyframe?: Keyframe;
  canCopyPrevious: boolean;
  onGenerateKeyframe: (type: 'start' | 'end') => void;
  onUploadKeyframe: (type: 'start' | 'end') => void;
  onEditPrompt: (type: 'start' | 'end', prompt: string) => void;
  onCopyPrevious: () => void;
  onImageClick: (url: string, title: string) => void;
}

const KeyframeEditor: React.FC<KeyframeEditorProps> = ({
  startKeyframe,
  endKeyframe,
  canCopyPrevious,
  onGenerateKeyframe,
  onUploadKeyframe,
  onEditPrompt,
  onCopyPrevious,
  onImageClick
}) => {
  const renderKeyframePanel = (
    type: 'start' | 'end',
    keyframe?: Keyframe,
    label: string
  ) => {
    const isGenerating = keyframe?.status === 'generating';
    const hasFailed = keyframe?.status === 'failed';
    
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {label}
          </label>
          {keyframe?.visualPrompt && (
            <button
              onClick={() => onEditPrompt(type, keyframe.visualPrompt!)}
              className="p-1 text-yellow-400 hover:text-white transition-colors"
              title="编辑提示词"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
        
        <div className="aspect-video bg-black rounded-lg border border-zinc-800 overflow-hidden relative group">
          {keyframe?.imageUrl ? (
            <>
              <img
                src={keyframe.imageUrl}
                className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                onClick={() => onImageClick(keyframe.imageUrl!, `${label} - 关键帧`)}
                alt={label}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="text-white text-xs font-mono">点击预览</span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 p-2">
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin mb-2 text-indigo-500" />
                  <span className="text-[10px] text-zinc-500">生成中...</span>
                </>
              ) : hasFailed ? (
                <>
                  <span className="text-[10px] text-red-500 mb-2">生成失败</span>
                  <button
                    onClick={() => onGenerateKeyframe(type)}
                    className="px-2 py-1 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded text-[9px] font-bold transition-colors border border-red-700"
                  >
                    重试
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-center">未生成</span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isGenerating && (
            <>
              <button
                onClick={() => onGenerateKeyframe(type)}
                disabled={isGenerating}
                className="flex-1 py-1.5 bg-white hover:bg-zinc-200 text-black rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {keyframe?.imageUrl ? '重新生成' : '生成'}
              </button>
              <button
                onClick={() => onUploadKeyframe(type)}
                className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
              >
                <Upload className="w-3 h-3" />
                上传
              </button>
            </>
          )}
        </div>

        {/* Copy Previous Button for Start Frame */}
        {type === 'start' && canCopyPrevious && !keyframe?.imageUrl && (
          <button
            onClick={onCopyPrevious}
            className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border border-zinc-700"
          >
            <ArrowRight className="w-3 h-3" />
            复制上一镜头尾帧
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          视觉制作 (Visual Production)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {renderKeyframePanel('start', startKeyframe, '起始帧')}
        {renderKeyframePanel('end', endKeyframe, '结束帧')}
      </div>
    </div>
  );
};

export default KeyframeEditor;
