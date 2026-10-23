/**
 * 纯逻辑：不依赖 DOM，可在 Node 中直接单测
 */

export function process(text) {
  return String(text == null ? "" : text).trim();
}
