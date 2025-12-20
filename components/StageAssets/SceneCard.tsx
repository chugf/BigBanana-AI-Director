import React, { useState } from 'react';
import { MapPin, Check, Sparkles, Loader2, Upload, Trash2, Edit2 } from 'lucide-react';
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
  onUpdateInfo: (updates: { location?: string; time?: string; atmosphere?: string }) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  isGenerating,
  onGenerate,
  onUpload,
  onPromptSave,
  onImageClick,
  onDelete,
  onUpdateInfo,
}) => {
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [isEditingAtmosphere, setIsEditingAtmosphere] = useState(false);
  const [editLocation, setEditLocation] = useState(scene.location);
  const [editTime, setEditTime] = useState(scene.time);
  const [editAtmosphere, setEditAtmosphere] = useState(scene.atmosphere);

  const handleSaveLocation = () => {
    if (editLocation.trim()) {
      onUpdateInfo({ location: editLocation.trim() });
      setIsEditingLocation(false);
    }
  };

  const handleSaveTime = () => {
    if (editTime.trim()) {
      onUpdateInfo({ time: editTime.trim() });
      setIsEditingTime(false);
    }
  };

  const handleSaveAtmosphere = () => {
    if (editAtmosphere.trim()) {
      onUpdateInfo({ atmosphere: editAtmosphere.trim() });
      setIsEditingAtmosphere(false);
    }
  };

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
          {isEditingLocation ? (
            <input
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              onBlur={handleSaveLocation}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveLocation()}
              autoFocus
              className="font-bold text-zinc-200 text-sm bg-zinc-800 border border-zinc-600 rounded px-2 py-1 flex-1 mr-2 focus:outline-none focus:border-indigo-500"
            />
          ) : (
            <div className="flex items-center gap-2 flex-1 group/location">
              <h3 className="font-bold text-zinc-200 text-sm truncate">{scene.location}</h3>
              <button
                onClick={() => {
                  setEditLocation(scene.location);
                  setIsEditingLocation(true);
                }}
                className="opacity-0 group-hover/location:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity flex-shrink-0"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {isEditingTime ? (
            <input
              type="text"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              onBlur={handleSaveTime}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveTime()}
              autoFocus
              className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 text-zinc-300 text-[9px] rounded uppercase font-mono focus:outline-none focus:border-indigo-500 w-24"
            />
          ) : (
            <span
              onClick={() => {
                setEditTime(scene.time);
                setIsEditingTime(true);
              }}
              className="px-1.5 py-0.5 bg-zinc-900 text-zinc-500 text-[9px] rounded border border-zinc-800 uppercase font-mono cursor-pointer hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              {scene.time}
            </span>
          )}
        </div>
        {isEditingAtmosphere ? (
          <input
            type="text"
            value={editAtmosphere}
            onChange={(e) => setEditAtmosphere(e.target.value)}
            onBlur={handleSaveAtmosphere}
            onKeyPress={(e) => e.key === 'Enter' && handleSaveAtmosphere()}
            autoFocus
            className="text-[10px] text-zinc-300 w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 mb-3 focus:outline-none focus:border-indigo-500"
          />
        ) : (
          <p
            onClick={() => {
              setEditAtmosphere(scene.atmosphere);
              setIsEditingAtmosphere(true);
            }}
            className="text-[10px] text-zinc-500 line-clamp-1 mb-3 cursor-pointer hover:text-zinc-300 transition-colors"
          >
            {scene.atmosphere}
          </p>
        )}

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
