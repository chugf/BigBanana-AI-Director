import React, { useState, useRef } from 'react';
import { User, MapPin, Check, Sparkles, Loader2, Users, RefreshCw, Shirt, Plus, X, Camera, ChevronRight, Edit3, Save, AlertCircle, Upload } from 'lucide-react';
import { ProjectState, Character, CharacterVariation } from '../types';
import { generateImage, generateVisualPrompts } from '../services/geminiService';
import { convertImageToBase64 } from '../services/storageService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
}

const StageAssets: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Variation Form State
  const [newVarName, setNewVarName] = useState("");
  const [newVarPrompt, setNewVarPrompt] = useState("");

  // Character Prompt Editing State
  const [editingPromptCharId, setEditingPromptCharId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");

  // Scene Prompt Editing State
  const [editingPromptSceneId, setEditingPromptSceneId] = useState<string | null>(null);
  const [editedScenePrompt, setEditedScenePrompt] = useState("");

  const handleGenerateAsset = async (type: 'character' | 'scene', id: string) => {
    setGeneratingIds(prev => new Set([...prev, id]));
    try {
      // Find the item
      let prompt = "";
      if (type === 'character') {
        const char = project.scriptData?.characters.find(c => String(c.id) === String(id));
        if (char) {
          // Use existing prompt or generate new one
          const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
          const language = project.language || project.scriptData?.language || '中文';
          prompt = char.visualPrompt || await generateVisualPrompts('character', char, project.scriptData?.genre || 'Cinematic', 'gpt-5.1', visualStyle, language);
          
          // Save the prompt if it was generated
          if (!char.visualPrompt && prompt && project.scriptData) {
            const newData = { ...project.scriptData };
            const c = newData.characters.find(c => String(c.id) === String(id));
            if (c) c.visualPrompt = prompt;
            updateProject({ scriptData: newData });
          }
        }
      } else {
        const scene = project.scriptData?.scenes.find(s => String(s.id) === String(id));
        if (scene) {
          const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
          const language = project.language || project.scriptData?.language || '中文';
          prompt = scene.visualPrompt || await generateVisualPrompts('scene', scene, project.scriptData?.genre || 'Cinematic', 'gpt-5.1', visualStyle, language);
          
          // Save the prompt if it was generated
          if (!scene.visualPrompt && prompt && project.scriptData) {
            const newData = { ...project.scriptData };
            const s = newData.scenes.find(s => String(s.id) === String(id));
            if (s) s.visualPrompt = prompt;
            updateProject({ scriptData: newData });
          }
        }
      }

      // Real API Call
      const imageUrl = await generateImage(prompt);

      // Update state
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        if (type === 'character') {
          const c = newData.characters.find(c => String(c.id) === String(id));
          if (c) c.referenceImage = imageUrl;
        } else {
          const s = newData.scenes.find(s => String(s.id) === String(id));
          if (s) s.referenceImage = imageUrl;
        }
        updateProject({ scriptData: newData });
      }

    } catch (e: any) {
      console.error(e);
      // Check if it's an API Key error
      if (onApiKeyError && onApiKeyError(e)) {
        return; // Error handled by parent
      }
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBatchGenerate = async (type: 'character' | 'scene') => {
    const items = type === 'character' 
      ? project.scriptData?.characters 
      : project.scriptData?.scenes;
    
    if (!items) return;

    // Filter items that need generation
    const itemsToGen = items.filter(i => !i.referenceImage);
    const isRegenerate = itemsToGen.length === 0;

    if (isRegenerate) {
       if(!window.confirm(`确定要重新生成所有${type === 'character' ? '角色' : '场景'}图吗？`)) return;
    }

    const targetItems = isRegenerate ? items : itemsToGen;

    setBatchProgress({ current: 0, total: targetItems.length });

    for (let i = 0; i < targetItems.length; i++) {
      // Rate Limit Mitigation: 3s delay
      if (i > 0) await new Promise(r => setTimeout(r, 3000));
      
      await handleGenerateAsset(type, targetItems[i].id);
      setBatchProgress({ current: i + 1, total: targetItems.length });
    }

    setBatchProgress(null);
  };

  const handleAddVariation = (charId: string) => {
      if (!project.scriptData) return;
      const newData = { ...project.scriptData };
      const char = newData.characters.find(c => c.id === charId);
      if (!char) return;

      const newVar: CharacterVariation = {
          id: `var-${Date.now()}`,
          name: newVarName || "New Outfit",
          visualPrompt: newVarPrompt || char.visualPrompt || "",
          referenceImage: undefined
      };

      if (!char.variations) char.variations = [];
      char.variations.push(newVar);
      
      updateProject({ scriptData: newData });
      setNewVarName("");
      setNewVarPrompt("");
  };

  const handleGenerateVariation = async (charId: string, varId: string) => {
      const char = project.scriptData?.characters.find(c => c.id === charId);
      const variation = char?.variations?.find(v => v.id === varId);
      if (!char || !variation) return;

      setGeneratingIds(prev => new Set([...prev, varId]));
      try {
          // IMPORTANT: Use Base Look as reference to maintain facial consistency
          const refImages = char.referenceImage ? [char.referenceImage] : [];
          // Enhance prompt to emphasize character consistency
          const enhancedPrompt = `Character: ${char.name}. ${variation.visualPrompt}. Keep facial features consistent with reference.`;
          
          const imageUrl = await generateImage(enhancedPrompt, refImages);

          const newData = { ...project.scriptData! };
          const c = newData.characters.find(c => c.id === charId);
          const v = c?.variations.find(v => v.id === varId);
          if (v) v.referenceImage = imageUrl;

          updateProject({ scriptData: newData });
      } catch (e: any) {
          console.error(e);
          // Check if it's an API Key error
          if (onApiKeyError && onApiKeyError(e)) {
            return; // Error handled by parent
          }
          alert("Variation generation failed");
      } finally {
          setGeneratingIds(prev => {
            const next = new Set(prev);
            next.delete(varId);
            return next;
          });
      }
  };
  
  const handleDeleteVariation = (charId: string, varId: string) => {
     if (!project.scriptData) return;
      const newData = { ...project.scriptData };
      const char = newData.characters.find(c => c.id === charId);
      if (!char) return;
      
      char.variations = char.variations.filter(v => v.id !== varId);
      updateProject({ scriptData: newData });
  };

  const handleSaveCharacterPrompt = (charId: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => c.id === charId);
    if (!char) return;
    
    char.visualPrompt = editedPrompt.trim();
    updateProject({ scriptData: newData });
    setEditingPromptCharId(null);
  };

  const handleStartEditPrompt = (charId: string, currentPrompt: string) => {
    setEditingPromptCharId(charId);
    setEditedPrompt(currentPrompt || '');
  };

  const handleCancelEditPrompt = () => {
    setEditingPromptCharId(null);
    setEditedPrompt('');
  };
  // Scene prompt editing handlers
  const handleSaveScenePrompt = (sceneId: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const scene = newData.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    scene.visualPrompt = editedScenePrompt.trim();
    updateProject({ scriptData: newData });
    setEditingPromptSceneId(null);
  };

  const handleStartEditScenePrompt = (sceneId: string, currentPrompt: string) => {
    setEditingPromptSceneId(sceneId);
    setEditedScenePrompt(currentPrompt);
  };

  const handleCancelEditScenePrompt = () => {
    setEditingPromptSceneId(null);
    setEditedScenePrompt("");
  };

  // 角色图片上传处理
  const handleUploadCharacterImage = async (charId: string, file: File) => {
    try {
      const base64 = await convertImageToBase64(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const char = newData.characters.find(c => c.id === charId);
        if (char) {
          char.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      console.error('图片上传失败:', e);
      alert(e.message || '图片上传失败');
    }
  };

  // 场景图片上传处理
  const handleUploadSceneImage = async (sceneId: string, file: File) => {
    try {
      const base64 = await convertImageToBase64(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const scene = newData.scenes.find(s => s.id === sceneId);
        if (scene) {
          scene.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      console.error('图片上传失败:', e);
      alert(e.message || '图片上传失败');
    }
  };

  // 角色变体图片上传处理
  const handleUploadVariationImage = async (charId: string, varId: string, file: File) => {
    try {
      const base64 = await convertImageToBase64(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const char = newData.characters.find(c => c.id === charId);
        const variation = char?.variations?.find(v => v.id === varId);
        if (variation) {
          variation.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      console.error('图片上传失败:', e);
      alert(e.message || '图片上传失败');
    }
  };
  if (!project.scriptData) return (
      <div className="h-full flex flex-col items-center justify-center bg-[#121212] text-zinc-500">
         <p>请先完成 Phase 01 剧本分析</p>
      </div>
  );
  
  const allCharactersReady = project.scriptData.characters.every(c => c.referenceImage);
  const allScenesReady = project.scriptData.scenes.every(s => s.referenceImage);
  const selectedChar = project.scriptData.characters.find(c => c.id === selectedCharId);

  return (
    <div className="flex flex-col h-full bg-[#121212] relative overflow-hidden">
      
      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 p-3 hover:bg-white/10 rounded-full transition-colors group z-10"
          >
            <X className="w-6 h-6 text-white group-hover:rotate-90 transition-transform" />
          </button>
          <div className="max-w-6xl max-h-[90vh] w-full px-8">
            <img 
              src={previewImage} 
              alt="Preview" 
              className="w-full h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur rounded-lg border border-white/10">
            <p className="text-xs text-zinc-300 font-mono">点击任意处关闭</p>
          </div>
        </div>
      )}

      {/* Global Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
          <h3 className="text-xl font-bold text-white mb-2">正在批量生成资源...</h3>
          <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
             <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div>
          </div>
          <p className="text-zinc-400 font-mono text-xs">进度: {batchProgress.current} / {batchProgress.total}</p>
        </div>
      )}

      {/* Wardrobe Modal */}
      {selectedChar && (
          <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
              <div className="bg-[#141414] border border-zinc-800 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                  {/* Modal Header */}
                  <div className="h-16 px-8 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-[#1A1A1A]">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
                              {selectedChar.referenceImage && <img src={selectedChar.referenceImage} className="w-full h-full object-cover"/>}
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-white">{selectedChar.name}</h3>
                              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Wardrobe & Variations</p>
                          </div>
                      </div>
                      <button onClick={() => setSelectedCharId(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                          <X className="w-5 h-5 text-zinc-500" />
                      </button>
                  </div>
                  
                  {/* Modal Body */}
                  <div className="flex-1 overflow-y-auto p-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Base Look */}
                          <div>
                              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <User className="w-4 h-4" /> Base Appearance
                              </h4>
                              <div className="bg-[#0A0A0A] p-4 rounded-xl border border-zinc-800">
                                  <div className="aspect-video bg-zinc-900 rounded-lg overflow-hidden mb-4 relative cursor-pointer" onClick={() => selectedChar.referenceImage && setPreviewImage(selectedChar.referenceImage)}>
                                      {selectedChar.referenceImage ? (
                                          <img src={selectedChar.referenceImage} className="w-full h-full object-cover" />
                                      ) : (
                                          <div className="flex items-center justify-center h-full text-zinc-700">No Image</div>
                                      )}
                                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] text-white font-bold uppercase border border-white/10">Default</div>
                                  </div>
                                  <p className="text-xs text-zinc-500 leading-relaxed font-mono">{selectedChar.visualPrompt}</p>
                              </div>
                          </div>

                          {/* Variations */}
                          <div>
                              <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                      <Shirt className="w-4 h-4" /> Variations / Outfits
                                  </h4>
                              </div>

                              <div className="space-y-4">
                                  {/* List */}
                                  {(selectedChar.variations || []).map((variation) => (
                                      <div key={variation.id} className="flex gap-4 p-4 bg-[#0A0A0A] border border-zinc-800 rounded-xl group hover:border-zinc-700 transition-colors">
                                          <div className="w-20 h-24 bg-zinc-900 rounded-lg flex-shrink-0 overflow-hidden relative border border-zinc-800">
                                              {variation.referenceImage ? (
                                                  <img src={variation.referenceImage} className="w-full h-full object-cover" />
                                              ) : (
                                                  <div className="w-full h-full flex items-center justify-center">
                                                      <Shirt className="w-6 h-6 text-zinc-800" />
                                                  </div>
                                              )}
                                              {generatingIds.has(variation.id) && (
                                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                                                  </div>
                                              )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                              <div className="flex justify-between items-start mb-2">
                                                  <h5 className="font-bold text-zinc-200 text-sm">{variation.name}</h5>
                                                  <button onClick={() => handleDeleteVariation(selectedChar.id, variation.id)} className="text-zinc-600 hover:text-red-500"><X className="w-3 h-3"/></button>
                                              </div>
                                              <p className="text-[10px] text-zinc-500 line-clamp-2 mb-3 font-mono">{variation.visualPrompt}</p>
                                              <div className="flex gap-3">
                                                <button 
                                                    onClick={() => handleGenerateVariation(selectedChar.id, variation.id)}
                                                    disabled={generatingIds.has(variation.id)}
                                                    className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white flex items-center gap-1 transition-colors"
                                                >
                                                    <RefreshCw className={`w-3 h-3 ${generatingIds.has(variation.id) ? 'animate-spin' : ''}`} />
                                                    {variation.referenceImage ? 'Regenerate' : 'Generate Look'}
                                                </button>
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer">
                                                    <Upload className="w-3 h-3" />
                                                    Upload
                                                    <input
                                                      type="file"
                                                      accept="image/*"
                                                      className="hidden"
                                                      onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                          handleUploadVariationImage(selectedChar.id, variation.id, file);
                                                          e.target.value = '';
                                                        }
                                                      }}
                                                    />
                                                </label>
                                              </div>
                                          </div>
                                      </div>
                                  ))}

                                  {/* Add New */}
                                  <div className="p-4 border border-dashed border-zinc-800 rounded-xl bg-[#0A0A0A]/50">
                                      <div className="space-y-3">
                                          <input 
                                              type="text" 
                                              placeholder="Variation Name (e.g. Tactical Gear)" 
                                              value={newVarName}
                                              onChange={e => setNewVarName(e.target.value)}
                                              className="w-full bg-[#141414] border border-zinc-800 rounded px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                                          />
                                          <textarea 
                                              placeholder="Visual description of outfit/state..."
                                              value={newVarPrompt}
                                              onChange={e => setNewVarPrompt(e.target.value)}
                                              className="w-full bg-[#141414] border border-zinc-800 rounded px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none h-16"
                                          />
                                          <button 
                                              onClick={() => handleAddVariation(selectedChar.id)}
                                              disabled={!newVarName || !newVarPrompt}
                                              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                                          >
                                              <Plus className="w-3 h-3" /> Add Variation
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Header - Consistent with Director */}
      <div className="h-16 border-b border-zinc-800 bg-[#1A1A1A] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  <Users className="w-5 h-5 text-indigo-500" />
                  角色与场景
                  <span className="text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded">Assets & Casting</span>
              </h2>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex gap-2">
                 <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono uppercase">
                    {project.scriptData.characters.length} CHARS
                 </span>
                 <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono uppercase">
                    {project.scriptData.scenes.length} SCENES
                 </span>
             </div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-12">
        {/* Characters Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-zinc-800 pb-4">
            <div>
               <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                 角色定妆 (Casting)
               </h3>
               <p className="text-xs text-zinc-500 mt-1 pl-3.5">为剧本中的角色生成一致的参考形象</p>
            </div>
            <button 
              onClick={() => handleBatchGenerate('character')}
              disabled={!!batchProgress}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
                  allCharactersReady
                    ? 'bg-[#141414] text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500'
                    : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5'
              }`}
            >
              {allCharactersReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              {allCharactersReady ? '重新生成所有角色' : '一键生成所有角色'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {project.scriptData.characters.map((char) => (
              <div key={char.id} className="bg-[#141414] border border-zinc-800 rounded-xl overflow-hidden flex flex-col group hover:border-zinc-600 transition-all hover:shadow-lg">
                <div className="flex gap-4 p-4">
                  {/* Character Image */}
                  <div className="w-48 flex-shrink-0">
                    <div className="aspect-video bg-zinc-900 relative rounded-lg overflow-hidden cursor-pointer" onClick={() => char.referenceImage && setPreviewImage(char.referenceImage)}>
                      {char.referenceImage ? (
                        <>
                          <img src={char.referenceImage} alt={char.name} className="w-full h-full object-cover" />
                          <div className="absolute top-1.5 right-1.5 p-1 bg-indigo-500 text-white rounded shadow-lg">
                            <Check className="w-3 h-3" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-2 text-center">
                          <User className="w-8 h-8 mb-2 opacity-10" />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleGenerateAsset('character', char.id)}
                              disabled={generatingIds.has(char.id)}
                              className="px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded text-[10px] font-bold transition-all border border-zinc-700 flex items-center gap-1"
                            >
                              {generatingIds.has(char.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              生成
                            </button>
                            <label className="px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded text-[10px] font-bold transition-all border border-zinc-700 flex items-center gap-1 cursor-pointer">
                              <Upload className="w-3 h-3" />
                              上传
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleUploadCharacterImage(char.id, file);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Manage Wardrobe Button */}
                    <button 
                      onClick={() => setSelectedCharId(char.id)}
                      className="w-full mt-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors"
                    >
                      <Shirt className="w-3 h-3" />
                      服装变体
                    </button>

                    {/* Regenerate and Upload Buttons moved below wardrobe */}
                    {char.referenceImage && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleGenerateAsset('character', char.id)}
                          disabled={generatingIds.has(char.id)}
                          className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors"
                        >
                          {generatingIds.has(char.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {generatingIds.has(char.id) ? '生成中...' : '重新生成'}
                        </button>
                        <label className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          上传图片
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadCharacterImage(char.id, file);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Character Info & Prompt */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="mb-3">
                      <h3 className="font-bold text-white text-base mb-1">{char.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase bg-zinc-900 px-2 py-0.5 rounded">{char.gender}</span>
                        <span className="text-[10px] text-zinc-500">{char.age}</span>
                        {char.variations && char.variations.length > 0 && (
                          <span className="text-[9px] text-zinc-400 font-mono flex items-center gap-1 bg-zinc-900 px-1.5 py-0.5 rounded">
                            <Shirt className="w-2.5 h-2.5" /> +{char.variations.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prompt Section */}
                    <div className="flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                          <Camera className="w-3 h-3" />
                          角色提示词
                        </label>
                        {editingPromptCharId !== char.id && (
                          <button
                            onClick={() => handleStartEditPrompt(char.id, char.visualPrompt || '')}
                            className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded"
                            title="编辑提示词"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {editingPromptCharId === char.id ? (
                        /* 编辑模式 */
                        <div className="flex-1 flex flex-col gap-2">
                          <textarea
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            className="flex-1 bg-black border border-indigo-500 text-white px-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none font-mono leading-relaxed min-h-[100px] max-h-[200px]"
                            placeholder="输入角色的视觉描述..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveCharacterPrompt(char.id)}
                              className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Save className="w-3 h-3" />
                              保存
                            </button>
                            <button
                              onClick={handleCancelEditPrompt}
                              className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 显示模式 */
                        <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 overflow-y-auto max-h-[200px]">
                          {char.visualPrompt ? (
                            <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                              {char.visualPrompt}
                            </p>
                          ) : (
                            <div className="flex items-start gap-2 text-zinc-600">
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <p className="text-[10px] leading-relaxed">
                                未设置提示词。点击编辑按钮添加角色的视觉描述。
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick Actions */}
                    {!editingPromptCharId && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        <button
                          onClick={() => handleGenerateAsset('character', char.id)}
                          disabled={generatingIds.has(char.id) || !char.visualPrompt}
                          className="w-full py-2 bg-white hover:bg-zinc-200 text-black rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
                        >
                          {generatingIds.has(char.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              {char.referenceImage ? '重新生成图片' : '生成角色图片'}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Scenes Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-zinc-800 pb-4">
            <div>
               <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                 场景概念 (Locations)
               </h3>
               <p className="text-xs text-zinc-500 mt-1 pl-3.5">为剧本场景生成环境参考图</p>
            </div>
            <button 
              onClick={() => handleBatchGenerate('scene')}
              disabled={!!batchProgress}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
                  allScenesReady
                    ? 'bg-[#141414] text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500'
                    : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5'
              }`}
            >
              {allScenesReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              {allScenesReady ? '重新生成所有场景' : '一键生成所有场景'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {project.scriptData.scenes.map((scene) => (
              <div key={scene.id} className="bg-[#141414] border border-zinc-800 rounded-xl overflow-hidden flex flex-col group hover:border-zinc-600 transition-all hover:shadow-lg">
                <div className="aspect-video bg-zinc-900 relative cursor-pointer" onClick={() => scene.referenceImage && setPreviewImage(scene.referenceImage)}>
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
                       <div className="flex gap-2">
                         <button
                            onClick={() => handleGenerateAsset('scene', scene.id)}
                            disabled={generatingIds.has(scene.id)}
                            className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded text-xs font-bold transition-all border border-zinc-700 flex items-center gap-2"
                         >
                            {generatingIds.has(scene.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            生成
                         </button>
                         <label className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded text-xs font-bold transition-all border border-zinc-700 flex items-center gap-2 cursor-pointer">
                            <Upload className="w-3 h-3" />
                            上传
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadSceneImage(scene.id, file);
                                  e.target.value = '';
                                }
                              }}
                            />
                         </label>
                       </div>
                     </div>
                  )}
                </div>
                <div className="p-3 border-t border-zinc-800 bg-[#111]">
                  <div className="flex justify-between items-center mb-1">
                     <h3 className="font-bold text-zinc-200 text-sm truncate">{scene.location}</h3>
                     <span className="px-1.5 py-0.5 bg-zinc-900 text-zinc-500 text-[9px] rounded border border-zinc-800 uppercase font-mono">{scene.time}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 line-clamp-1 mb-3">{scene.atmosphere}</p>

                  {/* Scene Prompt Section */}
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Camera className="w-3 h-3" />
                        场景提示词
                      </label>
                      {editingPromptSceneId !== scene.id && (
                        <button
                          onClick={() => handleStartEditScenePrompt(scene.id, scene.visualPrompt || '')}
                          className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded"
                          title="编辑提示词"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {editingPromptSceneId === scene.id ? (
                      /* 编辑模式 */
                      <div className="space-y-2">
                        <textarea
                          value={editedScenePrompt}
                          onChange={(e) => setEditedScenePrompt(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-[11px] text-zinc-300 leading-relaxed font-mono resize-none focus:outline-none focus:border-zinc-500"
                          rows={4}
                          placeholder="输入场景视觉描述..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveScenePrompt(scene.id)}
                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
                          >
                            <Save className="w-3 h-3" /> 保存
                          </button>
                          <button
                            onClick={handleCancelEditScenePrompt}
                            className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 显示模式 */
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded p-2 overflow-y-auto max-h-[120px]">
                        {scene.visualPrompt ? (
                          <p className="text-[10px] text-zinc-400 leading-relaxed font-mono">
                            {scene.visualPrompt}
                          </p>
                        ) : (
                          <div className="flex items-start gap-2 text-zinc-600">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] leading-relaxed">
                              未设置提示词。点击编辑按钮添加场景的视觉描述。
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Regenerate and Upload Buttons */}
                  {scene.referenceImage && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerateAsset('scene', scene.id)}
                          disabled={generatingIds.has(scene.id)}
                          className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors"
                        >
                          {generatingIds.has(scene.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {generatingIds.has(scene.id) ? '生成中...' : '重新生成'}
                        </button>
                        <label className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-zinc-800 transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          上传图片
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadSceneImage(scene.id, file);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

    </div>
  );
};

export default StageAssets;