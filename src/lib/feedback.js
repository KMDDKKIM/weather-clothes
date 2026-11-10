// 하원 후 피드백 → 아이별 추천 보정
//
// 기록: { 'YYYY-MM-DD': { rating: 'cold'|'good'|'hot', when: 'day'|'commute'|null, peakFeels, coldFeels } }
// 보정값(°C)은 체감온도에 더한다. 더웠다 → +(가볍게), 추웠다 → -(따뜻하게)
// - when 'day'     → 낮(상의·하의) 보정만
// - when 'commute' → 등·하원(겉옷·내복) 보정만
// - 모름(null)     → 둘 다

// 프로필마다 따로 저장 (아이: 예전 키 그대로, 나: 'weather-clothes-me-feedback')
export const FEEDBACK_KEYS = { kid: 'weather-clothes-feedback', me: 'weather-clothes-me-feedback' }
const STEP = 0.5 // 피드백 1번당 보정 폭
const LIMIT = 3 // 보정 최대치
const RECENT = 14 // 최근 며칠 피드백만 반영

export const RATINGS = {
  cold: { emoji: '🥶', label: '추웠어요' },
  good: { emoji: '😊', label: '딱 좋았어요' },
  hot: { emoji: '🥵', label: '더웠어요' },
}

export const WHENS = {
  commute: '등·하원 때',
  day: '원에서 낮에',
}

export function loadFeedback(key = FEEDBACK_KEYS.kid) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

export function saveFeedback(log, key = FEEDBACK_KEYS.kid) {
  try {
    localStorage.setItem(key, JSON.stringify(log))
  } catch {
    // 저장 실패해도 앱은 동작
  }
}

const clamp = (n) => Math.max(-LIMIT, Math.min(LIMIT, n))

/** 최근 피드백으로 계산한 보정값 { peak, cold } */
export function learnedAdjust(log) {
  const recent = Object.keys(log).sort().slice(-RECENT).map((date) => log[date])
  let peak = 0
  let cold = 0
  for (const { rating, when } of recent) {
    const delta = rating === 'hot' ? STEP : rating === 'cold' ? -STEP : 0
    if (when !== 'commute') peak += delta
    if (when !== 'day') cold += delta
  }
  return { peak: clamp(peak), cold: clamp(cold) }
}

/** 보정값을 읽을 수 있는 문장으로. commuteLabel: 오가는 때를 부르는 말 (아이 '등·하원 때', 나 '오갈 때') */
export function describeAdjust({ peak, cold }, commuteLabel = '등·하원 때') {
  const part = (label, v) => {
    if (v === 0) return null
    const level = Math.abs(v) >= 2 ? '' : '조금 '
    return `${label}엔 ${level}${v > 0 ? '가볍게' : '따뜻하게'}`
  }
  const parts = [part('낮', peak), part(commuteLabel, cold)].filter(Boolean)
  return parts.length ? `${parts.join(', ')} 추천하고 있어요` : null
}
