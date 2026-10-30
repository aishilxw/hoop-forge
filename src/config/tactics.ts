import type { TacticalPlan } from '../contracts';
export const TACTIC_OPTIONS = {
  offense: [
    ['balanced', '均衡进攻'],
    ['attackPaint', '冲击内线'],
    ['perimeter', '外线拉开'],
    ['pickAndRoll', '挡拆配合'],
  ],
  defense: [
    ['balanced', '均衡防守'],
    ['protectPaint', '收缩护筐'],
    ['pressurePerimeter', '压迫外线'],
  ],
  pace: [
    ['slow', '稳住节奏'],
    ['normal', '正常节奏'],
    ['fast', '提速转换'],
  ],
  rotation: [
    ['balanced', '均衡轮换'],
    ['starters', '主力优先'],
    ['bench', '替补接力'],
  ],
} as const;
export const tacticalLabel = (
  key: 'offense' | 'defense' | 'pace' | 'rotation',
  value: string,
): string => TACTIC_OPTIONS[key].find((o) => o[0] === value)?.[1] ?? value;
export function describePlan(plan: TacticalPlan): string {
  return `${tacticalLabel('offense', plan.offense)} / ${tacticalLabel('defense', plan.defense)} / ${tacticalLabel('pace', plan.pace)} / ${tacticalLabel('rotation', plan.rotation)} / 原创球员${plan.originalMinutes}分钟预算`;
}
