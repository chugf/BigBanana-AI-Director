import React, { useState, useEffect } from 'react';
import { Users, Sparkles, RefreshCw, Loader2, MapPin, Archive, X, Search, Trash2 } from 'lucide-react';
import { ProjectState, CharacterVariation, Character, Scene, AspectRatio, AssetLibraryItem } from '../../types';
import { generateImage, generateVisualPrompts } from '../../services/geminiService';
import { 
  getRegionalPrefix, 
  handleImageUpload, 
  getProjectLanguage, 
  getProjectVisualStyle,
  delay,
  generateId,
  compareIds 
} from './utils';
import { DEFAULTS, STYLES, GRID_LAYOUTS } from './constants';
import ImagePreviewModal from './ImagePreviewModal';
import CharacterCard from './CharacterCard';
import SceneCard from './SceneCard';
import WardrobeModal from './WardrobeModal';
import { useAlert } from '../GlobalAlert';
import { getAllAssetLibraryItems, saveAssetToLibrary, deleteAssetFromLibrary } from '../../services/storageService';
import { applyLibraryItemToProject, createLibraryItemFromCharacter, createLibraryItemFromScene, cloneCharacterForProject } from '../../services/assetLibraryService';
import { AspectRatioSelector } from '../AspectRatioSelector';
import { getDefaultAspectRatio, getImageModels, getActiveImageModel, getModelById } from '../../services/modelRegistry';
import ModelSelector from '../ModelSelector';
import { ImageModelDefinition } from '../../types/model';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: any) => boolean;
}

const StageAssets: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const { showAlert } = useAlert();
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryItems, setLibraryItems] = useState<AssetLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'character' | 'scene'>('all');
  const [replaceTargetCharId, setReplaceTargetCharId] = useState<string | null>(null);
  
  // 横竖屏选择状态
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => getDefaultAspectRatio());
  
  // 图片模型选择状态
  const defaultImageModel = getActiveImageModel();
  const [selectedImageModelId, setSelectedImageModelId] = useState<string>(
    defaultImageModel?.id || 'gemini-3-pro-image-preview'
  );

  // 获取项目配置
  const language = getProjectLanguage(project.language, project.scriptData?.language);
  const visualStyle = getProjectVisualStyle(project.visualStyle, project.scriptData?.visualStyle);
  const genre = project.scriptData?.genre || DEFAULTS.genre;

  /**
   * 组件加载时，检测并重置卡住的生成状态
   * 解决关闭页面后重新打开时，状态仍为"generating"导致无法重新生成的问题
   */
  useEffect(() => {
    if (!project.scriptData) return;

    const hasStuckCharacters = project.scriptData.characters.some(char => {
      // 检查角色本身是否卡住
      const isCharStuck = char.status === 'generating' && !char.referenceImage;
      // 检查角色变体是否卡住
      const hasStuckVariations = char.variations?.some(v => v.status === 'generating' && !v.referenceImage);
      return isCharStuck || hasStuckVariations;
    });

    const hasStuckScenes = project.scriptData.scenes.some(scene => 
      scene.status === 'generating' && !scene.referenceImage
    );

    if (hasStuckCharacters || hasStuckScenes) {
      console.log('🔧 检测到卡住的生成状态，正在重置...');
      const newData = { ...project.scriptData };
      
      // 重置角色状态
      newData.characters = newData.characters.map(char => ({
        ...char,
        status: char.status === 'generating' && !char.referenceImage ? 'failed' as const : char.status,
        variations: char.variations?.map(v => ({
          ...v,
          status: v.status === 'generating' && !v.referenceImage ? 'failed' as const : v.status
        }))
      }));
      
      // 重置场景状态
      newData.scenes = newData.scenes.map(scene => ({
        ...scene,
        status: scene.status === 'generating' && !scene.referenceImage ? 'failed' as const : scene.status
      }));
      
      updateProject({ scriptData: newData });
    }
  }, [project.id]); // 仅在项目ID变化时运行，避免重复执行

  const refreshLibrary = async () => {
    setLibraryLoading(true);
    try {
      const items = await getAllAssetLibraryItems();
      setLibraryItems(items);
    } catch (e) {
      console.error('Failed to load asset library', e);
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (showLibraryModal) {
      refreshLibrary();
    }
  }, [showLibraryModal]);

  const openLibrary = (filter: 'all' | 'character' | 'scene', targetCharId: string | null = null) => {
    setLibraryFilter(filter);
    setReplaceTargetCharId(targetCharId);
    setShowLibraryModal(true);
  };

  /**
   * 生成资源（角色或场景）
   */
  const handleGenerateAsset = async (type: 'character' | 'scene', id: string) => {
    // 设置生成状态
    if (project.scriptData) {
      const newData = { ...project.scriptData };
      if (type === 'character') {
        const c = newData.characters.find(c => compareIds(c.id, id));
        if (c) c.status = 'generating';
      } else {
        const s = newData.scenes.find(s => compareIds(s.id, id));
        if (s) s.status = 'generating';
      }
      updateProject({ scriptData: newData });
    }
    try {
      let prompt = "";
      
      if (type === 'character') {
        const char = project.scriptData?.characters.find(c => compareIds(c.id, id));
        if (char) {
          if (char.visualPrompt) {
            prompt = char.visualPrompt;
          } else {
            const prompts = await generateVisualPrompts('character', char, genre, DEFAULTS.modelVersion, visualStyle, language);
            prompt = prompts.visualPrompt;
            
            // 保存生成的提示词
            if (project.scriptData) {
              const newData = { ...project.scriptData };
              const c = newData.characters.find(c => compareIds(c.id, id));
              if (c) {
                c.visualPrompt = prompts.visualPrompt;
                c.negativePrompt = prompts.negativePrompt;
              }
              updateProject({ scriptData: newData });
            }
          }
        }
      } else {
        const scene = project.scriptData?.scenes.find(s => compareIds(s.id, id));
        if (scene) {
          if (scene.visualPrompt) {
            prompt = scene.visualPrompt;
          } else {
            const prompts = await generateVisualPrompts('scene', scene, genre, DEFAULTS.modelVersion, visualStyle, language);
            prompt = prompts.visualPrompt;
            
            // 保存生成的提示词
            if (project.scriptData) {
              const newData = { ...project.scriptData };
              const s = newData.scenes.find(s => compareIds(s.id, id));
              if (s) {
                s.visualPrompt = prompts.visualPrompt;
                s.negativePrompt = prompts.negativePrompt;
              }
              updateProject({ scriptData: newData });
            }
          }
        }
      }

      // 添加地域特征前缀
      const regionalPrefix = getRegionalPrefix(language, type);
      const enhancedPrompt = regionalPrefix + prompt;

      // 生成图片（使用选择的横竖屏比例）
      const imageUrl = await generateImage(enhancedPrompt, [], aspectRatio);

      // 更新状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        if (type === 'character') {
          const c = newData.characters.find(c => compareIds(c.id, id));
          if (c) {
            c.referenceImage = imageUrl;
            c.status = 'completed';
          }
        } else {
          const s = newData.scenes.find(s => compareIds(s.id, id));
          if (s) {
            s.referenceImage = imageUrl;
            s.status = 'completed';
          }
        }
        updateProject({ scriptData: newData });
      }

    } catch (e: any) {
      console.error(e);
      // 设置失败状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        if (type === 'character') {
          const c = newData.characters.find(c => compareIds(c.id, id));
          if (c) c.status = 'failed';
        } else {
          const s = newData.scenes.find(s => compareIds(s.id, id));
          if (s) s.status = 'failed';
        }
        updateProject({ scriptData: newData });
      }
      if (onApiKeyError && onApiKeyError(e)) {
        return;
      }
    }
  };

  /**
   * 批量生成资源
   */
  const handleBatchGenerate = async (type: 'character' | 'scene') => {
    const items = type === 'character' 
      ? project.scriptData?.characters 
      : project.scriptData?.scenes;
    
    if (!items) return;

    const itemsToGen = items.filter(i => !i.referenceImage);
    const isRegenerate = itemsToGen.length === 0;

    if (isRegenerate) {
      showAlert(`确定要重新生成所有${type === 'character' ? '角色' : '场景'}图吗？`, {
        type: 'warning',
        showCancel: true,
        onConfirm: async () => {
          await executeBatchGenerate(items, type);
        }
      });
      return;
    }

    await executeBatchGenerate(itemsToGen, type);
  };

  const executeBatchGenerate = async (targetItems: any[], type: 'character' | 'scene') => {
    setBatchProgress({ current: 0, total: targetItems.length });

    for (let i = 0; i < targetItems.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);
      
      await handleGenerateAsset(type, targetItems[i].id);
      setBatchProgress({ current: i + 1, total: targetItems.length });
    }

    setBatchProgress(null);
  };

  /**
   * 上传角色图片
   */
  const handleUploadCharacterImage = async (charId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);

      updateProject((prev) => {
        if (!prev.scriptData) return prev;
        const newData = { ...prev.scriptData };
        const char = newData.characters.find(c => compareIds(c.id, charId));
        if (char) {
          char.referenceImage = base64;
          char.status = 'completed';
        }
        return { ...prev, scriptData: newData };
      });
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  /**
   * 上传场景图片
   */
  const handleUploadSceneImage = async (sceneId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);

      updateProject((prev) => {
        if (!prev.scriptData) return prev;
        const newData = { ...prev.scriptData };
        const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
        if (scene) {
          scene.referenceImage = base64;
          scene.status = 'completed';
        }
        return { ...prev, scriptData: newData };
      });
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  const handleAddCharacterToLibrary = (char: Character) => {
    const saveItem = async () => {
      try {
        const item = createLibraryItemFromCharacter(char);
        await saveAssetToLibrary(item);
        showAlert(`已加入资产库：${char.name}`, { type: 'success' });
        refreshLibrary();
      } catch (e: any) {
        showAlert(e?.message || '加入资产库失败', { type: 'error' });
      }
    };

    if (!char.referenceImage) {
      showAlert('该角色暂无参考图，仍要加入资产库吗？', {
        type: 'warning',
        showCancel: true,
        onConfirm: saveItem
      });
      return;
    }

    void saveItem();
  };

  const handleAddSceneToLibrary = (scene: Scene) => {
    const saveItem = async () => {
      try {
        const item = createLibraryItemFromScene(scene);
        await saveAssetToLibrary(item);
        showAlert(`已加入资产库：${scene.location}`, { type: 'success' });
        refreshLibrary();
      } catch (e: any) {
        showAlert(e?.message || '加入资产库失败', { type: 'error' });
      }
    };

    if (!scene.referenceImage) {
      showAlert('该场景暂无参考图，仍要加入资产库吗？', {
        type: 'warning',
        showCancel: true,
        onConfirm: saveItem
      });
      return;
    }

    void saveItem();
  };

  const handleImportFromLibrary = (item: AssetLibraryItem) => {
    try {
      const updated = applyLibraryItemToProject(project, item);
      updateProject(() => updated);
      showAlert(`已导入：${item.name}`, { type: 'success' });
    } catch (e: any) {
      showAlert(e?.message || '导入失败', { type: 'error' });
    }
  };

  const handleReplaceCharacterFromLibrary = (item: AssetLibraryItem, targetId: string) => {
    if (item.type !== 'character') {
      showAlert('请选择角色资产进行替换', { type: 'warning' });
      return;
    }
    if (!project.scriptData) return;

    const newData = { ...project.scriptData };
    const index = newData.characters.findIndex((c) => compareIds(c.id, targetId));
    if (index === -1) return;

    const cloned = cloneCharacterForProject(item.data as Character);
    const previous = newData.characters[index];

    newData.characters[index] = {
      ...cloned,
      id: previous.id
    };

    const nextShots = project.shots.map((shot) => {
      if (!shot.characterVariations || !shot.characterVariations[targetId]) return shot;
      const { [targetId]: _removed, ...rest } = shot.characterVariations;
      return {
        ...shot,
        characterVariations: Object.keys(rest).length > 0 ? rest : undefined
      };
    });

    updateProject({ scriptData: newData, shots: nextShots });
    showAlert(`已替换角色：${previous.name} → ${cloned.name}`, { type: 'success' });
    setShowLibraryModal(false);
    setReplaceTargetCharId(null);
  };

  const handleDeleteLibraryItem = async (itemId: string) => {
    try {
      await deleteAssetFromLibrary(itemId);
      setLibraryItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (e: any) {
      showAlert(e?.message || '删除资产失败', { type: 'error' });
    }
  };

  /**
   * 保存角色提示词
   */
  const handleSaveCharacterPrompt = (charId: string, newPrompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (char) {
      char.visualPrompt = newPrompt;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 更新角色基本信息
   */
  const handleUpdateCharacterInfo = (charId: string, updates: { name?: string; gender?: string; age?: string; personality?: string }) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (char) {
      if (updates.name !== undefined) char.name = updates.name;
      if (updates.gender !== undefined) char.gender = updates.gender;
      if (updates.age !== undefined) char.age = updates.age;
      if (updates.personality !== undefined) char.personality = updates.personality;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 保存场景提示词
   */
  const handleSaveScenePrompt = (sceneId: string, newPrompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
    if (scene) {
      scene.visualPrompt = newPrompt;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 更新场景基本信息
   */
  const handleUpdateSceneInfo = (sceneId: string, updates: { location?: string; time?: string; atmosphere?: string }) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
    if (scene) {
      if (updates.location !== undefined) scene.location = updates.location;
      if (updates.time !== undefined) scene.time = updates.time;
      if (updates.atmosphere !== undefined) scene.atmosphere = updates.atmosphere;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 新建角色
   */
  const handleAddCharacter = () => {
    if (!project.scriptData) return;
    
    const newChar: Character = {
      id: generateId('char'),
      name: '新角色',
      gender: '未设定',
      age: '未设定',
      personality: '待补充',
      visualPrompt: '',
      variations: [],
      status: 'pending'
    };

    const newData = { ...project.scriptData };
    newData.characters.push(newChar);
    updateProject({ scriptData: newData });
    showAlert('新角色已创建，请编辑提示词并生成图片', { type: 'success' });
  };

  /**
   * 删除角色
   */
  const handleDeleteCharacter = (charId: string) => {
    if (!project.scriptData) return;
    const char = project.scriptData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;

    showAlert(
      `确定要删除角色 "${char.name}" 吗？\n\n注意：这将会影响所有使用该角色的分镜，可能导致分镜关联错误。`,
      {
        type: 'warning',
        title: '删除角色',
        showCancel: true,
        confirmText: '删除',
        cancelText: '取消',
        onConfirm: () => {
          const newData = { ...project.scriptData! };
          newData.characters = newData.characters.filter(c => !compareIds(c.id, charId));
          updateProject({ scriptData: newData });
          showAlert(`角色 "${char.name}" 已删除`, { type: 'success' });
        }
      }
    );
  };

  /**
   * 新建场景
   */
  const handleAddScene = () => {
    if (!project.scriptData) return;
    
    const newScene: Scene = {
      id: generateId('scene'),
      location: '新场景',
      time: '未设定',
      atmosphere: '待补充',
      visualPrompt: '',
      status: 'pending'
    };

    const newData = { ...project.scriptData };
    newData.scenes.push(newScene);
    updateProject({ scriptData: newData });
    showAlert('新场景已创建，请编辑提示词并生成图片', { type: 'success' });
  };

  /**
   * 删除场景
   */
  const handleDeleteScene = (sceneId: string) => {
    if (!project.scriptData) return;
    const scene = project.scriptData.scenes.find(s => compareIds(s.id, sceneId));
    if (!scene) return;

    showAlert(
      `确定要删除场景 "${scene.location}" 吗？\n\n注意：这将会影响所有使用该场景的分镜，可能导致分镜关联错误。`,
      {
        type: 'warning',
        title: '删除场景',
        showCancel: true,
        confirmText: '删除',
        cancelText: '取消',
        onConfirm: () => {
          const newData = { ...project.scriptData! };
          newData.scenes = newData.scenes.filter(s => !compareIds(s.id, sceneId));
          updateProject({ scriptData: newData });
          showAlert(`场景 "${scene.location}" 已删除`, { type: 'success' });
        }
      }
    );
  };

  /**
   * 添加角色变体
   */
  const handleAddVariation = (charId: string, name: string, prompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;

    const newVar: CharacterVariation = {
      id: generateId('var'),
      name: name || "New Outfit",
      visualPrompt: prompt || char.visualPrompt || "",
      referenceImage: undefined
    };

    if (!char.variations) char.variations = [];
    char.variations.push(newVar);
    
    updateProject({ scriptData: newData });
  };

  /**
   * 删除角色变体
   */
  const handleDeleteVariation = (charId: string, varId: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;
    
    char.variations = char.variations?.filter(v => !compareIds(v.id, varId));
    updateProject({ scriptData: newData });
  };

  /**
   * 生成角色变体
   */
  const handleGenerateVariation = async (charId: string, varId: string) => {
    const char = project.scriptData?.characters.find(c => compareIds(c.id, charId));
    const variation = char?.variations?.find(v => compareIds(v.id, varId));
    if (!char || !variation) return;

    // 设置生成状态
    if (project.scriptData) {
      const newData = { ...project.scriptData };
      const c = newData.characters.find(c => compareIds(c.id, charId));
      const v = c?.variations?.find(v => compareIds(v.id, varId));
      if (v) v.status = 'generating';
      updateProject({ scriptData: newData });
    }
    try {
      const refImages = char.referenceImage ? [char.referenceImage] : [];
      const regionalPrefix = getRegionalPrefix(language, 'character');
      // 构建变体专用提示词：强调服装变化
      const enhancedPrompt = `${regionalPrefix}Character "${char.name}" wearing NEW OUTFIT: ${variation.visualPrompt}. This is a costume/outfit change - the character's face and identity must remain identical to the reference, but they should be wearing the described new outfit.`;
      
      // 使用选择的横竖屏比例，启用变体模式
      const imageUrl = await generateImage(enhancedPrompt, refImages, aspectRatio, true);

      const newData = { ...project.scriptData! };
      const c = newData.characters.find(c => compareIds(c.id, charId));
      const v = c?.variations?.find(v => compareIds(v.id, varId));
      if (v) {
        v.referenceImage = imageUrl;
        v.status = 'completed';
      }

      updateProject({ scriptData: newData });
    } catch (e: any) {
      console.error(e);
      // 设置失败状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const c = newData.characters.find(c => compareIds(c.id, charId));
        const v = c?.variations?.find(v => compareIds(v.id, varId));
        if (v) v.status = 'failed';
        updateProject({ scriptData: newData });
      }
      if (onApiKeyError && onApiKeyError(e)) {
        return;
      }
      showAlert("Variation generation failed", { type: 'error' });
    }
  };

  /**
   * 上传角色变体图片
   */
  const handleUploadVariationImage = async (charId: string, varId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);

      updateProject((prev) => {
        if (!prev.scriptData) return prev;
        const newData = { ...prev.scriptData };
        const char = newData.characters.find(c => compareIds(c.id, charId));
        const variation = char?.variations?.find(v => compareIds(v.id, varId));
        if (variation) {
          variation.referenceImage = base64;
          variation.status = 'completed';
        }
        return { ...prev, scriptData: newData };
      });
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  // 空状态
  if (!project.scriptData) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
        <p>请先完成 Phase 01 剧本分析</p>
      </div>
    );
  }
  
  const allCharactersReady = project.scriptData.characters.every(c => c.referenceImage);
  const allScenesReady = project.scriptData.scenes.every(s => s.referenceImage);
  const selectedChar = project.scriptData.characters.find(c => compareIds(c.id, selectedCharId));
  const filteredLibraryItems = libraryItems.filter((item) => {
    if (libraryFilter !== 'all' && item.type !== libraryFilter) return false;
    if (!libraryQuery.trim()) return true;
    const query = libraryQuery.trim().toLowerCase();
    return item.name.toLowerCase().includes(query);
  });

  return (
    <div className={STYLES.mainContainer}>
      
      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage} 
        onClose={() => setPreviewImage(null)} 
      />

      {/* Global Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-base)]/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">正在批量生成资源...</h3>
          <div className="w-64 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-[var(--accent)] transition-all duration-300" 
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[var(--text-tertiary)] font-mono text-xs">
            进度: {batchProgress.current} / {batchProgress.total}
          </p>
        </div>
      )}

      {/* Wardrobe Modal */}
      {selectedChar && (
        <WardrobeModal
          character={selectedChar}
          onClose={() => setSelectedCharId(null)}
          onAddVariation={handleAddVariation}
          onDeleteVariation={handleDeleteVariation}
          onGenerateVariation={handleGenerateVariation}
          onUploadVariation={handleUploadVariationImage}
          onImageClick={setPreviewImage}
        />
      )}

      {/* Asset Library Modal */}
      {showLibraryModal && (
        <div className={STYLES.modalOverlay} onClick={() => {
          setShowLibraryModal(false);
          setReplaceTargetCharId(null);
        }}>
          <div className={STYLES.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={STYLES.modalHeader}>
              <div className="flex items-center gap-3">
                <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                <div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">资产库</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest">
                    {libraryItems.length} assets
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowLibraryModal(false);
                  setReplaceTargetCharId(null);
                }}
                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={STYLES.modalBody}>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={libraryQuery}
                    onChange={(e) => setLibraryQuery(e.target.value)}
                    placeholder="搜索资产名称..."
                    className="w-full pl-9 pr-3 py-2 bg-[var(--bg-deep)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-secondary)]"
                  />
                </div>
                <div className="flex gap-2">
                  {(['all', 'character', 'scene'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setLibraryFilter(type)}
                      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border rounded ${
                        libraryFilter === type
                          ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                          : 'bg-transparent text-[var(--text-tertiary)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                      }`}
                    >
                      {type === 'all' ? '全部' : type === 'character' ? '角色' : '场景'}
                    </button>
                  ))}
                </div>
              </div>

              {libraryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-[var(--text-tertiary)] animate-spin" />
                </div>
              ) : filteredLibraryItems.length === 0 ? (
                <div className="border border-dashed border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
                  暂无资产。可在角色或场景卡片中选择“加入资产库”。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredLibraryItems.map((item) => {
                    const preview =
                      item.type === 'character'
                        ? (item.data as Character).referenceImage
                        : (item.data as Scene).referenceImage;
                    return (
                      <div
                        key={item.id}
                        className="bg-[var(--bg-deep)] border border-[var(--border-primary)] rounded-xl overflow-hidden hover:border-[var(--border-secondary)] transition-colors"
                      >
                        <div className="aspect-video bg-[var(--bg-elevated)] relative">
                          {preview ? (
                            <img src={preview} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                              {item.type === 'character' ? (
                                <Users className="w-8 h-8 opacity-30" />
                              ) : (
                                <MapPin className="w-8 h-8 opacity-30" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{item.name}</div>
                            <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest mt-1">
                              {item.type === 'character' ? '角色' : '场景'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                replaceTargetCharId
                                  ? handleReplaceCharacterFromLibrary(item, replaceTargetCharId)
                                  : handleImportFromLibrary(item)
                              }
                              className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                            >
                              {replaceTargetCharId ? '替换当前角色' : '导入到当前项目'}
                            </button>
                            <button
                              onClick={() =>
                                showAlert('确定从资产库删除该资源吗？', {
                                  type: 'warning',
                                  showCancel: true,
                                  onConfirm: () => handleDeleteLibraryItem(item.id)
                                })
                              }
                              className="p-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={STYLES.header}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Users className="w-5 h-5 text-[var(--accent)]" />
            角色与场景
            <span className="text-xs text-[var(--text-muted)] font-mono font-normal uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-1 rounded">
              Assets & Casting
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openLibrary('all')}
            disabled={!!batchProgress}
            className={STYLES.secondaryButton}
          >
            <Archive className="w-4 h-4" />
            资产库
          </button>
          {/* 图片模型选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">模型</span>
            <ModelSelector
              type="image"
              value={selectedImageModelId}
              onChange={setSelectedImageModelId}
              disabled={!!batchProgress}
              compact
            />
          </div>
          <div className="w-px h-6 bg-[var(--bg-hover)]" />
          {/* 横竖屏选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">比例</span>
            <AspectRatioSelector
              value={aspectRatio}
              onChange={setAspectRatio}
              allowSquare={(() => {
                // 根据选中的图片模型判断是否支持方形
                const selectedModel = getModelById(selectedImageModelId) as ImageModelDefinition | undefined;
                return selectedModel?.params?.supportedAspectRatios?.includes('1:1') ?? false;
              })()}
              disabled={!!batchProgress}
            />
          </div>
          <div className="w-px h-6 bg-[var(--bg-hover)]" />
          <div className="flex gap-2">
            <span className={STYLES.badge}>
              {project.scriptData.characters.length} CHARS
            </span>
            <span className={STYLES.badge}>
              {project.scriptData.scenes.length} SCENES
            </span>
          </div>
        </div>
      </div>

      <div className={STYLES.content}>
        {/* Characters Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-[var(--border-primary)] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />
                角色定妆 (Casting)
              </h3>
              <p className="text-xs text-[var(--text-tertiary)] mt-1 pl-3.5">为剧本中的角色生成一致的参考形象</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAddCharacter}
                disabled={!!batchProgress}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Users className="w-3 h-3" />
                新建角色
              </button>
              <button 
                onClick={() => openLibrary('character')}
                disabled={!!batchProgress}
                className={STYLES.secondaryButton}
              >
                <Archive className="w-3 h-3" />
                从资产库选择
              </button>
              <button 
                onClick={() => handleBatchGenerate('character')}
                disabled={!!batchProgress}
                className={allCharactersReady ? STYLES.secondaryButton : STYLES.primaryButton}
              >
                {allCharactersReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {allCharactersReady ? '重新生成所有角色' : '一键生成所有角色'}
              </button>
            </div>
          </div>

          <div className={GRID_LAYOUTS.cards}>
            {project.scriptData.characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                isGenerating={char.status === 'generating'}
                onGenerate={() => handleGenerateAsset('character', char.id)}
                onUpload={(file) => handleUploadCharacterImage(char.id, file)}
                onPromptSave={(newPrompt) => handleSaveCharacterPrompt(char.id, newPrompt)}
                onOpenWardrobe={() => setSelectedCharId(char.id)}
                onImageClick={setPreviewImage}
                onDelete={() => handleDeleteCharacter(char.id)}
                onUpdateInfo={(updates) => handleUpdateCharacterInfo(char.id, updates)}
                onAddToLibrary={() => handleAddCharacterToLibrary(char)}
                onReplaceFromLibrary={() => openLibrary('character', char.id)}
              />
            ))}
          </div>
        </section>

        {/* Scenes Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-[var(--border-primary)] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[var(--success)] rounded-full" />
                场景概念 (Locations)
              </h3>
              <p className="text-xs text-[var(--text-tertiary)] mt-1 pl-3.5">为剧本场景生成环境参考图</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAddScene}
                disabled={!!batchProgress}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <MapPin className="w-3 h-3" />
                新建场景
              </button>
              <button 
                onClick={() => openLibrary('scene')}
                disabled={!!batchProgress}
                className={STYLES.secondaryButton}
              >
                <Archive className="w-3 h-3" />
                从资产库选择
              </button>
              <button 
                onClick={() => handleBatchGenerate('scene')}
                disabled={!!batchProgress}
                className={allScenesReady ? STYLES.secondaryButton : STYLES.primaryButton}
              >
                {allScenesReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {allScenesReady ? '重新生成所有场景' : '一键生成所有场景'}
              </button>
            </div>
          </div>

          <div className={GRID_LAYOUTS.cards}>
            {project.scriptData.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isGenerating={scene.status === 'generating'}
                onGenerate={() => handleGenerateAsset('scene', scene.id)}
                onUpload={(file) => handleUploadSceneImage(scene.id, file)}
                onPromptSave={(newPrompt) => handleSaveScenePrompt(scene.id, newPrompt)}
                onImageClick={setPreviewImage}
                onDelete={() => handleDeleteScene(scene.id)}
                onUpdateInfo={(updates) => handleUpdateSceneInfo(scene.id, updates)}
                onAddToLibrary={() => handleAddSceneToLibrary(scene)}
              />
            ))}
          </div>
        </section>
      </div>

    </div>
  );
};

export default StageAssets;
