import React, { useState } from 'react';
import { X, Loader2, RefreshCw, Check, Grid3x3, AlertCircle, Image as ImageIcon, Crop } from 'lucide-react';
import { NineGridData, NineGridPanel } from '../../types';
import { NINE_GRID } from './constants';

interface NineGridPreviewProps {
  isOpen: boolean;
  nineGrid?: NineGridData;
  onClose: () => void;
  onSelectPanel: (panel: NineGridPanel) => void;
  onUseWholeImage: () => void;  // 整张九宫格图直接用作首帧
  onRegenerate: () => void;
}

const NineGridPreview: React.FC<NineGridPreviewProps> = ({
  isOpen,
  nineGrid,
  onClose,
  onSelectPanel,
  onUseWholeImage,
  onRegenerate
}) => {
  const [hoveredPanel, setHoveredPanel] = useState<number | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<number | null>(null);

  if (!isOpen) return null;

  const isGenerating = nineGrid?.status === 'generating';
  const hasFailed = nineGrid?.status === 'failed';
  const isCompleted = nineGrid?.status === 'completed' && nineGrid?.imageUrl;

  const handlePanelClick = (index: number) => {
    setSelectedPanel(selectedPanel === index ? null : index);
  };

  const handleConfirmSelect = () => {
    if (selectedPanel !== null && nineGrid?.panels?.[selectedPanel]) {
      onSelectPanel(nineGrid.panels[selectedPanel]);
      setSelectedPanel(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-center gap-3">
            <Grid3x3 className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              九宫格分镜预览
            </h3>
            <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-0.5 rounded">
              Advanced
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <button
                onClick={onRegenerate}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                title="重新生成九宫格"
              >
                <RefreshCw className="w-3 h-3" />
                重新生成
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                正在生成九宫格分镜...
              </h4>
              <p className="text-sm text-[var(--text-tertiary)]">
                AI正在拆分镜头视角并生成预览图，请耐心等待
              </p>
            </div>
          )}

          {/* Failed State */}
          {hasFailed && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-12 h-12 text-[var(--error)] mb-6 opacity-60" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                生成失败
              </h4>
              <p className="text-sm text-[var(--text-tertiary)] mb-6">
                九宫格分镜生成失败，请重试
              </p>
              <button
                onClick={onRegenerate}
                className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                重新生成
              </button>
            </div>
          )}

          {/* Completed State - Main Content */}
          {isCompleted && nineGrid && (
            <div className="p-6 space-y-4">
              <div className="flex gap-6">
                {/* Left: Nine Grid Image with overlay grid */}
                <div className="flex-1 min-w-0">
                  <div className="relative bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
                    {/* Base Image - 自适应实际图片比例 */}
                    <img
                      src={nineGrid.imageUrl}
                      className="w-full h-auto block"
                      alt="九宫格分镜预览"
                    />
                    
                    {/* Overlay Grid - 3x3 clickable areas, 完全覆盖图片 */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`relative border transition-all duration-200 cursor-pointer group/cell ${
                            selectedPanel === idx
                              ? 'border-[var(--accent)] border-2 bg-[var(--accent)]/10 shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.15)]'
                              : hoveredPanel === idx
                                ? 'border-white/40 bg-white/5'
                                : 'border-transparent hover:border-white/20'
                          }`}
                          onMouseEnter={() => setHoveredPanel(idx)}
                          onMouseLeave={() => setHoveredPanel(null)}
                          onClick={() => handlePanelClick(idx)}
                        >
                          {/* Panel index badge */}
                          <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-opacity ${
                            hoveredPanel === idx || selectedPanel === idx
                              ? 'opacity-100'
                              : 'opacity-0 group-hover/cell:opacity-60'
                          } ${
                            selectedPanel === idx
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-black/60 text-white'
                          }`}>
                            {idx + 1}
                          </div>

                          {/* Selected checkmark */}
                          {selectedPanel === idx && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}

                          {/* Hover tooltip */}
                          {hoveredPanel === idx && nineGrid.panels[idx] && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                              <p className="text-white text-[9px] font-bold">
                                {nineGrid.panels[idx].shotSize} / {nineGrid.panels[idx].cameraAngle}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Panel descriptions list */}
                <div className="w-64 shrink-0 space-y-2">
                  <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest pb-1 border-b border-[var(--border-primary)]">
                    视角列表
                  </h4>
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                    {nineGrid.panels.map((panel, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                          selectedPanel === idx
                            ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] ring-1 ring-[var(--accent)]'
                            : hoveredPanel === idx
                              ? 'bg-[var(--bg-hover)] border-[var(--border-secondary)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                        onMouseEnter={() => setHoveredPanel(idx)}
                        onMouseLeave={() => setHoveredPanel(null)}
                        onClick={() => handlePanelClick(idx)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                            selectedPanel === idx
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate">
                            {panel.shotSize} / {panel.cameraAngle}
                          </span>
                        </div>
                        <p className="text-[9px] text-[var(--text-tertiary)] leading-relaxed line-clamp-2 ml-7">
                          {panel.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-primary)]">
                <p className="text-[10px] text-[var(--text-muted)] max-w-[280px]">
                  {selectedPanel !== null 
                    ? `已选择面板 ${selectedPanel + 1}: ${nineGrid.panels[selectedPanel]?.shotSize} / ${nineGrid.panels[selectedPanel]?.cameraAngle}`
                    : '可直接使用整张九宫格图作为首帧，或点击选择某个格子裁剪使用'
                  }
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={onUseWholeImage}
                    className="px-3 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-primary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3 h-3" />
                    整图用作首帧
                  </button>
                  <button
                    onClick={handleConfirmSelect}
                    disabled={selectedPanel === null}
                    className="px-3 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[var(--btn-primary-shadow)]"
                  >
                    <Crop className="w-3 h-3" />
                    裁剪选中格用作首帧
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pending State (initial, before first generation) */}
          {!nineGrid && (
            <div className="flex flex-col items-center justify-center py-20">
              <Grid3x3 className="w-12 h-12 text-[var(--text-muted)] mb-6 opacity-40" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                九宫格分镜预览
              </h4>
              <p className="text-sm text-[var(--text-tertiary)] mb-6 text-center max-w-md">
                AI将自动将当前镜头拆分为9个不同的摄影视角，<br/>
                生成一张3x3网格预览图，帮助你选择最佳构图方案
              </p>
              <button
                onClick={onRegenerate}
                className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-[var(--btn-primary-shadow)]"
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                开始生成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NineGridPreview;
