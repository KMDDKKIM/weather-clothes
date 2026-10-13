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

/** 8.5 → "8시 30분", 13 → "오후 1시" */
export function formatHour(t) {
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}시${m ? ` ${m}분` : ''}`
}

// 시간 t(소수)의 날씨. 기온은 앞뒤 시간을 보간한다.
function weatherAt(hours, t) {
  const h = Math.min(Math.floor(t), 23)
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

/**
 * @param day   fetchWeather()가 돌려준 하루치
 * @param opts    { dropoff: '08:30', pickup: '16:00', sensitivity: 'normal' }
 * @param adjust  피드백으로 학습한 보정값 { peak, cold } (°C, feedback.js)
 */
export function buildPlan(day, { dropoff, pickup, sensitivity = 'normal' }, adjust = { peak: 0, cold: 0 }) {
  const offset = SENSITIVITY[sensitivity]?.offset ?? 0
  const start = timeToHour(dropoff)
  const end = timeToHour(pickup)
  const hours = day.hours

  const dropW = weatherAt(hours, start)
  const pickW = weatherAt(hours, end)

  // 원에 있는 동안 (등원~하원) 시간별 데이터
  const stay = hours.filter((h) => h.hour >= Math.floor(start) && h.hour <= Math.ceil(end))
  const inside = hours.filter((h) => h.hour > start && h.hour < end)

  // 낮 최고: 원에 있는 동안 체감온도가 가장 높은 시각
  const peakW = [dropW, ...inside.map((h) => ({ ...h, time: h.hour })), pickW].reduce((best, w) =>
    w.feels > best.feels ? w : best,
  )
  const coldW = dropW.feels <= pickW.feels ? { ...dropW, label: '등원' } : { ...pickW, label: '하원' }

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
    moments: [
      { key: 'dropoff', label: '등원', ...summarize(dropW) },
      { key: 'peak', label: '낮 최고', ...summarize(peakW) },
      { key: 'pickup', label: '하원', ...summarize(pickW) },
    ],
    pieces,
    outfit,
    colors: colorCombos(day.date, { rainy: maxRain >= 50, peakEff }),
    swing: round(swing),
    headline: makeHeadline({ outfit, swing, peakW, coldW }),
    worries: makeWorries({ outfit, swing, peakW, coldW, peakEff, commuteWind }),
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

function makeHeadline({ outfit, swing, peakW, coldW }) {
  const { top, bottom, outer, innerwear } = outfit
  const base = `${top.name}에 ${bottom.name}`
  const inner = innerwear ? ' 내복도 꼭 입혀주세요.' : ''
  if (!outer) return `${base}, 겉옷 없이 충분해요.`
  if (swing >= 8) {
    return `${coldW.label} 땐 ${round(coldW.feels)}°, 낮엔 ${round(peakW.feels)}°까지 올라가요. 안에는 ${base}, 겉옷은 벗기 쉬운 ${outer.name}!${inner}`
  }
  return `${base}, 위에 ${josa(outer.name, '을', '를')} 입혀주세요.${inner}`
}

function makeWorries({ outfit, swing, peakW, coldW, peakEff, commuteWind }) {
  const { top, outer, innerwear } = outfit
  const peakTime = formatHour(peakW.time)

  // 걱정 1: 대낮에 덥지 않을까?
  let hot
  if (peakEff >= 28) {
    hot = `${peakTime}에 체감 ${round(peakW.feels)}°까지 올라가 더워요. ${top.name}에 땀 흡수 잘 되는 소재로 입히고, 갈아입을 티셔츠를 챙겨주세요.`
  } else if (peakEff < 12) {
    // 추운 날의 "더위" 걱정은 원 안 난방 때문
    const layer = innerwear ? `내복 위에 ${top.name}` : top.name
    hot = `바깥은 낮에도 체감 ${round(peakW.feels)}°로 쌀쌀하지만, 원 안은 난방이 돼요. 두꺼운 옷 한 벌보다 ${layer}처럼 겹쳐 입혀야 실내에서 땀 흘리지 않아요.`
  } else if (outer && swing >= 8) {
    hot = `${peakTime}엔 체감 ${round(peakW.feels)}°예요. 원에서는 겉옷을 벗고 ${top.name}만 입으면 덥지 않아요. 선생님께 "낮에 겉옷 벗겨주세요" 부탁해두면 좋아요.`
  } else {
    hot = `가장 따뜻한 ${peakTime}에도 체감 ${round(peakW.feels)}°예요. ${josa(top.name, '이면', '면')} 덥지 않아요.`
  }

  // 걱정 2: 춥지 않을까?
  let cold
  const coldTime = `${coldW.label}(${formatHour(coldW.time)})`
  if (!outer) {
    cold = `가장 쌀쌀한 ${coldTime}에도 체감 ${round(coldW.feels)}°라 겉옷 없이도 괜찮아요.`
  } else {
    cold = `가장 추운 ${coldTime}은 체감 ${round(coldW.feels)}°예요. ${josa(outer.name, '을', '를')} 입히면 따뜻해요.`
  }
  if (innerwear) cold += ' 내복까지 입으면 든든해요.'
  if (commuteWind >= 5) cold += ` 바람이 초속 ${round(commuteWind)}m로 강해서 더 춥게 느껴질 수 있어요.`

  return [
    { emoji: '🥵', q: '대낮에 덥지 않을까?', a: hot },
    { emoji: '🥶', q: '등·하원 때 춥지 않을까?', a: cold },
  ]
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
