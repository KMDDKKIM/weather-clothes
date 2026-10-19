// 옷차림 추천 로직
//
// 핵심 원칙
// - 상의·하의: 원에서 하루 종일 입으니 "낮 최고 체감온도" 기준 → 대낮에 덥지 않게
// - 겉옷·내복: 오갈 때 필요하니 "등원·하원 중 더 추운 시간" 기준 → 춥지 않게
// - 일교차가 크면 벗기 쉬운 겉옷 + 여벌옷 안내
// 옷 아이템과 적정 온도는 clothes.js에서 관리한다.

import { describeWeather, dustGrade } from './weather.js'
import { CATEGORIES, optionsFor } from './clothes.js'
import { colorCombos } from './colors.js'

// 아이 성향 보정 (체감온도에 더함). 더위를 많이 타면 더 따뜻하게 느끼므로 가볍게 입힌다.
export const SENSITIVITY = {
  hot: { label: '더위를 많이 타요', offset: 2 },
  normal: { label: '보통이에요', offset: 0 },
  cold: { label: '추위를 많이 타요', offset: -2 },
}

const round = (n) => Math.round(n)

// 받침 유무에 따라 조사 선택: josa('패딩', '을', '를') → '패딩을'
function josa(word, withBatchim, without) {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0
  return word + (hasBatchim ? withBatchim : without)
}

/** "08:30" → 8.5 */
export function timeToHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h + m / 60
}

/** 8.5 → "오전 8시 30분", 13 → "오후 1시". 24 이상은 다음 날 (25 → "오전 1시") */
export function formatHour(t) {
  const m = Math.round((t - Math.floor(t)) * 60)
  const h = Math.floor(t) % 24
  const ampm = h === 0 ? '밤' : h < 12 ? '오전' : '오후' // 자정은 '밤 12시'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}시${m ? ` ${m}분` : ''}`
}

// 시간 t(소수)의 날씨. 기온은 앞뒤 시간을 보간한다.
function weatherAt(hours, t) {
  const h = Math.min(Math.floor(t), hours.length - 1)
  const a = hours[h]
  const b = hours[h + 1] ?? a
  const f = t - h
  return {
    ...a,
    time: t,
    temp: a.temp + (b.temp - a.temp) * f,
    feels: a.feels + (b.feels - a.feels) * f,
  }
}

// 등원하는 날과 그냥 나가는 날(하원 후·주말)의 말투
const WORDS = {
  school: { leave: '등원', back: '하원', leaveWhen: '등원 때', backWhen: '하원 때', stay: '원에 있는 동안' },
  outing: { leave: '나갈 때', back: '들어올 때', leaveWhen: '나갈 때', backWhen: '들어올 때', stay: '밖에 있는 동안' },
}

/**
 * @param day   fetchWeather()가 돌려준 하루치 (자정을 넘는 외출이면 outing.js의 joinDays로 이어 붙인 것)
 * @param opts    { dropoff: '08:30', pickup: '16:00', sensitivity: 'normal', mode: 'school' | 'outing' }
 *                dropoff·pickup은 소수 시간(17.5)도 된다 ('지금' 탭). mode는 말투 (outing.js)
 * @param adjust  피드백으로 학습한 보정값 { peak, cold } (°C, feedback.js)
 */
export function buildPlan(day, { dropoff, pickup, sensitivity = 'normal', mode = 'school' }, adjust = { peak: 0, cold: 0 }) {
  const offset = SENSITIVITY[sensitivity]?.offset ?? 0
  const start = typeof dropoff === 'number' ? dropoff : timeToHour(dropoff)
  const end = typeof pickup === 'number' ? pickup : timeToHour(pickup)
  const words = WORDS[mode]
  // 오후 3시 넘어 나가면 '낮'이 없으니 '가장 따뜻할 때'라고 부른다
  const daytime = start < 15
  const hours = day.hours

  const dropW = weatherAt(hours, start)
  const pickW = weatherAt(hours, end)

  // 원에(밖에) 있는 동안 시간별 데이터
  const stay = hours.filter((h) => h.hour >= Math.floor(start) && h.hour <= Math.ceil(end))
  const inside = hours.filter((h) => h.hour > start && h.hour < end)

  // 낮 최고: 있는 동안 체감온도가 가장 높은 시각
  const peakW = [dropW, ...inside.map((h) => ({ ...h, time: h.hour })), pickW].reduce((best, w) =>
    w.feels > best.feels ? w : best,
  )
  const coldW = dropW.feels <= pickW.feels ? { ...dropW, when: words.leaveWhen } : { ...pickW, when: words.backWhen }

  const peakEff = peakW.feels + offset + adjust.peak
  const coldEff = coldW.feels + offset + adjust.cold

  const swing = peakW.feels - coldW.feels
  const commuteWind = Math.max(dropW.wind, pickW.wind)

  const maxRain = Math.max(...stay.map((h) => h.rainProb))
  const maxUv = Math.max(...stay.map((h) => h.uv))
  const maxWind = Math.max(...stay.map((h) => h.wind))
  const pm10 = Math.max(...stay.map((h) => h.pm10 ?? -1))
  const pm25 = Math.max(...stay.map((h) => h.pm25 ?? -1))
  const dust = dustGrade(pm10 < 0 ? null : pm10, pm25 < 0 ? null : pm25)

  // 카테고리별로 오늘 입을 수 있는 옷 (잘 맞는 순). 문구는 각 카테고리 1순위 기준
  const pieces = {}
  for (const [category, { basis }] of Object.entries(CATEGORIES)) {
    const t = basis === 'peak' ? peakEff : coldEff
    pieces[category] = optionsFor(category, t, { windy: category === 'outer' && commuteWind >= 5 })
  }
  const outfit = {
    top: pieces.top[0],
    bottom: pieces.bottom[0],
    outer: pieces.outer[0].id === 'no-outer' ? null : pieces.outer[0],
    innerwear: pieces.innerwear[0].id === 'innerwear',
  }

  return {
    mode,
    stayLabel: words.stay,
    moments: [
      { key: 'dropoff', label: words.leave, ...summarize(dropW) },
      { key: 'peak', label: daytime ? '낮 최고' : '가장 따뜻할 때', ...summarize(peakW) },
      { key: 'pickup', label: words.back, ...summarize(pickW) },
    ],
    pieces,
    outfit,
    colors: colorCombos(day.date, { rainy: maxRain >= 50, peakEff }),
    swing: round(swing),
    headline: makeHeadline({ outfit, swing, peakW, coldW, daytime }),
    worries: makeWorries({ outfit, swing, peakW, coldW, peakEff, commuteWind, mode, daytime }),
    items: makeItems({ maxRain, maxUv, maxWind, peakEff, coldEff, swing, dust, outer: outfit.outer }),
    dust,
    stayHours: stay,
  }
}

function summarize(w) {
  return {
    time: w.time,
    timeText: formatHour(w.time),
    temp: round(w.temp),
    feels: round(w.feels),
    weather: describeWeather(w.code),
  }
}

function makeHeadline({ outfit, swing, peakW, coldW, daytime }) {
  const { top, bottom, outer, innerwear } = outfit
  const base = `${top.name}에 ${bottom.name}`
  const inner = innerwear ? ' 내복도 꼭 입혀주세요.' : ''
  if (!outer) return `${base}, 겉옷 없이 충분해요.`
  if (swing >= 8) {
    return `체감온도가 ${coldW.when}는 ${round(coldW.feels)}°, ${daytime ? '낮엔' : '가장 따뜻할 땐'} ${round(peakW.feels)}°까지 올라가요. 안에는 ${base}, 겉옷은 벗기 쉬운 ${outer.name}!${inner}`
  }
  return `${base}, 위에 ${josa(outer.name, '을', '를')} 입혀주세요.${inner}`
}

// 엄마의 두 가지 걱정("낮에 덥지 않을까? / 오갈 때 춥지 않을까?")에 한 줄씩 답한다
function makeWorries({ outfit, swing, peakW, coldW, peakEff, commuteWind, mode, daytime }) {
  const { top, outer, innerwear } = outfit
  const peakTime = formatHour(peakW.time)
  const peakFeels = round(peakW.feels)
  const school = mode === 'school'

  // 걱정 1: 낮에 덥지 않을까?
  let hot
  if (peakEff >= 28) {
    hot = `${peakTime} 체감 ${peakFeels}°로 더워요 — 땀 흡수 잘 되는 옷에, 갈아입을 티셔츠도 챙겨주세요.`
  } else if (peakEff < 12) {
    // 추운 날의 "더위" 걱정은 실내 난방 때문
    const layer = innerwear ? `내복 위에 ${top.name}` : top.name
    hot = `${school ? '원 안은' : '실내는'} 난방이 돼요 — 두꺼운 한 벌보다 ${layer}처럼 겹쳐 입혀야 땀 흘리지 않아요.`
  } else if (outer && swing >= 8) {
    hot = school
      ? `${peakTime} 체감 ${peakFeels}° — 원에서 겉옷 벗고 ${josa(top.name, '이면', '면')} 충분해요.`
      : `${peakTime} 체감 ${peakFeels}° — ${daytime ? '낮엔' : '따뜻할 땐'} 겉옷 벗고 ${top.name}만 입어도 돼요.`
  } else if (daytime) {
    hot = `가장 따뜻한 ${peakTime}에도 체감 ${peakFeels}° — ${josa(top.name, '이면', '면')} 덥지 않아요.`
  }
  // 저녁 외출은 갈수록 추워지기만 하니 "덥지 않을까?"는 굳이 말하지 않는다

  // 걱정 2: 오갈 때 춥지 않을까?
  let cold
  const coldFeels = round(coldW.feels)
  if (!outer) {
    cold = `가장 쌀쌀한 ${coldW.when}도 체감 ${coldFeels}° — 겉옷 없이 괜찮아요.`
  } else {
    cold = `${coldW.when} 체감 ${coldFeels}°로 가장 추워요 — ${josa(outer.name, '이면', '면')} 따뜻해요.`
  }
  if (innerwear) cold += ' 내복도 입혀주세요.'
  if (commuteWind >= 5) cold += ` 바람이 초속 ${round(commuteWind)}m로 강해요.`

  return [hot && { emoji: '🥵', text: hot }, { emoji: '🥶', text: cold }].filter(Boolean)
}

/**
 * '지금' 탭의 '저녁 늦게 들어온다면?' 한 줄 (옷이 달라질 때만)
 * @param plan      평소대로 들어올 때 추천
 * @param latePlan  같은 조건에 들어올 시간만 저녁 늦게로 바꾼 추천
 */
export function lateNote(plan, latePlan) {
  const { timeText, feels } = latePlan.moments[2]
  const outer = plan.outfit.outer
  const lateOuter = latePlan.outfit.outer
  const outerChanged = lateOuter && lateOuter.id !== outer?.id
  const innerwear = latePlan.outfit.innerwear && !plan.outfit.innerwear
  if (!outerChanged && !innerwear) return null
  let text = `저녁 늦게 들어온다면, ${timeText}쯤엔 체감 ${feels}°까지 내려가요.`
  if (outerChanged) {
    text += outer ? ` ${outer.name}보다 따뜻한 ${josa(lateOuter.name, '이', '가')} 좋아요.` : ` ${josa(lateOuter.name, '을', '를')} 챙겨주세요.`
  }
  if (innerwear) text += ' 내복도 입히면 든든해요.'
  return { emoji: '🌙', text }
}

/** 놀이터처럼 계속 밖에 있으면 겉옷을 벗을 데가 없다 (외출하는 날, 겉옷 입는 날만) */
export function outdoorNote(plan) {
  if (plan.mode !== 'outing' || !plan.outfit.outer) return null
  return { emoji: '🛝', text: '놀이터처럼 계속 밖에서 논다면 겉옷은 입힌 채로 두세요.' }
}

function makeItems({ maxRain, maxUv, maxWind, peakEff, coldEff, swing, dust, outer }) {
  const items = []
  if (maxRain >= 60) items.push({ emoji: '☔', label: '우산·우비, 장화', reason: `비 올 확률 ${maxRain}%` })
  else if (maxRain >= 30) items.push({ emoji: '🌂', label: '접이식 우산', reason: `비 올 확률 ${maxRain}%` })

  if (maxRain >= 30 || swing >= 8) {
    items.push({ emoji: '👕', label: '여벌옷', reason: maxRain >= 30 ? '비에 젖을 수 있어요' : '낮에 땀 흘릴 수 있어요' })
  }

  if (maxUv >= 6) items.push({ emoji: '🧢', label: '모자 + 선크림', reason: `자외선 높음 (${round(maxUv)})` })
  else if (maxUv >= 3) items.push({ emoji: '🧴', label: '선크림', reason: `자외선 보통 (${round(maxUv)}), 바깥놀이 대비` })

  if (peakEff >= 28) items.push({ emoji: '💧', label: '물병', reason: '더운 날 수분 보충' })

  if (dust && dust.level >= 2) items.push({ emoji: '😷', label: '마스크', reason: `미세먼지 ${dust.text}` })

  if (coldEff <= 0) items.push({ emoji: '🧤', label: '장갑·목도리·모자', reason: '영하의 추위' })

  if (maxWind >= 5 && !outer) items.push({ emoji: '🌬️', label: '얇은 바람막이', reason: `바람 초속 ${round(maxWind)}m` })

  return items
}
