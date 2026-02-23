/**
 * StagePrompts 工具函数
 */

import { ProjectState, Character, Scene, Prop, Shot } from '../../types';

/**
 * 保存不同类型的提示词编辑
 */
export const savePromptEdit = (
  project: ProjectState,
  editingPrompt: {
    type: 'character' | 'character-variation' | 'scene' | 'prop' | 'keyframe' | 'video';
    id: string;
    variationId?: string;
    shotId?: string;
    value: string;
  }
): ProjectState => {
  switch (editingPrompt.type) {
    case 'character':
      if (!project.scriptData) return project;
      return {
        ...project,
        scriptData: {
          ...project.scriptData,
          characters: project.scriptData.characters.map(char =>
            char.id === editingPrompt.id
              ? { ...char, visualPrompt: editingPrompt.value }
              : char
          )
        }
      };

    case 'character-variation':
      if (!project.scriptData) return project;
      return {
        ...project,
        scriptData: {
          ...project.scriptData,
          characters: project.scriptData.characters.map(char => {
            if (char.id !== editingPrompt.id) return char;
            return {
              ...char,
              variations: (char.variations || []).map(variation =>
                variation.id === editingPrompt.variationId
                  ? { ...variation, visualPrompt: editingPrompt.value }
                  : variation
              )
            };
          })
        }
      };

    case 'scene':
      if (!project.scriptData) return project;
      return {
        ...project,
        scriptData: {
          ...project.scriptData,
          scenes: project.scriptData.scenes.map(scene =>
            scene.id === editingPrompt.id
              ? { ...scene, visualPrompt: editingPrompt.value }
              : scene
          )
        }
      };

    case 'prop':
      if (!project.scriptData) return project;
      return {
        ...project,
        scriptData: {
          ...project.scriptData,
          props: (project.scriptData.props || []).map(prop =>
            prop.id === editingPrompt.id
              ? { ...prop, visualPrompt: editingPrompt.value }
              : prop
          )
        }
      };

    case 'keyframe':
      return {
        ...project,
        shots: project.shots.map(shot => {
          if (shot.id !== editingPrompt.shotId) return shot;
          return {
            ...shot,
            keyframes: shot.keyframes.map(kf =>
              kf.id === editingPrompt.id
                ? { ...kf, visualPrompt: editingPrompt.value }
                : kf
            )
          };
        })
      };

    case 'video':
      return {
        ...project,
        shots: project.shots.map(shot => {
          if (shot.id !== editingPrompt.shotId) return shot;
          return {
            ...shot,
            interval: shot.interval ? { ...shot.interval, videoPrompt: editingPrompt.value } : undefined
          };
        })
      };

    default:
      return project;
  }
};

/**
 * 搜索过滤
 */
export const filterBySearch = (text: string | undefined | null, searchQuery: string): boolean => {
  if (!searchQuery.trim()) return true;
  return (text || '').toLowerCase().includes(searchQuery.toLowerCase());
};

/**
 * 过滤角色
 */
export const filterCharacters = (characters: Character[], searchQuery: string): Character[] => {
  return characters.filter(char =>
    filterBySearch(char.name, searchQuery) ||
    filterBySearch(char.visualPrompt || '', searchQuery) ||
    (char.variations || []).some(v =>
      filterBySearch(v.name, searchQuery) ||
      filterBySearch(v.visualPrompt, searchQuery)
    )
  );
};

/**
 * 过滤场景
 */
export const filterScenes = (scenes: Scene[], searchQuery: string): Scene[] => {
  return scenes.filter(scene =>
    filterBySearch(scene.location, searchQuery) ||
    filterBySearch(scene.visualPrompt || '', searchQuery)
  );
};

/**
 * 过滤道具
 */
export const filterProps = (props: Prop[], searchQuery: string): Prop[] => {
  return props.filter(prop =>
    filterBySearch(prop.name, searchQuery) ||
    filterBySearch(prop.description || '', searchQuery) ||
    filterBySearch(prop.visualPrompt || '', searchQuery)
  );
};

/**
 * 过滤镜头
 */
export const filterShots = (shots: Shot[], searchQuery: string): Shot[] => {
  return shots.filter(shot => {
    const hasMatchingShotMeta =
      filterBySearch(shot.actionSummary, searchQuery) ||
      filterBySearch(shot.cameraMovement, searchQuery) ||
      filterBySearch(shot.shotSize, searchQuery);
    const hasMatchingKeyframe = shot.keyframes.some(kf =>
      filterBySearch(kf.visualPrompt, searchQuery)
    );
    const hasMatchingVideoPrompt = filterBySearch(shot.interval?.videoPrompt, searchQuery);
    return hasMatchingShotMeta || hasMatchingKeyframe || hasMatchingVideoPrompt;
  });
};

/**
 * 生成默认视频提示词
 */
export const getDefaultVideoPrompt = (shot: Shot): string => {
  return `${shot.actionSummary}\n\n镜头运动：${shot.cameraMovement}\n模型：${shot.videoModel || 'sora-2'}`;
};
