import React from 'react';
import { MapPin, Check, Sparkles, Loader2, Upload, Trash2 } from 'lucide-react';
import PromptEditor from './PromptEditor';
import ImageUploadButton from './ImageUploadButton';

interface SceneCardProps {
  scene: {
    id: string;
    location: string;
    time: string;
    atmosphere: string;
    visualPrompt?: string;
    referenceImage?: string;
  };
  isGenerating: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onPromptSave: (newPrompt: string) => void;
  onImageClick: (imageUrl: string) => void;
  onDelete: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  isGenerating,
  onGenerate,
  onUpload,
  onPromptSave,
  onImageClick,
  onDelete,
}) => {
  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-xl overflow-hidden flex flex-col group hover:border-zinc-600 transition-all hover:shadow-lg">
      <div 
        className="aspect-video bg-zinc-900 relative cursor-pointer"
        onClick={() => scene.referenceImage && onImageClick(scene.referenceImage)}
      >
        {scene.referenceImage ? (
          <>
            <img src={scene.referenceImage} alt={scene.location} className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 p-1 bg-indigo-500 text-white rounded shadow-lg backdrop-blur">
              <Check className="w-3 h-3" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-4 text-center">
            <MapPin className="w-10 h-10 mb-3 opacity-10" />
            <ImageUploadButton
              variant="inline"
              size="medium"
              onUpload={onUpload}
              onGenerate={onGenerate}
              isGenerating={isGenerating}
              uploadLabel="上传"
              generateLabel="生成"
            />
          </div>
        )}
      </div>
      
      <div className="p-3 border-t border-zinc-800 bg-[#111]">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-zinc-200 text-sm truncate">{scene.location}</h3>
          <span className="px-1.5 py-0.5 bg-zinc-900 text-zinc-500 text-[9px] rounded border border-zinc-800 uppercase font-mono">
            {scene.time}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 line-clamp-1 mb-3">{scene.atmosphere}</p>

        {/* Scene Prompt Section */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <PromptEditor
            prompt={scene.visualPrompt || ''}
            onSave={onPromptSave}
            label="场景提示词"
            placeholder="输入场景视觉描述..."
            maxHeight="max-h-[120px]"
          />
        </div>

        {/* Regenerate and Upload Buttons */}
        {scene.referenceImage && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <ImageUploadButton
              variant="separate"
              hasImage={true}
              onUpload={onUpload}
              onGenerate={onGenerate}
              isGenerating={isGenerating}
              uploadLabel="上传图片"
            />
          </div>
        )}

        {/* Delete Button */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <button
            onClick={onDelete}
            disabled={isGenerating}
            className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/50 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3 h-3" />
            删除场景
          </button>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
