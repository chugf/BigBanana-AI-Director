/**
 * 视频模型适配器
 * 处理 Veo（同步）和 Sora（异步）API
 */

import { VideoModelDefinition, VideoGenerateOptions, AspectRatio, VideoDuration } from '../../types/model';
import { getApiKeyForModel, getApiBaseUrlForModel, getActiveVideoModel } from '../modelRegistry';
import { ApiKeyError } from './chatAdapter';

/**
 * 重试操作
 */
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 2000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (error.message?.includes('400') || 
          error.message?.includes('401') || 
          error.message?.includes('403')) {
        throw error;
      }
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
};

/**
 * 调整图片尺寸
 */
const resizeImageToSize = async (base64Data: string, targetWidth: number, targetHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 canvas 上下文'));
        return;
      }
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (targetWidth - scaledWidth) / 2;
      const offsetY = (targetHeight - scaledHeight) / 2;
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
      const result = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      resolve(result);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = `data:image/png;base64,${base64Data}`;
  });
};

/**
 * 根据宽高比获取尺寸
 */
const getSizeFromAspectRatio = (aspectRatio: AspectRatio): { width: number; height: number; size: string } => {
  const sizeMap: Record<AspectRatio, { width: number; height: number; size: string }> = {
    '16:9': { width: 1280, height: 720, size: '1280x720' },
    '9:16': { width: 720, height: 1280, size: '720x1280' },
    '1:1': { width: 720, height: 720, size: '720x720' },
  };
  return sizeMap[aspectRatio];
};

/**
 * 根据宽高比获取 Veo 模型名称
 */
const getVeoModelName = (hasReferenceImage: boolean, aspectRatio: AspectRatio): string => {
  const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';
  
  if (hasReferenceImage) {
    return `veo_3_1_i2v_s_fast_fl_${orientation}`;
  } else {
    return `veo_3_1_t2v_fast_${orientation}`;
  }
};

/**
 * 调用 Veo API（同步模式）
 */
const callVeoApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const hasStartImage = !!options.startImage;
  
  // Veo 不支持 1:1
  const finalAspectRatio = aspectRatio === '1:1' ? '16:9' : aspectRatio;
  
  // 获取具体的模型名称
  const modelName = getVeoModelName(hasStartImage, finalAspectRatio);
  
  // 清理图片数据
  const cleanStart = options.startImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';
  const cleanEnd = options.endImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';

  // 构建消息
  const messages: any[] = [{ role: 'user', content: options.prompt }];

  if (cleanStart) {
    messages[0].content = [
      { type: 'text', text: options.prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanStart}` } },
    ];
  }

  if (cleanEnd && Array.isArray(messages[0].content)) {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${cleanEnd}` },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 分钟

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: false,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
        }
        if (res.status === 500) {
          throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
        }
        
        let errorMessage = `HTTP 错误: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          const errorText = await res.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      return res;
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取视频 URL
    const urlMatch = content.match(/https?:\/\/[^\s\])"]+\.mp4[^\s\])"']*/i) ||
                    content.match(/https?:\/\/[^\s\])"]+/i);
    
    if (!urlMatch) {
      throw new Error('视频生成失败：未能从响应中提取视频 URL');
    }

    const videoUrl = urlMatch[0];

    // 下载并转换为 base64
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`视频下载失败: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith('data:')) {
          resolve(result);
        } else {
          reject(new Error('视频转换失败'));
        }
      };
      reader.onerror = () => reject(new Error('视频读取失败'));
      reader.readAsDataURL(videoBlob);
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('视频生成超时 (20分钟)');
    }
    throw error;
  }
};

/**
 * 调用 Sora API（异步模式）
 */
const callSoraApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const duration = options.duration || model.params.defaultDuration;
  const apiModel = model.apiModel || model.id;
  const references = [options.startImage, options.endImage].filter(Boolean) as string[];
  const resolvedModel = apiModel || 'sora-2';
  const useReferenceArray = resolvedModel.toLowerCase().startsWith('veo_3_1-fast');

  if (resolvedModel === 'sora-2' && references.length >= 2) {
    throw new Error('Sora-2 不支持首尾帧模式，请只传一张参考图。');
  }
  
  const { width, height, size } = getSizeFromAspectRatio(aspectRatio);

  console.log(`🎬 使用异步模式生成视频 (${resolvedModel}, ${aspectRatio}, ${duration}秒)...`);

  // 创建任务
  const formData = new FormData();
  formData.append('model', resolvedModel);
  formData.append('prompt', options.prompt);
  formData.append('seconds', String(duration));
  formData.append('size', size);

  const appendReference = async (base64: string, filename: string, fieldName: string) => {
    const cleanBase64 = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const resizedBase64 = await resizeImageToSize(cleanBase64, width, height);
    const byteCharacters = atob(resizedBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    formData.append(fieldName, blob, filename);
  };

  // 添加参考图片（veo_3_1-fast 支持首尾帧数组；其他模型单图）
  if (useReferenceArray) {
    const limited = references.slice(0, 2);
    if (limited[0]) {
      await appendReference(limited[0], 'reference-start.png', 'input_reference[]');
    }
    if (limited[1]) {
      await appendReference(limited[1], 'reference-end.png', 'input_reference[]');
    }
  } else if (references.length >= 1) {
    await appendReference(references[0], 'reference.png', 'input_reference');
  }

  // 创建任务请求
  const createResponse = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!createResponse.ok) {
    if (createResponse.status === 400) {
      throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
    }
    if (createResponse.status === 500) {
      throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
    }
    
    let errorMessage = `创建任务失败: HTTP ${createResponse.status}`;
    try {
      const errorData = await createResponse.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {
      const errorText = await createResponse.text();
      if (errorText) errorMessage = errorText;
    }
    throw new Error(errorMessage);
  }

  const createData = await createResponse.json();
  const taskId = createData.id || createData.task_id;
  
  if (!taskId) {
    throw new Error('创建视频任务失败：未返回任务 ID');
  }

  console.log('📋 Sora-2 任务已创建，任务 ID:', taskId);

  // 轮询状态
  const maxPollingTime = 1200000; // 20 分钟
  const pollingInterval = 5000;
  const startTime = Date.now();
  
  let videoId: string | null = null;

  while (Date.now() - startTime < maxPollingTime) {
    await new Promise(resolve => setTimeout(resolve, pollingInterval));
    
    const statusResponse = await fetch(`${apiBase}/v1/videos/${taskId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn('⚠️ 查询任务状态失败，继续重试...');
      continue;
    }

    const statusData = await statusResponse.json();
    const status = statusData.status;

    console.log('🔄 Sora-2 任务状态:', status, '进度:', statusData.progress);

    if (status === 'completed' || status === 'succeeded') {
      if (statusData.id && statusData.id.startsWith('video_')) {
        videoId = statusData.id;
      } else {
        videoId = statusData.output_video || statusData.video_id || statusData.outputs?.[0]?.id || statusData.id;
      }
      if (!videoId && statusData.outputs && statusData.outputs.length > 0) {
        videoId = statusData.outputs[0];
      }
      console.log('✅ 任务完成，视频 ID:', videoId);
      break;
    } else if (status === 'failed' || status === 'error') {
      throw new Error(`视频生成失败: ${statusData.error || statusData.message || '未知错误'}`);
    }
  }

  if (!videoId) {
    throw new Error('视频生成超时 (20分钟) 或未返回视频 ID');
  }

  // 下载视频
  const maxDownloadRetries = 5;
  const downloadTimeout = 600000;

  for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
    try {
      console.log(`📥 尝试下载视频 (第${attempt}/${maxDownloadRetries}次)...`);
      
      const downloadController = new AbortController();
      const downloadTimeoutId = setTimeout(() => downloadController.abort(), downloadTimeout);
      
      const downloadResponse = await fetch(`${apiBase}/v1/videos/${videoId}/content`, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: downloadController.signal,
      });
      
      clearTimeout(downloadTimeoutId);
      
      if (!downloadResponse.ok) {
        if (downloadResponse.status >= 500 && attempt < maxDownloadRetries) {
          console.warn(`⚠️ 下载失败 HTTP ${downloadResponse.status}，${5 * attempt}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }
        throw new Error(`视频下载失败: HTTP ${downloadResponse.status}`);
      }
      
      const videoBlob = await downloadResponse.blob();
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.startsWith('data:')) {
            console.log('✅ 视频下载完成并转换为 base64');
            resolve(result);
          } else {
            reject(new Error('视频转换失败'));
          }
        };
        reader.onerror = () => reject(new Error('视频读取失败'));
        reader.readAsDataURL(videoBlob);
      });
    } catch (error: any) {
      if (attempt === maxDownloadRetries) {
        throw error;
      }
      console.warn(`⚠️ 下载出错: ${error.message}，重试中...`);
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }

  throw new Error('视频下载失败：已达到最大重试次数');
};

/**
 * 调用视频生成 API
 */
export const callVideoApi = async (
  options: VideoGenerateOptions,
  model?: VideoModelDefinition
): Promise<string> => {
  // 获取当前激活的模型
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) {
    throw new Error('没有可用的视频模型');
  }

  // 获取 API 配置
  const apiKey = getApiKeyForModel(activeModel.id);
  if (!apiKey) {
    throw new ApiKeyError('API Key 缺失，请在设置中配置 API Key');
  }
  
  const apiBase = getApiBaseUrlForModel(activeModel.id);

  // 根据模式选择不同的 API
  if (activeModel.params.mode === 'async') {
    return callSoraApi(options, activeModel, apiKey, apiBase);
  } else {
    return callVeoApi(options, activeModel, apiKey, apiBase);
  }
};

/**
 * 检查宽高比是否支持
 */
export const isAspectRatioSupported = (
  aspectRatio: AspectRatio,
  model?: VideoModelDefinition
): boolean => {
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) return false;
  
  return activeModel.params.supportedAspectRatios.includes(aspectRatio);
};

/**
 * 检查时长是否支持
 */
export const isDurationSupported = (
  duration: VideoDuration,
  model?: VideoModelDefinition
): boolean => {
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) return false;
  
  return activeModel.params.supportedDurations.includes(duration);
};
