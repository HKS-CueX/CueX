/**
 * Scenario Adapter Layer contracts.
 * Defines the universal scenario taxonomy and explicitly separates implemented scenarios from roadmap items.
 */

import type { InterventionLevel } from '#src/common';

export type ScenarioId = 'presentation' | 'social' | 'teaching' | 'sales' | 'custom';

export type ScenarioImplementationStatus = 'implemented' | 'roadmap';

export interface ScenarioCapabilities {
  documentCompile: boolean;
  liveAsr: boolean;
  liveQaGrounding: boolean;
  automaticWithdrawal: boolean;
  singlePointRehearsal: boolean;
  memoryGovernance: boolean;
}

export interface ScenarioCapabilityDescriptor {
  id: ScenarioId;
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  status: ScenarioImplementationStatus;
  supportedModes: string[];
  supportedInterventionLevels: InterventionLevel[];
  capabilities: ScenarioCapabilities;
  roadmapSummary?: string;
  limitations?: string[];
}

export const SCENARIO_CAPABILITY_DESCRIPTORS: readonly ScenarioCapabilityDescriptor[] = [
  {
    id: 'presentation',
    name: 'CueX Presentation',
    displayName: 'CueX Presentation · 演讲与答辩临场引导',
    tagline: '持续理解 · 适时提示 · 最小必要干预 · 主动退出',
    description:
      '面向路演、答辩、学术汇报与正式演讲的场前资料编译、场中余光极简提词与事实问答兜底、场后单点重练与可控记忆闭环。',
    status: 'implemented',
    supportedModes: ['rehearsal', 'live'],
    supportedInterventionLevels: ['L0', 'L1', 'L2', 'L3'],
    capabilities: {
      documentCompile: true,
      liveAsr: true,
      liveQaGrounding: true,
      automaticWithdrawal: true,
      singlePointRehearsal: true,
      memoryGovernance: true,
    },
    limitations: [
      '实时语音识别依赖本地/远端 Sherpa ASR、浏览器 Web Speech API 或文本仿真输入（当前界面清晰标注实际生效链路）。',
      '非演讲场景适配器当前处于路线图规划状态，暂不开放实机会话。',
    ],
  },
  {
    id: 'social',
    name: 'CueX Social',
    displayName: 'CueX Social · 高频社交与人际破冰',
    tagline: '路线图规划中 · 暂未开放实机',
    description: '面向即兴社交、跨文化交流与关键对话的轻量化话题衔接与倾听提示适配器。',
    status: 'roadmap',
    supportedModes: [],
    supportedInterventionLevels: ['L0', 'L1', 'L2'],
    capabilities: {
      documentCompile: false,
      liveAsr: false,
      liveQaGrounding: false,
      automaticWithdrawal: false,
      singlePointRehearsal: false,
      memoryGovernance: false,
    },
    roadmapSummary: '规划阶段：需补充低延迟多轮对话边界与高隐私端侧声纹过滤策略。',
  },
  {
    id: 'teaching',
    name: 'CueX Teaching',
    displayName: 'CueX Teaching · 课堂讲授与互动引导',
    tagline: '路线图规划中 · 暂未开放实机',
    description: '面向授课、Workshop 与导师答疑的知识点覆盖追踪与学生提问事实检索适配器。',
    status: 'roadmap',
    supportedModes: [],
    supportedInterventionLevels: ['L0', 'L1', 'L2', 'L3'],
    capabilities: {
      documentCompile: false,
      liveAsr: false,
      liveQaGrounding: false,
      automaticWithdrawal: false,
      singlePointRehearsal: false,
      memoryGovernance: false,
    },
    roadmapSummary: '规划阶段：需扩展教学大纲图谱编译与多提问者上下文切换机制。',
  },
  {
    id: 'sales',
    name: 'CueX Sales',
    displayName: 'CueX Sales · 商业谈判与方案沟通',
    tagline: '路线图规划中 · 暂未开放实机',
    description: '面向高价值 B2B 方案汇报、异议处理与产品边界校验的即时事实提示适配器。',
    status: 'roadmap',
    supportedModes: [],
    supportedInterventionLevels: ['L0', 'L1', 'L2', 'L3'],
    capabilities: {
      documentCompile: false,
      liveAsr: false,
      liveQaGrounding: false,
      automaticWithdrawal: false,
      singlePointRehearsal: false,
      memoryGovernance: false,
    },
    roadmapSummary: '规划阶段：需结合报价与合规白名单校验策略及双通道发言人分离。',
  },
  {
    id: 'custom',
    name: 'CueX Custom',
    displayName: 'CueX Custom · 自定义场景适配器',
    tagline: '路线图规划中 · 暂未开放实机',
    description: '面向开发者与团队的自定目标结构、事实包与干预策略插件协议。',
    status: 'roadmap',
    supportedModes: [],
    supportedInterventionLevels: ['L0', 'L1', 'L2', 'L3'],
    capabilities: {
      documentCompile: false,
      liveAsr: false,
      liveQaGrounding: false,
      automaticWithdrawal: false,
      singlePointRehearsal: false,
      memoryGovernance: false,
    },
    roadmapSummary: '规划阶段：开放声明式 Scenario Adapter SDK 与自定义 Policy 校验钩子。',
  },
] as const;
