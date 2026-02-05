/**
 * 模型配置弹窗
 * 独立的模型管理界面
 */

import React, { useRef, useState, useEffect } from 'react';
import { X, Settings, MessageSquare, Image, Video, Key, ExternalLink, Gift, Sparkles } from 'lucide-react';
import { ModelType, ModelDefinition } from '../../types/model';
import {
  getRegistryState,
  getModels,
  getActiveModelsConfig,
  setActiveModel,
  updateModel,
  registerModel,
  removeModel,
  getGlobalApiKey,
  setGlobalApiKey,
} from '../../services/modelRegistry';
import { verifyApiKey } from '../../services/modelService';
import ModelList from './ModelList';
import GlobalSettings from './GlobalSettings';

interface ModelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'global' | 'chat' | 'image' | 'video';

const ModelConfigModal: React.FC<ModelConfigModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [refreshKey, setRefreshKey] = useState(0);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const pointerDownOutsideRef = useRef(false);

  const refresh = () => setRefreshKey(k => k + 1);

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'global', label: '全局配置', icon: <Key className="w-4 h-4" /> },
    { id: 'chat', label: '对话模型', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'image', label: '图片模型', icon: <Image className="w-4 h-4" /> },
    { id: 'video', label: '视频模型', icon: <Video className="w-4 h-4" /> },
  ];

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onPointerDown={(e) => {
        // 仅当按下发生在弹窗外部时，才允许后续抬起关闭。
        const targetNode = e.target as Node;
        pointerDownOutsideRef.current = modalRef.current ? !modalRef.current.contains(targetNode) : true;
      }}
      onPointerUp={(e) => {
        // 避免在弹窗内选中文本/拖拽到外部抬起时误触发关闭
        if (!pointerDownOutsideRef.current) return;
        const targetNode = e.target as Node;
        const isOutside = modalRef.current ? !modalRef.current.contains(targetNode) : true;
        pointerDownOutsideRef.current = false;
        if (isOutside) onClose();
      }}
      onPointerCancel={() => {
        pointerDownOutsideRef.current = false;
      }}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* 弹窗 */}
      <div 
        className="relative z-10 w-full max-w-2xl mx-4 bg-[#0A0A0A] border border-zinc-800 rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-200 max-h-[85vh] flex flex-col"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">模型配置</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">MODEL CONFIGURATION</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-zinc-900 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border-b-2 ${
                activeTab === tab.id
                  ? 'text-white border-indigo-500 bg-zinc-900/30'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6" key={refreshKey}>
          {activeTab === 'global' ? (
            <GlobalSettings onRefresh={refresh} />
          ) : (
            <ModelList 
              type={activeTab as ModelType} 
              onRefresh={refresh}
            />
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-zinc-900 bg-[#080808] rounded-b-xl flex-shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-zinc-600 font-mono">
            配置仅保存在本地浏览器
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelConfigModal;
