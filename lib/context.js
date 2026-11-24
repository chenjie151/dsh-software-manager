/**
 * 从会话事件流里还原"谁装的"。
 *
 * 目标：给每条安装记录补上
 *   sessionTitle  会话标题（harness 自动起的名字）
 *   workspace     会话所在工作区（slug 的反解，读不到就退回目录名）
 *   userAsk       这一轮用户到底要什么（用户消息原文，截断）
 *   agentLead     助手在装之前说的话（解释为什么装）
 *   turn          第几轮
 *
 * 只读 user/message、session/title、agent/inbox/spliced 与 tool/call 的时序，
 * 不做任何推断式编造：找不到就留空。
 */

const ASK_LIMIT = 240;
const LEAD_LIMIT = 200;

import { isFillerAsk } from "./meta.js";

function clip(value, limit) {
  const text = String(value ?? "").replace(/\r/g, "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

function textOfContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n");
}

/** harness 自己塞进对话的运行时通知，不是用户说的话。 */
const SYSTEM_INJECTED = /^(<\s*system-reminder|<\s*acp|Time sampled while preparing turn|Elapsed since the preceding|Browser time zone for this request|Background subagent .* finished|Background job|<agent-notification|<delegate|The user changed the|The user approved|Approval|Permission)/i;
const SYSTEM_SOURCE = /^(dsh-|subagent|delegate|job|system|developer|tool)/i;

/** 用户消息里去掉 @路径 这类引用前缀，留下真正的诉求。 */
function cleanAsk(value) {
  let text = String(value ?? "");
  text = text.replace(/@"[^"]*"/g, "").replace(/@[^\s@]*(?=\s|$)/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return clip(text, ASK_LIMIT);
}

/** 这条用户消息是不是"真的由人发出的"。
 *  人在客户端发消息会带 rpcId；harness 自己 splice 进来的运行时通知没有。 */
function isHumanMessage(data) {
  const kind = String(data?.source?.kind ?? "");
  if (SYSTEM_SOURCE.test(kind)) return false;
  if (kind && kind !== "user") return false;
  const rpcId = data?.source?.rpcId;
  return typeof rpcId === "string" && rpcId.length > 0;
}

/**
 * @param {Array<object>} events 会话事件（已按 seq 排序）
 * @returns {{ asks: Map<number,string>, leads: Map<number,string>, title: string, titleSeq: number|null }}
 */
export function readConversation(events) {
  const asks = new Map();
  const leads = new Map();
  let title = "";
  let titleSeq = null;

  let turn = 0;
  let pendingAsk = null;
  let lastTexts = [];
  // 之前轮次里最后一句真正的诉求：本轮只回了"继续"时用它兜底
  let lastRealAsk = null;

  for (const event of events) {
    const type = event?.type;
    const data = event?.data;
    const seq = typeof event?.seq === "number" ? event.seq : null;

    if (type === "turn/start") {
      const next = Number(data?.turn);
      if (Number.isFinite(next)) turn = next;
      if (pendingAsk !== null) {
        asks.set(turn, pendingAsk);
        pendingAsk = null;
      }
      continue;
    }

    if (type === "session/title") {
      const value = data?.title;
      if (typeof value === "string" && value.trim()) {
        title = value.trim();
        titleSeq = seq;
      }
      continue;
    }

    if (type === "user/message") {
      // splice 进来的用户消息也走这里
      if (!isHumanMessage(data)) continue;
      const text = textOfContent(data?.content);
      if (SYSTEM_INJECTED.test(text.trim())) continue;
      const ask = cleanAsk(text);
      if (ask && !isFillerAsk(ask)) {
        pendingAsk = ask;
        lastRealAsk = ask;
      } else if (ask && lastRealAsk && turn > 0 && !asks.has(turn)) {
        // 本轮只有"继续"这类回声：用上一轮真正的要求，说明这一轮在延续同一件事
        pendingAsk = lastRealAsk;
      }
      // 同一轮可能有多条用户消息（打断/追加），保留最新一条
      if (turn > 0 && pendingAsk !== null) asks.set(turn, pendingAsk);
      lastTexts = [];
      continue;
    }

    if (type === "agent/inbox/spliced") {
      const inserted = data?.inserted;
      if (Array.isArray(inserted)) {
        for (const item of inserted) {
          if (!item || typeof item !== "object") continue;
          if (!isHumanMessage(item)) continue;
          const text = textOfContent(item.content);
          if (SYSTEM_INJECTED.test(text.trim())) continue;
          const ask = cleanAsk(text);
          if (ask && !isFillerAsk(ask)) {
            pendingAsk = ask;
            lastRealAsk = ask;
            if (turn > 0) asks.set(turn, ask);
          } else if (ask && lastRealAsk && turn > 0 && !asks.has(turn)) {
            pendingAsk = lastRealAsk;
            asks.set(turn, pendingAsk);
          }
        }
      }
      continue;
    }

    if (type === "assistant/message") {
      const blocks = data?.message?.content;
      if (!Array.isArray(blocks)) continue;
      const texts = blocks
        .filter((block) => block && block.type === "text" && typeof block.text === "string")
        .map((block) => block.text.trim())
        .filter(Boolean);
      lastTexts = texts;
      if (turn > 0 && texts.length > 0 && !leads.has(turn)) {
        leads.set(turn, clip(texts[texts.length - 1], LEAD_LIMIT));
      }
      continue;
    }

    if (type === "tool/call") {
      // 这一步要调工具了：把上一条助手文字记成"为什么动手"
      if (turn > 0 && lastTexts.length > 0 && !leads.has(turn)) {
        leads.set(turn, clip(lastTexts[lastTexts.length - 1], LEAD_LIMIT));
      }
      continue;
    }
  }

  if (pendingAsk !== null && turn > 0 && !asks.has(turn)) asks.set(turn, pendingAsk);

  return { asks, leads, title, titleSeq };
}

export const ASK_MAX = ASK_LIMIT;
export const LEAD_MAX = LEAD_LIMIT;
