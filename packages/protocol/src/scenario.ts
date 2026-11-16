/**
 * Scenario Adapter Layer contracts.
 * Defines the universal scenario taxonomy and separates live scenarios from upcoming ones.
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
    displayName: 'CueX Presentation 演讲与答辩搭档',
    tagline: '顺畅时安静倾听，卡顿与追问时恰到好处地托底',
    description:
      '面向路演、答辩、学术汇报与主题演讲，提供讲稿提纲整理、台上余光提词、现场追问数据核对与薄弱片段单点重练。',
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
    limitations: [],
  },
  {
    id: 'sales',
    name: 'CueX Sales',
    displayName: 'CueX Sales 商务方案沟通',
    tagline: '即将推出',
    description: '面向顾问式销售与方案汇报，在客户异议与报价问答时即时调出产品参数与服务边界。',
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
    roadmapSummary: '支持报价条款核对、常见客户异议卡片与双人对话角色区分。',
  },
  {
    id: 'teaching',
    name: 'CueX Teaching',
    displayName: 'CueX Teaching 课堂讲授与答疑',
    tagline: '即将推出',
    description: '面向课程讲授、工作坊与学术分享，跟踪章节讲授节奏并在互动提问时快速定位教材与文献出处。',
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
    roadmapSummary: '支持教案知识点图谱整理与跨章节提问快速索引。',
  },
  {
    id: 'social',
    name: 'CueX Social',
    displayName: 'CueX Social 关键职场沟通',
    tagline: '即将推出',
    description: '面向面试、高管汇报与跨文化沟通，在高压对谈中提供轻量话题衔接与表达节奏提醒。',
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
    roadmapSummary: '支持轻量背景卡片挂载与自然对话节奏提示。',
  },
  {
    id: 'custom',
    name: 'CueX Custom',
    displayName: 'CueX Custom 团队专属工作流',
    tagline: '即将推出',
    description: '面向企业与专业团队，按自身业务知识库定制专属的临场辅助规则与标准话术防线。',
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
    roadmapSummary: '支持自定义知识包结构、团队共享口径库与触发策略配置。',
  },
] as const;
