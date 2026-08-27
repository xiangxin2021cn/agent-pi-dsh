/**
 * Product no longer caps live workers. Parallelism is the DSH native
 * `subagent` / `workflow` rolling pool (`agent-loop.maxParallelToolCalls`
 * defaults to 10 when omitted).
 */
export const PRODUCT_LIVE_WORKER_CAP = null

export function liveWorkerLimitLineZh(): string {
  return '并行拆分走 dsh 原生 subagent / workflow（harness 默认滚动池，结果仍按模型顺序提交）。不要在产品层自设人数上限。评审必须前台等待（run_in_background: false）并用 report 回推。'
}

export function liveWorkerLimitLineEn(): string {
  return 'Use dsh native subagent/workflow for fan-out (harness rolling pool; results still commit in model order). Do not invent a product worker cap. Reviewers must set run_in_background false and report back.'
}
