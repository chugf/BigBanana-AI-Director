import React, { useState, useEffect } from 'react';
import { X, Key, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { verifyApiKey } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiKey: string;
  onSaveApiKey: (key: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  currentApiKey, 
  onSaveApiKey 
}) => {
  const [inputKey, setInputKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');

  // 初始化输入框
  useEffect(() => {
    if (isOpen) {
      setInputKey(currentApiKey);
      setVerifyStatus(currentApiKey ? 'success' : 'idle');
      setVerifyMessage(currentApiKey ? 'API Key 已配置' : '');
    }
  }, [isOpen, currentApiKey]);

  const handleVerifyAndSave = async () => {
    if (!inputKey.trim()) {
      setVerifyStatus('error');
      setVerifyMessage('请输入 API Key');
      return;
    }

    setIsVerifying(true);
    setVerifyStatus('idle');
    setVerifyMessage('');

    try {
      const result = await verifyApiKey(inputKey.trim());
      
      if (result.success) {
        setVerifyStatus('success');
        setVerifyMessage('验证成功！API Key 已保存');
        onSaveApiKey(inputKey.trim());
      } else {
        setVerifyStatus('error');
        setVerifyMessage(result.message);
      }
    } catch (error: any) {
      setVerifyStatus('error');
      setVerifyMessage(error.message || '验证过程出错');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
    setInputKey('');
    setVerifyStatus('idle');
    setVerifyMessage('');
    onSaveApiKey('');
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* 弹窗 */}
      <div 
        className="relative z-10 w-full max-w-md mx-4 bg-[#0A0A0A] border border-zinc-800 rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Key className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">系统设置</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* API Key 配置 */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              BigBanana API Key
            </label>
            <input
              type="password"
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                setVerifyStatus('idle');
                setVerifyMessage('');
              }}
              placeholder="输入你的 API Key..."
              className="w-full bg-[#141414] border border-zinc-800 text-white px-4 py-3 text-sm rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-900 transition-all font-mono placeholder:text-zinc-700"
              disabled={isVerifying}
            />
            
            {/* 状态提示 */}
            {verifyMessage && (
              <div className={`mt-3 flex items-center gap-2 text-xs ${
                verifyStatus === 'success' ? 'text-green-400' : 'text-red-400'
              }`}>
                {verifyStatus === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {verifyMessage}
              </div>
            )}

            {/* 帮助文字 */}
            <div className="mt-3 text-[10px] text-zinc-600 leading-relaxed space-y-1">
              <p>
                需要 BigBanana API 支持图片和视频生成功能。
              </p>
              <div className="flex items-center gap-3">
                <a 
                  href="https://api.antsk.cn" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  立即购买 <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-zinc-700">|</span>
                <a 
                  href="https://ocnf8yod3ljg.feishu.cn/wiki/MgFVw2EoQieTLKktaf2cHvu6nY3" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  使用教程 <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            {currentApiKey && (
              <button
                onClick={handleClearKey}
                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors rounded-lg border border-zinc-800"
              >
                清除 Key
              </button>
            )}
            <button
              onClick={handleVerifyAndSave}
              disabled={isVerifying || !inputKey.trim()}
              className="flex-1 py-3 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  验证中...
                </>
              ) : (
                '验证并保存'
              )}
            </button>
          </div>
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-4 border-t border-zinc-900 bg-[#080808] rounded-b-xl">
          <p className="text-[10px] text-zinc-600 text-center font-mono">
            Key 仅保存在本地浏览器，不会上传到服务器
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
