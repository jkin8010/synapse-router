/**
 * feature_id → API path 推导
 *
 * OpenAI Pack 命名规则：
 *   chat_post_v1_chat_completions → POST /v1/chat/completions
 *   embeddings_post_v1_embeddings → POST /v1/embeddings
 *   images_generations_post_v1_images_generations → POST /v1/images/generations
 *   audio_transcriptions_post_v1_audio_transcriptions → POST /v1/audio/transcriptions
 *
 * 通用逻辑：{intent}_{method}_{path_segments} → METHOD /{path}
 * 其中 path_segments 用 _ 分隔，转换为 / 分隔的路径
 */

export interface DerivedPath {
  method: "POST" | "GET";
  path: string;
}

/**
 * 从 feature_id 推导出 HTTP method 和 API path
 *
 * 规则：
 * 1. 找到 "_post_" 或 "_get_" 来确定 method 和路径起点
 * 2. 路径段用 _ 分隔，转换为 / 分隔
 * 3. 路径前加 /
 */
export function deriveApiPath(featureId: string): DerivedPath {
  // 查找 method 标记
  const postIdx = featureId.indexOf("_post_");
  const getIdx = featureId.indexOf("_get_");

  let method: "POST" | "GET";
  let pathStart: number;

  if (postIdx !== -1) {
    method = "POST";
    pathStart = postIdx + "_post_".length;
  } else if (getIdx !== -1) {
    method = "GET";
    pathStart = getIdx + "_get_".length;
  } else {
    // 回退：如果没有 method 标记，假设 POST 且整个 feature_id 是路径
    return {
      method: "POST",
      path: "/" + featureId.replace(/_/g, "/"),
    };
  }

  const pathSegments = featureId.slice(pathStart);
  const path = "/" + pathSegments.replace(/_/g, "/");

  return { method, path };
}
