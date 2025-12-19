import React, { useState } from 'react';
import { Play, SkipForward, SkipBack, Loader2, Video, Image as ImageIcon, ArrowRight, LayoutGrid, Maximize2, Sparkles, AlertCircle, MapPin, User, Clock, ChevronLeft, ChevronRight, ArrowLeft, MessageSquare, X, Film, Aperture, Shirt } from 'lucide-react';
import { ProjectState, Shot, Keyframe } from '../types';
import { generateImage, generateVideo } from '../services/geminiService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
}

/**
 * 根据镜头运动类型返回首帧和尾帧的构图指导
 * @param cameraMovement - 镜头运动类型
 * @param frameType - 帧类型：'start' 或 'end'
 * @returns 构图指导文本
 */
const getCameraMovementCompositionGuide = (cameraMovement: string, frameType: 'start' | 'end'): string => {
  const movement = cameraMovement.toLowerCase();
  
  // 定义镜头运动与构图的映射关系
  const guides: { [key: string]: { start: string; end: string } } = {
    'horizontal left shot': {
      start: 'Composition: Subject positioned on the right side of frame, with space on the left for movement.',
      end: 'Composition: Subject moved to left side of frame, showing the journey from right to left.'
    },
    'horizontal right shot': {
      start: 'Composition: Subject positioned on the left side of frame, with space on the right for movement.',
      end: 'Composition: Subject moved to right side of frame, showing the journey from left to right.'
    },
    'pan left shot': {
      start: 'Composition: Frame focused on right portion of scene, anticipating leftward pan.',
      end: 'Composition: Frame reveals left portion of scene, completing the pan movement.'
    },
    'pan right shot': {
      start: 'Composition: Frame focused on left portion of scene, anticipating rightward pan.',
      end: 'Composition: Frame reveals right portion of scene, completing the pan movement.'
    },
    'zoom in shot': {
      start: 'Composition: Wide establishing shot showing full scene context, subject smaller in frame.',
      end: 'Composition: Tight close-up on subject, filling frame with detail and intimacy.'
    },
    'zoom out shot': {
      start: 'Composition: Close-up on subject, emphasizing details and emotion.',
      end: 'Composition: Wide pullback revealing surrounding environment and context.'
    },
    'dolly shot': {
      start: 'Composition: Initial framing with subject at specific distance and perspective.',
      end: 'Composition: Changed perspective with subject closer/further, revealing depth and space.'
    },
    'tilt up shot': {
      start: 'Composition: Camera angle pointing downward or level, capturing lower portion of subject.',
      end: 'Composition: Camera tilted upward, revealing height and vertical expanse above.'
    },
    'tilt down shot': {
      start: 'Composition: Camera angle pointing upward or level, emphasizing upper portion.',
      end: 'Composition: Camera tilted downward, revealing lower elements and ground level.'
    },
    'vertical up shot': {
      start: 'Composition: Lower vertical position, subject at bottom of frame or ground level.',
      end: 'Composition: Elevated position, subject risen vertically showing upward movement.'
    },
    'vertical down shot': {
      start: 'Composition: Elevated vertical position, subject higher in frame.',
      end: 'Composition: Lower position, subject descended showing downward movement.'
    },
    'tracking shot': {
      start: 'Composition: Subject in frame with forward/lateral space for tracking movement.',
      end: 'Composition: Subject tracked through space, maintaining visual relationship.'
    },
    'circular shot': {
      start: 'Composition: Subject centered, camera at initial angle of circular path.',
      end: 'Composition: Subject still centered, camera at opposite side revealing new angle.'
    },
    '360-degree circular shot': {
      start: 'Composition: Subject centered, camera beginning 360° orbit.',
      end: 'Composition: Subject centered, camera completing full revolution from different angle.'
    },
    'low angle shot': {
      start: 'Composition: Low camera angle looking upward, emphasizing height and power.',
      end: 'Composition: Maintained low angle, subject towering with dramatic perspective.'
    },
    'high angle shot': {
      start: 'Composition: High camera angle looking downward, creating overview perspective.',
      end: 'Composition: Maintained high angle, emphasizing scale and spatial relationships.'
    },
    'bird\'s eye view shot': {
      start: 'Composition: Directly overhead view, showing layout and patterns from above.',
      end: 'Composition: Continued overhead perspective, revealing changed spatial arrangement.'
    },
    'pov shot': {
      start: 'Composition: First-person perspective from character\'s viewpoint.',
      end: 'Composition: Maintained POV, showing what character sees after movement/action.'
    },
    'over the shoulder shot': {
      start: 'Composition: Frame includes foreground character\'s shoulder, looking at subject.',
      end: 'Composition: Maintained over-shoulder framing, possibly with shifted focus or angle.'
    },
    'handheld shot': {
      start: 'Composition: Dynamic handheld framing with natural movement and energy.',
      end: 'Composition: Continued handheld aesthetic with organic repositioning.'
    },
    'static shot': {
      start: 'Composition: Fixed camera position, stable framing throughout.',
      end: 'Composition: Same camera position, only subject movement within frame.'
    },
    'rotating shot': {
      start: 'Composition: Subject in frame, camera beginning rotational movement.',
      end: 'Composition: Subject with changed orientation due to camera rotation.'
    },
    'slow motion shot': {
      start: 'Composition: Action captured at beginning of slow-motion sequence.',
      end: 'Composition: Action progressed, emphasizing graceful movement detail.'
    },
    'parallel tracking shot': {
      start: 'Composition: Subject with camera tracking parallel alongside.',
      end: 'Composition: Maintained parallel relationship, subject moved through space.'
    },
    'diagonal tracking shot': {
      start: 'Composition: Subject with camera on diagonal tracking path.',
      end: 'Composition: Diagonal perspective maintained, dynamic spatial progression.'
    },
    'canted shot': {
      start: 'Composition: Tilted horizon line creating dutch angle, dynamic unease.',
      end: 'Composition: Maintained or adjusted dutch angle, emphasizing disorientation.'
    },
    'cinematic dolly zoom': {
      start: 'Composition: Initial balanced framing before vertigo effect.',
      end: 'Composition: Distorted perspective with foreground/background relationship altered.'
    }
  };
  
  // 查找匹配的镜头运动类型
  for (const [key, value] of Object.entries(guides)) {
    if (movement.includes(key) || key.includes(movement)) {
      return frameType === 'start' ? value.start : value.end;
    }
  }
  
  // 默认通用指导
  return frameType === 'start' 
    ? 'Composition: Initial frame composition suited for the camera movement.'
    : 'Composition: Final frame composition showing the result of camera movement.';
};

const StageDirector: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);

  const activeShotIndex = project.shots.findIndex(s => s.id === activeShotId);
  const activeShot = project.shots[activeShotIndex];
  
  // Safe access to keyframes (may be undefined if data is incomplete)
  const startKf = activeShot?.keyframes?.find(k => k.type === 'start');
  const endKf = activeShot?.keyframes?.find(k => k.type === 'end');

    // Selected video model for current shot (used by render logic)
    const selectedModel = activeShot?.videoModel || 'sora-2';

  // Check if all start frames are generated
  const allStartFramesGenerated = project.shots.length > 0 && project.shots.every(s => s.keyframes?.find(k => k.type === 'start')?.imageUrl);

  const updateShot = (shotId: string, transform: (s: Shot) => Shot) => {
    // 使用函数式更新避免竞态条件，确保使用最新的 state
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => s.id === shotId ? transform(s) : s)
    }));
  };

  const getRefImagesForShot = (shot: Shot) => {
      const referenceImages: string[] = [];
      if (project.scriptData) {
        // 1. Scene Reference (Environment / Atmosphere) - PRIORITY
        const scene = project.scriptData.scenes.find(s => String(s.id) === String(shot.sceneId));
        if (scene?.referenceImage) {
          referenceImages.push(scene.referenceImage);
        }

        // 2. Character References (Appearance)
        if (shot.characters) {
          shot.characters.forEach(charId => {
            const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
            if (!char) return;

            // Check if a specific variation is selected for this shot
            const varId = shot.characterVariations?.[charId];
            if (varId) {
                const variation = char.variations?.find(v => v.id === varId);
                if (variation?.referenceImage) {
                    referenceImages.push(variation.referenceImage);
                    return; // Use variation image instead of base
                }
            }

            // Fallback to base image
            if (char.referenceImage) {
              referenceImages.push(char.referenceImage);
            }
          });
        }
      }
      return referenceImages;
  };

  const handleGenerateKeyframe = async (shot: Shot, type: 'start' | 'end') => {
    // Robustly handle missing keyframe object
    const existingKf = shot.keyframes?.find(k => k.type === type);
    const kfId = existingKf?.id || `kf-${shot.id}-${type}-${Date.now()}`;
    let prompt = existingKf?.visualPrompt || shot.actionSummary;
    
    // 获取视觉风格
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    
    // 根据视觉风格添加对应的样式提示
    const stylePrompts: { [key: string]: string } = {
      'live-action': 'photorealistic, cinematic film quality, real human actors, professional cinematography, natural lighting, 8K resolution',
      'anime': 'Japanese anime style, cel-shaded, vibrant colors, expressive eyes, dynamic poses, Studio Ghibali/Makoto Shinkai quality',
      '2d-animation': 'classic 2D animation, hand-drawn style, Disney/Pixar quality, smooth lines, expressive characters, painterly backgrounds',
      '3d-animation': 'high-quality 3D CGI animation, Pixar/DreamWorks style, subsurface scattering, detailed textures, stylized characters',
      'cyberpunk': 'cyberpunk aesthetic, neon-lit, rain-soaked streets, holographic displays, high-tech low-life, Blade Runner style',
      'oil-painting': 'oil painting style, visible brushstrokes, rich textures, classical art composition, museum quality fine art',
    };
    
    const stylePrompt = stylePrompts[visualStyle] || visualStyle;
    
    // 根据镜头运动类型添加构图和视角提示
    const cameraMovementGuide = getCameraMovementCompositionGuide(shot.cameraMovement, type);
    
    // 添加视觉风格、镜头运动和画面要求
    const selectedModel = shot.videoModel || 'sora-2';
    prompt = `${prompt}\n\nVisual Style: ${stylePrompt}\n\nCamera Movement: ${shot.cameraMovement} (${type === 'start' ? 'Initial' : 'Final'} frame)\n${cameraMovementGuide}\n\nVisual Requirements: High definition, cinematic composition, 16:9 widescreen format. Focus on lighting hierarchy, color saturation, and depth of field effects. Ensure the subject is clear and the background transitions naturally.`;
    
    // 先设置状态为generating，这样即使切换页面状态也会保留
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => {
        if (s.id !== shot.id) return s;
        
        const newKeyframes = [...(s.keyframes || [])];
        const idx = newKeyframes.findIndex(k => k.type === type);
        const generatingKf: Keyframe = {
          id: kfId,
          type,
          visualPrompt: prompt,
          status: 'generating'
        };
        
        if (idx >= 0) {
          newKeyframes[idx] = generatingKf;
        } else {
          newKeyframes.push(generatingKf);
        }
        
        return { ...s, keyframes: newKeyframes };
      })
    }));
    
    try {
      const referenceImages = getRefImagesForShot(shot);
      const url = await generateImage(prompt, referenceImages);

      // 使用函数式更新来避免竞态条件
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
           if (s.id !== shot.id) return s;
           
           const newKeyframes = [...(s.keyframes || [])];
           const idx = newKeyframes.findIndex(k => k.type === type);
           const newKf: Keyframe = {
               id: kfId,
               type,
               visualPrompt: prompt,
               imageUrl: url,
               status: 'completed'
           };
           
           if (idx >= 0) {
               newKeyframes[idx] = newKf;
           } else {
               newKeyframes.push(newKf);
           }
           
           return { ...s, keyframes: newKeyframes };
        })
      }));
    } catch (e: any) {
      console.error(e);
      // 设置状态为failed
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
          if (s.id !== shot.id) return s;
          
          const newKeyframes = [...(s.keyframes || [])];
          const idx = newKeyframes.findIndex(k => k.type === type);
          if (idx >= 0) {
            newKeyframes[idx] = { ...newKeyframes[idx], status: 'failed' };
          }
          
          return { ...s, keyframes: newKeyframes };
        })
      }));
      
      // Check if it's an API Key error
      if (onApiKeyError && onApiKeyError(e)) {
        return; // Error handled by parent
      }
      alert(`生成失败: ${e.message}`);
    }
  };

  const handleGenerateVideo = async (shot: Shot) => {
    const sKf = shot.keyframes?.find(k => k.type === 'start');
    const eKf = shot.keyframes?.find(k => k.type === 'end');

    if (!sKf?.imageUrl) return alert("请先生成起始帧！");

    // Create interval object if it doesn't exist
    if (!shot.interval) {
      const intervalId = `int-${shot.id}-${Date.now()}`;
      updateShot(shot.id, (s) => ({
        ...s,
        interval: {
          id: intervalId,
          startKeyframeId: sKf.id,
          endKeyframeId: eKf?.id || '',
          duration: 10,
          motionStrength: 5,
          status: 'pending'
        }
      }));
      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Fix: Remove logic that auto-grabs next shot's frame.
    // Prevent morphing artifacts by defaulting to Image-to-Video unless an End Frame is explicitly generated.
    let endImageUrl = eKf?.imageUrl;
    
    // Use selected model or default to Veo
    const selectedModel = shot.videoModel || 'sora-2';
    
    // Get project language for prompt generation
    const projectLanguage = project.language || project.scriptData?.language || '中文';
    
    // Build video prompt based on model and language
    let videoPrompt = shot.actionSummary;
    
    if (selectedModel === 'sora-2') {
      // 根据项目语言构建提示词
      if (projectLanguage === '中文') {
        videoPrompt = `从第一张图片（起始帧）到第二张图片（结束帧）生成平滑过渡的视频。

动作描述：${shot.actionSummary}

技术要求：
- 关键：视频必须从第一张图片的精确构图开始，逐渐过渡到第二张图片的精确构图结束
- 画面比例：16:9 宽屏横向格式
- 镜头运动：${shot.cameraMovement}
- 过渡：确保起始帧和结束帧之间自然流畅的运动，避免跳跃或不连续
- 视觉风格：电影质感，全程保持一致的光照和色调
- 细节：保持两帧之间角色和场景的连续性和一致性
- 语言：配音和字幕使用中文`;
      } else {
        videoPrompt = `Generate a smooth transition video from the first image (start frame) to the second image (end frame).

Action Description: ${shot.actionSummary}

Technical Requirements:
- CRITICAL: The video MUST begin with the exact composition of the first image and gradually transition to end with the exact composition of the second image
- Aspect Ratio: 16:9 widescreen landscape format
- Camera Movement: ${shot.cameraMovement}
- Transition: Ensure natural and fluid motion between start and end frames, avoid jumps or discontinuities
- Visual Style: Cinematic quality with consistent lighting and color tone throughout
- Details: Maintain character and scene continuity and consistency between both frames
- Language: Use ${projectLanguage} for voiceover and subtitles`;
      }
    } else {
      // For Veo model, add language instruction to the action summary
      if (projectLanguage === '中文') {
        videoPrompt = `${shot.actionSummary}\n\n镜头运动：${shot.cameraMovement}\n配音语言：使用中文配音`;
      } else {
        videoPrompt = `${shot.actionSummary}\n\nCamera Movement: ${shot.cameraMovement}\nVoiceover Language: Use ${projectLanguage} for voiceover`;
      }
    }
    
    const intervalId = shot.interval?.id || `int-${shot.id}-${Date.now()}`;
    
    // 设置视频生成状态为generating
    updateShot(shot.id, (s) => ({
      ...s,
      interval: s.interval ? { ...s.interval, status: 'generating' } : {
        id: intervalId,
        startKeyframeId: sKf.id,
        endKeyframeId: eKf?.id || '',
        duration: 10,
        motionStrength: 5,
        status: 'generating'
      }
    }));
    
    try {
      const videoUrl = await generateVideo(
          videoPrompt, 
          sKf.imageUrl, 
          endImageUrl, // Only pass if it exists
          selectedModel
      );

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, videoUrl, status: 'completed' } : {
          id: intervalId,
          startKeyframeId: sKf.id,
          endKeyframeId: eKf?.id || '',
          duration: 10,
          motionStrength: 5,
          videoUrl,
          status: 'completed'
        }
      }));
    } catch (e: any) {
      console.error(e);
      // 设置状态为failed
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed' } : undefined
      }));
      
      // Check if it's an API Key error
      if (onApiKeyError && onApiKeyError(e)) {
        return; // Error handled by parent
      }
      alert(`视频生成失败: ${e.message}`);
    }
  };

  const handleCopyPreviousEndFrame = () => {
    if (activeShotIndex === 0) return; // 第一个镜头没有前一个镜头
    
    const previousShot = project.shots[activeShotIndex - 1];
    const previousEndKf = previousShot?.keyframes?.find(k => k.type === 'end');
    
    if (!previousEndKf?.imageUrl) {
      alert("上一个镜头还没有生成结束帧");
      return;
    }
    
    const currentShot = activeShot;
    if (!currentShot) return;
    
    // 复制上一个镜头的结束帧作为当前镜头的起始帧
    const existingStartKf = currentShot.keyframes?.find(k => k.type === 'start');
    const newStartKfId = existingStartKf?.id || `kf-${currentShot.id}-start-${Date.now()}`;
    
    const newStartKf: Keyframe = {
      id: newStartKfId,
      type: 'start',
      visualPrompt: previousEndKf.visualPrompt, // 继承前一帧的提示词
      imageUrl: previousEndKf.imageUrl,
      status: 'completed'
    };
    
    updateShot(currentShot.id, (s) => {
      const newKeyframes = [...(s.keyframes || [])];
      const idx = newKeyframes.findIndex(k => k.type === 'start');
      
      if (idx >= 0) {
        newKeyframes[idx] = newStartKf;
      } else {
        newKeyframes.push(newStartKf);
      }
      
      return { ...s, keyframes: newKeyframes };
    });
  };

  const handleBatchGenerateImages = async () => {
      const isRegenerate = allStartFramesGenerated;
      
      let shotsToProcess = [];
      if (isRegenerate) {
          if (!window.confirm("确定要重新生成所有镜头的首帧吗？这将覆盖现有图片。")) return;
          shotsToProcess = [...project.shots];
      } else {
          // Process shots that don't have a start image URL (handles missing keyframe objects too)
          shotsToProcess = project.shots.filter(s => !s.keyframes?.find(k => k.type === 'start')?.imageUrl);
      }
      
      if (shotsToProcess.length === 0) return;

      setBatchProgress({ 
          current: 0, 
          total: shotsToProcess.length, 
          message: isRegenerate ? "正在重新生成所有首帧..." : "正在批量生成缺失的首帧..." 
      });

      let currentShots = [...project.shots];

      for (let i = 0; i < shotsToProcess.length; i++) {
          // Rate Limit Mitigation: 3s delay
          if (i > 0) await new Promise(r => setTimeout(r, 3000));

          const shot = shotsToProcess[i];
          setBatchProgress({ 
              current: i + 1, 
              total: shotsToProcess.length, 
              message: `正在生成镜头 ${i+1}/${shotsToProcess.length}...` 
          });
          
          try {
             const existingKf = shot.keyframes?.find(k => k.type === 'start');
             let prompt = existingKf?.visualPrompt || shot.actionSummary;
             const kfId = existingKf?.id || `kf-${shot.id}-start-${Date.now()}`;

             // 添加视觉风格
             const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
             const stylePrompts: { [key: string]: string } = {
               'live-action': 'photorealistic, cinematic film quality, real human actors, professional cinematography, natural lighting, 8K resolution',
               'anime': 'Japanese anime style, cel-shaded, vibrant colors, expressive eyes, dynamic poses, Studio Ghibli/Makoto Shinkai quality',
               '2d-animation': 'classic 2D animation, hand-drawn style, Disney/Pixar quality, smooth lines, expressive characters, painterly backgrounds',
               '3d-animation': 'high-quality 3D CGI animation, Pixar/DreamWorks style, subsurface scattering, detailed textures, stylized characters',
               'cyberpunk': 'cyberpunk aesthetic, neon-lit, rain-soaked streets, holographic displays, high-tech low-life, Blade Runner style',
               'oil-painting': 'oil painting style, visible brushstrokes, rich textures, classical art composition, museum quality fine art',
             };
             const stylePrompt = stylePrompts[visualStyle] || visualStyle;
             prompt = `${prompt}\n\nVisual Style: ${stylePrompt}\n\nVisual Requirements: High definition, cinematic composition, 16:9 widescreen format.`;

             const referenceImages = getRefImagesForShot(shot);
             const url = await generateImage(prompt, referenceImages);

             currentShots = currentShots.map(s => {
                if (s.id !== shot.id) return s;
                
                const newKeyframes = [...(s.keyframes || [])];
                const idx = newKeyframes.findIndex(k => k.type === 'start');
                const newKf: Keyframe = {
                    id: kfId,
                    type: 'start',
                    visualPrompt: prompt,
                    imageUrl: url,
                    status: 'completed'
                };

                if (idx >= 0) newKeyframes[idx] = newKf;
                else newKeyframes.push(newKf);

                return { ...s, keyframes: newKeyframes };
             });

             updateProject({ shots: currentShots });

          } catch (e: any) {
             console.error(`Failed to generate for shot ${shot.id}`, e);
             // Check if it's an API Key error
             if (onApiKeyError && onApiKeyError(e)) {
               setBatchProgress(null);
               return; // Error handled by parent
             }
          }
      }

      setBatchProgress(null);
  };

  const handleVariationChange = (shotId: string, charId: string, varId: string) => {
     updateShot(shotId, (s) => ({
         ...s,
         characterVariations: {
             ...(s.characterVariations || {}),
             [charId]: varId
         }
     }));
  };

  const goToPrevShot = () => {
    if (activeShotIndex > 0) {
      setActiveShotId(project.shots[activeShotIndex - 1].id);
    }
  };

  const goToNextShot = () => {
    if (activeShotIndex < project.shots.length - 1) {
      setActiveShotId(project.shots[activeShotIndex + 1].id);
    }
  };

  const renderSceneContext = () => {
      if (!activeShot || !project.scriptData) return null;
      // String comparison for safety
      const scene = project.scriptData.scenes.find(s => String(s.id) === String(activeShot.sceneId));
      const activeCharacters = project.scriptData.characters.filter(c => activeShot.characters.includes(c.id));

      return (
          <div className="bg-[#141414] p-5 rounded-xl border border-zinc-800 mb-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                 <MapPin className="w-4 h-4 text-zinc-500" />
                 <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">场景环境 (Scene Context)</h4>
              </div>
              
              <div className="flex gap-4">
                  <div className="w-28 h-20 bg-zinc-900 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-700 relative">
                    {scene?.referenceImage ? (
                      <img src={scene.referenceImage} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                          <MapPin className="w-6 h-6 text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-bold">{scene?.location || '未知场景'}</span>
                        <span className="text-sm px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {scene?.time}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2">{scene?.atmosphere}</p>
                    
                    {/* Character List with Variation Selector */}
                    <div className="flex flex-col gap-2 pt-2">
                         {activeCharacters.map(char => {
                             const hasVars = char.variations && char.variations.length > 0;
                             return (
                                 <div key={char.id} className="flex items-center justify-between bg-zinc-900 rounded p-1.5 border border-zinc-800">
                                     <div className="flex items-center gap-2">
                                         <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden">
                                             {char.referenceImage && <img src={char.referenceImage} className="w-full h-full object-cover" />}
                                         </div>
                                         <span className="text-[11px] text-zinc-300 font-medium">{char.name}</span>
                                     </div>
                                     
                                     {hasVars && (
                                         <select 
                                            value={activeShot.characterVariations?.[char.id] || ""}
                                            onChange={(e) => handleVariationChange(activeShot.id, char.id, e.target.value)}
                                            className="bg-black text-[10px] text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5 max-w-[100px] outline-none focus:border-indigo-500"
                                         >
                                             <option value="">Default Look</option>
                                             {char.variations.map(v => (
                                                 <option key={v.id} value={v.id}>{v.name}</option>
                                             ))}
                                         </select>
                                     )}
                                 </div>
                             );
                         })}
                    </div>
                  </div>
              </div>
          </div>
      );
  };

  if (!project.shots.length) return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-[#121212]">
          <AlertCircle className="w-12 h-12 mb-4 opacity-50"/>
          <p>暂无镜头数据，请先返回阶段 1 生成分镜表。</p>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#121212] relative overflow-hidden">
      
      {/* Batch Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
           <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
           <h3 className="text-xl font-bold text-white mb-2">{batchProgress.message}</h3>
           <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
               <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div>
           </div>
           <p className="text-zinc-500 mt-3 text-xs font-mono">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-zinc-800 bg-[#1A1A1A] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  <LayoutGrid className="w-5 h-5 text-indigo-500" />
                  导演工作台
                  <span className="text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded">Director Workbench</span>
              </h2>
          </div>

          <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 mr-4 font-mono">
                  {project.shots.filter(s => s.interval?.videoUrl).length} / {project.shots.length} 完成
              </span>
              <button 
                  onClick={handleBatchGenerateImages}
                  disabled={!!batchProgress}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
                      allStartFramesGenerated
                        ? 'bg-[#141414] text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500'
                        : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5'
                  }`}
              >
                  <Sparkles className="w-3 h-3" />
                  {allStartFramesGenerated ? '重新生成所有首帧' : '批量生成首帧'}
              </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
          
          {/* Grid View - Responsive Logic */}
          <div className={`flex-1 overflow-y-auto p-6 transition-all duration-500 ease-in-out ${activeShotId ? 'border-r border-zinc-800' : ''}`}>
              <div className={`grid gap-4 ${activeShotId ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                  {project.shots.map((shot, idx) => {
                      const sKf = shot.keyframes?.find(k => k.type === 'start');
                      const hasImage = !!sKf?.imageUrl;
                      const hasVideo = !!shot.interval?.videoUrl;
                      const isActive = activeShotId === shot.id;

                      return (
                          <div 
                              key={shot.id}
                              onClick={() => setActiveShotId(shot.id)}
                              className={`
                                  group relative flex flex-col bg-[#1A1A1A] border rounded-xl overflow-hidden cursor-pointer transition-all duration-200
                                  ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-xl scale-[0.98]' : 'border-zinc-800 hover:border-zinc-600 hover:shadow-lg'}
                              `}
                          >
                              {/* Header */}
                              <div className="px-3 py-2 bg-[#151515] border-b border-zinc-800 flex justify-between items-center">
                                  <span className={`font-mono text-[10px] font-bold ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`}>SHOT {String(idx + 1).padStart(2, '0')}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded uppercase">{shot.cameraMovement}</span>
                              </div>

                              {/* Thumbnail */}
                              <div className="aspect-video bg-zinc-900 relative overflow-hidden">
                                  {hasImage ? (
                                      <img src={sKf!.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                  ) : (
                                      <div className="absolute inset-0 flex items-center justify-center text-zinc-800">
                                          <ImageIcon className="w-8 h-8 opacity-20" />
                                      </div>
                                  )}
                                  
                                  {/* Badges */}
                                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                                      {hasVideo && <div className="p-1 bg-green-500 text-white rounded shadow-lg backdrop-blur"><Video className="w-3 h-3" /></div>}
                                  </div>

                                  {!activeShotId && !hasImage && (
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <span className="text-[10px] text-white font-bold uppercase tracking-wider bg-zinc-900/90 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur">点击生成</span>
                                      </div>
                                  )}
                              </div>

                              {/* Footer */}
                              <div className="p-3">
                                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                                      {shot.actionSummary}
                                  </p>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>

          {/* Right Workbench - Optimized Interaction */}
          {activeShotId && activeShot && (
              <div className="w-[480px] bg-[#0F0F0F] flex flex-col h-full shadow-2xl animate-in slide-in-from-right-10 duration-300 relative z-20">
                  
                  {/* Workbench Header */}
                  <div className="h-16 px-6 border-b border-zinc-800 flex items-center justify-between bg-[#141414] shrink-0">
                       <div className="flex items-center gap-3">
                           <span className="w-8 h-8 bg-indigo-900/30 text-indigo-400 rounded-lg flex items-center justify-center font-bold font-mono text-sm border border-indigo-500/20">
                              {String(activeShotIndex + 1).padStart(2, '0')}
                           </span>
                           <div>
                               <h3 className="text-white font-bold text-sm">镜头详情</h3>
                               <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{activeShot.cameraMovement}</p>
                           </div>
                       </div>
                       
                       <div className="flex items-center gap-1">
                           <button onClick={goToPrevShot} disabled={activeShotIndex === 0} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-20 transition-colors">
                               <ChevronLeft className="w-4 h-4" />
                           </button>
                           <button onClick={goToNextShot} disabled={activeShotIndex === project.shots.length - 1} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-20 transition-colors">
                               <ChevronRight className="w-4 h-4" />
                           </button>
                           <div className="w-px h-4 bg-zinc-700 mx-2"></div>
                           <button onClick={() => setActiveShotId(null)} className="p-2 hover:bg-red-900/20 rounded text-zinc-400 hover:text-red-400 transition-colors">
                               <X className="w-4 h-4" />
                           </button>
                       </div>
                  </div>

                  {/* Workbench Content */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                       
                       {/* Section 1: Context */}
                       {renderSceneContext()}

                       {/* Section 2: Narrative */}
                       <div className="space-y-4">
                           <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                               <Film className="w-4 h-4 text-zinc-500" />
                               <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">叙事动作 (Action & Dialogue)</h4>
                           </div>
                           
                           <div className="space-y-3">
                               <div className="bg-[#141414] p-4 rounded-lg border border-zinc-800">
                                   <p className="text-zinc-200 text-sm leading-relaxed">{activeShot.actionSummary}</p>
                               </div>
                               
                               {activeShot.dialogue && (
                                  <div className="bg-[#141414] p-4 rounded-lg border border-zinc-800 flex gap-3">
                                      <MessageSquare className="w-4 h-4 text-zinc-600 mt-0.5" />
                                      <div>
                                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">对白</p>
                                          <p className="text-indigo-200 font-serif italic text-sm">"{activeShot.dialogue}"</p>
                                      </div>
                                  </div>
                               )}
                           </div>
                       </div>

                       {/* Section 3: Visual Production */}
                       <div className="space-y-4">
                           <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                               <Aperture className="w-4 h-4 text-zinc-500" />
                               <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">视觉制作 (Visual Production)</h4>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                               {/* Start Frame */}
                               <div className="space-y-2">
                                   <div className="flex justify-between items-center">
                                       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">起始帧 (Start)</span>
                                       <div className="flex items-center gap-1">
                                           {activeShotIndex > 0 && (
                                               <button 
                                                   onClick={handleCopyPreviousEndFrame}
                                                   disabled={!project.shots[activeShotIndex - 1]?.keyframes?.find(k => k.type === 'end')?.imageUrl}
                                                   title="使用上一镜头的结束帧"
                                                   className="text-[10px] text-emerald-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                               >
                                                   ← 使用结束帧
                                               </button>
                                           )}
                                           <button 
                                               onClick={() => handleGenerateKeyframe(activeShot, 'start')}
                                               className="text-[10px] text-indigo-400 hover:text-white transition-colors"
                                           >
                                               {startKf?.imageUrl ? '重新生成' : '生成'}
                                           </button>
                                       </div>
                                   </div>
                                   <div className="aspect-video bg-black rounded-lg border border-zinc-800 overflow-hidden relative group">
                                       {startKf?.imageUrl ? (
                                           <img 
                                               src={startKf.imageUrl} 
                                               className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" 
                                               onClick={() => setPreviewImage({ url: startKf.imageUrl!, title: `镜头 ${String(activeShotIndex + 1).padStart(2, '0')} - 起始帧` })} 
                                           />
                                       ) : (
                                           <div className="absolute inset-0 flex items-center justify-center">
                                               <div className="w-2 h-2 rounded-full bg-zinc-800"></div>
                                           </div>
                                       )}
                                       {/* Loading State */}
                                       {startKf?.status === 'generating' && (
                                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                            </div>
                                       )}
                                   </div>
                               </div>

                               {/* End Frame */}
                               <div className="space-y-2">
                                   <div className="flex justify-between items-center">
                                       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">结束帧 (End)</span>
                                       <button 
                                           onClick={() => handleGenerateKeyframe(activeShot, 'end')}
                                           className="text-[10px] text-indigo-400 hover:text-white transition-colors"
                                       >
                                           {endKf?.imageUrl ? '重新生成' : '生成'}
                                       </button>
                                   </div>
                                   <div className="aspect-video bg-black rounded-lg border border-zinc-800 overflow-hidden relative group">
                                       {endKf?.imageUrl ? (
                                           <img 
                                               src={endKf.imageUrl} 
                                               className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" 
                                               onClick={() => setPreviewImage({ url: endKf.imageUrl!, title: `镜头 ${String(activeShotIndex + 1).padStart(2, '0')} - 结束帧` })} 
                                           />
                                       ) : (
                                           <div className="absolute inset-0 flex items-center justify-center">
                                               <span className="text-[9px] text-zinc-700 uppercase">Optional</span>
                                           </div>
                                       )}
                                       {/* Loading State */}
                                       {endKf?.status === 'generating' && (
                                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                            </div>
                                       )}
                                   </div>
                               </div>
                           </div>
                       </div>

                       {/* Section 4: Video Generation */}
                       <div className="bg-[#141414] rounded-xl p-5 border border-zinc-800 space-y-4">
                           <div className="flex items-center justify-between">
                               <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                  <Video className="w-3 h-3 text-indigo-500" />
                                  视频生成
                               </h4>
                               {activeShot.interval?.status === 'completed' && <span className="text-[10px] text-green-500 font-mono flex items-center gap-1">● READY</span>}
                           </div>
                           
                           {/* Model Selector */}
                           <div className="space-y-2">
                               <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                                  选择视频模型
                               </label>
                               <select
                                   value={activeShot.videoModel || 'sora-2'}
                                   onChange={(e) => updateShot(activeShot.id, (s) => ({
                                       ...s,
                                       videoModel: e.target.value as 'veo_3_1_i2v_s_fast_fl_landscape' | 'sora-2'
                                   }))}
                                   className="w-full bg-black text-white border border-zinc-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500 transition-colors"
                               >
                                   <option value="sora-2">Sora-2 (OpenAI)</option>
                                   <option value="veo_3_1_i2v_s_fast_fl_landscape">Veo 3.1 (Google)</option>
                               </select>
                                   <p className="text-[9px] text-zinc-600 font-mono">
                                   {activeShot.videoModel === 'sora-2' 
                                       ? '✦ Sora-2: OpenAI最新视频生成模型，画质精细'
                                       : '✦ Veo 3.1: Google高速视频生成，适合快速预览'}
                                   </p>
                           </div>
                           
                           {activeShot.interval?.videoUrl ? (
                               <div className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700 relative shadow-lg">
                                   <video src={activeShot.interval.videoUrl} controls className="w-full h-full" />
                               </div>
                           ) : (
                               <div className="w-full aspect-video bg-zinc-900/50 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center">
                                   <span className="text-xs text-zinc-600 font-mono">PREVIEW AREA</span>
                               </div>
                           )}

                           <button
                             onClick={() => handleGenerateVideo(activeShot)}
                             disabled={!startKf?.imageUrl || activeShot.interval?.status === 'generating'}
                             className={`w-full py-3 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                               activeShot.interval?.videoUrl 
                                 ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                 : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
                             } ${(!startKf?.imageUrl) ? 'opacity-50 cursor-not-allowed' : ''}`}
                           >
                             {activeShot.interval?.status === 'generating' ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  生成视频中...
                                </>
                             ) : (
                                <>
                                  {activeShot.interval?.videoUrl ? '重新生成视频' : '开始生成视频'}
                                </>
                             )}
                           </button>
                           
                           {!endKf?.imageUrl && (
                               <div className="text-[9px] text-zinc-500 text-center font-mono">
                                  * 未检测到结束帧，将使用单图生成模式 (Image-to-Video)
                               </div>
                           )}
                           {endKf?.imageUrl && (activeShot.videoModel || 'sora-2') === 'sora-2' && (
                               <div className="text-[9px] text-green-500 text-center font-mono flex items-center justify-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></span>
                                  已启用双帧过渡模式 (Start → End Transition)
                               </div>
                           )}
                       </div>
                  </div>
              </div>
          )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
          <div 
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
              onClick={() => setPreviewImage(null)}
          >
              <button 
                  className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
                  onClick={() => setPreviewImage(null)}
              >
                  <X className="w-6 h-6" />
              </button>
              
              <div className="absolute top-6 left-6 z-10">
                  <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10">
                      <h3 className="text-white font-bold text-sm">{previewImage.title}</h3>
                  </div>
              </div>
              
              <div className="max-w-[95vw] max-h-[95vh] flex items-center justify-center p-8">
                  <img 
                      src={previewImage.url} 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                  />
              </div>
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">
                      <p className="text-white/60 text-xs">点击任意位置关闭</p>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default StageDirector;