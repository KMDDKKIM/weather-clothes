// '지금' 탭: 등원할 때뿐 아니라 평소 아이랑 나갈 때도 쓸 수 있게
//
// - 평일, 하원 전: 예전 '오늘'과 같은 등원·하원 기준 (아이는 원에 있으니까)
// - 하원 후나 주말: 지금 나가서 들어올 때까지 기준 ('나갈 때 / 들어올 때')
//   · 나갈 시간 = 지금 (10분 단위). 단 평소 등원 시간 전이면 그 시간 (주말 아침)
//   · 들어올 시간은 고르지 않고 알아서: 평소 하원 시간, 그게 3시간도 안 남았으면 지금부터 3시간 뒤
// - 저녁 늦게(밤 9시) 들어오면 옷이 달라질 때만 따로 알려준다
// (성인용 앱 '오늘 뭐 입지?'의 '지금' 탭을 아이 생활에 맞게 옮김. 성인용은 '밤늦게' = 밤 11시)

import { timeToHour } from './outfit.js'

const LATE = 21 // '저녁 늦게' = 밤 9시 (아이 기준)
const MIN_OUT = 3 // 나가면 보통 3시간은 있다 온다

export function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60
}

export function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6
}

/**
 * '지금' 탭 기준
 * @returns { mode: 'school' | 'outing', dropoff, pickup }  dropoff·pickup은 소수 시간
 */
export function nowOuting(now, settings) {
  const dropoff = timeToHour(settings.dropoff)
  const pickup = timeToHour(settings.pickup)
  if (!isWeekend(now) && hourOf(now) < pickup) return { mode: 'school', dropoff, pickup }
  const leave = Math.max(Math.round(hourOf(now) * 6) / 6, dropoff)
  return { mode: 'outing', dropoff: leave, pickup: Math.max(pickup, Math.round(leave + MIN_OUT)) }
}

/** '내일' 탭 기준: 설정한 시간 그대로, 주말이면 외출 말투 */
export function tomorrowOuting(now, settings) {
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  return {
    mode: isWeekend(tomorrow) ? 'outing' : 'school',
    dropoff: timeToHour(settings.dropoff),
    pickup: timeToHour(settings.pickup),
  }
}

/** '저녁 늦게 들어온다면?' 기준 시간. 들어올 시간이 이미 밤 9시 이후면 null */
export function lateBack(back) {
  return back < LATE ? LATE : null
}

/** 오늘·내일 시간별 날씨를 이어 붙인다 (내일 0시 = 24시). 자정을 넘는 외출용 */
export function joinDays(today, tomorrow) {
  if (!tomorrow) return today
  return { ...today, hours: [...today.hours, ...tomorrow.hours.map((h) => ({ ...h, hour: h.hour + 24 }))] }
}
