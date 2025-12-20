import React from 'react';
import { User, Check, Sparkles, Loader2, Shirt, Trash2 } from 'lucide-react';
import { Character } from '../../types';
import PromptEditor from './PromptEditor';
import ImageUploadButton from './ImageUploadButton';

interface CharacterCardProps {
  character: Character;
  isGenerating: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onPromptSave: (newPrompt: string) => void;
  onOpenWardrobe: () => void;
  onImageClick: (imageUrl: string) => void;
  onDelete: () => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isGenerating,
  onGenerate,
  onUpload,
  onPromptSave,
  onOpenWardrobe,
  onImageClick,
  onDelete,
}) => {
  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-xl overflow-hidden flex flex-col group hover:border-zinc-600 transition-all hover:shadow-lg">
      <div className="flex gap-4 p-4 pb-0">
        {/* Character Image */}
        <div className="w-48 flex-shrink-0">
          <div 
            className="aspect-video bg-zinc-900 relative rounded-lg overflow-hidden cursor-pointer"
            onClick={() => character.referenceImage && onImageClick(character.referenceImage)}
          >
            {character.referenceImage ? (
              <>
                <img src={character.referenceImage} alt={character.name} className="w-full h-full object-cover" />
                <div className="absolute top-1.5 right-1.5 p-1 bg-indigo-500 text-white rounded shadow-lg">
                  <Check className="w-3 h-3" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-2 text-center">
                <User className="w-8 h-8 mb-2 opacity-10" />
                <ImageUploadButton
                  variant="inline"
                  size="small"
                  onUpload={onUpload}
                  onGenerate={onGenerate}
                  isGenerating={isGenerating}
                  uploadLabel="上传"
                  generateLabel="生成"
                />
              </div>
            )}
          </div>
        </div>

        {/* Character Info & Actions */}
        <div className="flex-1 flex flex-col min-w-0 justify-between">
          {/* Header */}
          <div>
            <h3 className="font-bold text-white text-base mb-1">{character.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 font-mono uppercase bg-zinc-900 px-2 py-0.5 rounded">
                {character.gender}
              </span>
              <span className="text-[10px] text-zinc-500">{character.age}</span>
              {character.variations && character.variations.length > 0 && (
                <span className="text-[9px] text-zinc-400 font-mono flex items-center gap-1 bg-zinc-900 px-1.5 py-0.5 rounded">
                  <Shirt className="w-2.5 h-2.5" /> +{character.variations.length}
                </span>
              )}
            </div>
          </div>

          {/* Actions Row */}
          <div className="flex flex-col gap-2 mt-2">
            {/* Manage Wardrobe Button */}
            <button 
              onClick={onOpenWardrobe}
              className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors"
            >
              <Shirt className="w-3 h-3" />
              服装变体
            </button>

            {/* Upload Button */}
            {character.referenceImage && (
              <div className="w-full">
                <ImageUploadButton
                  variant="separate"
                  hasImage={true}
                  onUpload={onUpload}
                  onGenerate={onGenerate}
                  isGenerating={isGenerating}
                  uploadLabel="上传"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Section & Generate Button */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Prompt Section */}
        <div className="flex-1 mb-3">
          <PromptEditor
            prompt={character.visualPrompt || ''}
            onSave={onPromptSave}
            label="角色提示词"
            placeholder="输入角色的视觉描述..."
          />
        </div>

        {/* Quick Generate Button */}
        <button
          onClick={onGenerate}
          disabled={isGenerating || !character.visualPrompt}
          className="w-full py-2 bg-white hover:bg-zinc-200 text-black rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              {character.referenceImage ? '重新生成图片' : '生成角色图片'}
            </>
          )}
        </button>

        {/* Delete Button */}
        <button
          onClick={onDelete}
          disabled={isGenerating}
          className="w-full py-2 mt-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/50 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" />
          删除角色
        </button>
      </div>
    </div>
  );
};

export default CharacterCard;
