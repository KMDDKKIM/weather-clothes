// 날씨 데이터
// - 기온·강수확률·바람·하늘: 기상청 단기예보 (공공데이터포털, 5km 격자). 네이버·다음 날씨와 같은 출처
// - 체감온도: 기상청 공식으로 계산 (겨울: 기온·바람 / 여름: 기온·습도)
// - 미세먼지: 에어코리아 (오늘 = 가까운 측정소 실시간, 내일 = 시도별 예보 등급)
// - 자외선: 기상청 단기예보에 없어서 Open-Meteo
// 공공데이터포털은 중계 서버(worker/, Cloudflare Workers)를 거친다. 인증키는 그 서버에만 있고 앱엔 없다.
// 기상청을 못 불러오면(서버 오류·트래픽 초과 등) 예전처럼 Open-Meteo로 대신한다.
// 결과 형태는 어느 쪽이든 같다 (fetchWeather 설명 참고).

// 중계 서버 주소 (없으면 Open-Meteo만)
const PROXY = import.meta.env.VITE_WEATHER_PROXY ?? 'https://weather-clothes-api.kmddkkim.workers.dev'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/**
 * @returns {Promise<Array<{
 *   date: string, max: number, min: number, cal: { cold, peak },
 *   hours: Array<{ hour, temp, feels, rainProb, code, wind, uv, pm10, pm25 }>
 * }>>}  오늘, 내일 2일치. hours[i]는 i시 데이터 (24개). code는 WMO 날씨 코드
 *   cal: 옷을 고를 때 체감온도에 더할 보정값 (아래 CALIBRATION, Open-Meteo면 0)
 */
export async function fetchWeather({ lat, lon }) {
  if (PROXY) {
    try {
      return await fetchKorea({ lat, lon })
    } catch (e) {
      console.warn('기상청 날씨를 불러오지 못해 Open-Meteo로 대신해요.', e)
    }
  }
  return fetchOpenMeteo({ lat, lon })
}

// ---------- 기상청 + 에어코리아 ----------

async function fetchKorea({ lat, lon }) {
  const now = kstNow()
  const today = ymd(now)
  const tomorrow = ymd(addDays(now, 1))
  const { nx, ny } = toGrid(lat, lon)

  const [forecast, uv, air] = await Promise.all([
    kmaForecast(nx, ny, now),
    // 자외선·미세먼지는 실패해도 날씨는 보여준다
    openMeteoUv(lat, lon).catch(() => ({})),
    airKorea(lat, lon, today, tomorrow).catch(() => null),
  ])

  return [today, tomorrow].map((date) => {
    const hours = []
    for (let hour = 0; hour < 24; hour++) {
      const f = forecast[`${date.replace(/-/g, '')}${pad(hour)}00`]
      if (!f) continue
      const dust = air?.[date] ?? {}
      hours.push({
        hour,
        temp: f.TMP,
        feels: feelsLike(f.TMP, f.WSD, f.REH, Number(date.slice(5, 7))),
        rainProb: f.POP ?? 0,
        code: weatherCode(f.SKY, f.PTY),
        wind: f.WSD ?? 0,
        uv: uv[`${date}T${pad(hour)}:00`] ?? 0,
        pm10: dust.pm10 ?? null,
        pm25: dust.pm25 ?? null,
      })
    }
    if (hours.length === 0) throw new Error(`${date} 예보가 없어요`)
    const filled = fillHours(hours)
    const temps = filled.map((h) => h.temp)
    const [cold, peak] = CALIBRATION[Number(date.slice(5, 7))]
    return { date, max: Math.max(...temps), min: Math.min(...temps), cal: { cold, peak }, hours: filled }
  })
}

/**
 * 단기예보를 시각별로 모은다: { 'YYYYMMDDHH00': { TMP, POP, SKY, PTY, WSD, REH } }
 * 최신 발표는 지난 시각이 빠져 있어서, 어제 밤 11시 발표(오늘 0시부터 있음)로 앞부분을 채운다.
 */
async function kmaForecast(nx, ny, now) {
  const latest = latestBase(now)
  const yesterdayLate = { date: ymd(addDays(now, -1)).replace(/-/g, ''), time: '2300' }
  const same = latest.date === yesterdayLate.date && latest.time === yesterdayLate.time
  const [older, newer] = await Promise.all([
    same ? null : kmaCall(nx, ny, yesterdayLate).catch(() => null),
    kmaCall(nx, ny, latest).catch((e) => {
      // 발표 직후엔 아직 안 올라왔을 수 있으니 한 번 전 발표로
      const prev = previousBase(latest)
      return kmaCall(nx, ny, prev).catch(() => {
        throw e
      })
    }),
  ])
  const merged = {}
  for (const items of [older, newer]) {
    for (const { fcstDate, fcstTime, category, fcstValue } of items ?? []) {
      const key = fcstDate + fcstTime
      merged[key] ??= {}
      merged[key][category] = Number(fcstValue)
    }
  }
  return merged
}

async function kmaCall(nx, ny, base) {
  const cacheKey = `kma:${nx},${ny}:${base.date}${base.time}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached
  const params = new URLSearchParams({
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    base_date: base.date,
    base_time: base.time,
    nx: String(nx),
    ny: String(ny),
  })
  const res = await fetch(`${PROXY}/kma/forecast?${params}`)
  if (!res.ok) throw new Error(`기상청 ${res.status}`)
  const json = await res.json()
  const { resultCode, resultMsg } = json.response?.header ?? {}
  if (resultCode !== '00') throw new Error(`기상청 ${resultCode} ${resultMsg}`)
  const items = json.response.body.items.item.filter((i) => FIELDS.has(i.category))
  cacheSet(cacheKey, items, 6 * 60 * 60 * 1000) // 같은 발표는 바뀌지 않는다
  return items
}

const FIELDS = new Set(['TMP', 'POP', 'SKY', 'PTY', 'WSD', 'REH'])

// 단기예보 발표: 02·05·08·11·14·17·20·23시, 발표 10분 뒤부터 조회 가능
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]

function latestBase(now) {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const hour = [...BASE_HOURS].reverse().find((h) => h * 60 + 10 <= minutes)
  if (hour == null) return { date: ymd(addDays(now, -1)).replace(/-/g, ''), time: '2300' }
  return { date: ymd(now).replace(/-/g, ''), time: `${pad(hour)}00` }
}

function previousBase({ date, time }) {
  const i = BASE_HOURS.indexOf(Number(time.slice(0, 2)))
  if (i > 0) return { date, time: `${pad(BASE_HOURS[i - 1])}00` }
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) - 1))
  return { date: ymd(d).replace(/-/g, ''), time: '2300' }
}

// 빠진 시각은 가까운 시각 값으로 (발표가 늦어 앞뒤가 비는 경우 대비)
function fillHours(hours) {
  const byHour = Object.fromEntries(hours.map((h) => [h.hour, h]))
  const out = []
  for (let hour = 0; hour < 24; hour++) {
    let near = null
    for (let d = 0; d < 24 && !near; d++) near = byHour[hour - d] ?? byHour[hour + d]
    out.push({ ...near, hour })
  }
  return out
}

/**
 * 기상청 체감온도
 * - 겨울(10~4월): 기온 10° 이하, 바람 1.3m/s 이상일 때 바람 냉각 (그 밖엔 기온 그대로)
 * - 여름(5~9월): 기온·습도로 계산 (습구온도 이용)
 */
export function feelsLike(t, wind = 0, rh = 50, month) {
  if (month >= 5 && month <= 9) {
    const tw =
      t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(t + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
      4.686035
    return -0.2442 + 0.55399 * tw + 0.45535 * t - 0.0022 * tw * tw + 0.00278 * tw * t + 3.0
  }
  if (t > 10 || wind < 1.3) return t
  const v = (wind * 3.6) ** 0.16 // km/h
  return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * v * t
}

/**
 * 옷 기준 보정 (월별 [오갈 때, 낮], °C). 화면엔 기상청 체감온도를 그대로 보여주고, 옷을 고를 때만 더한다.
 * 옷 온도 범위(clothes.js)는 Open-Meteo 체감온도로 맞춰 왔는데(사계절 시뮬레이션·실사용),
 * 기상청 공식은 봄·가을·겨울엔 1~2° 높고(10° 넘으면 기온 그대로) 여름 낮엔 3~4° 낮다.
 * 2025.11~2026.10 서울 날씨로 두 체감온도의 월평균 차이를 구해 넣었다 →
 * 예전과 같은 옷 78~93%, 나머지는 두껍게·얇게가 반반 (날마다의 차이)
 */
const CALIBRATION = {
  1: [-1, -1.5], 2: [-1.5, -2], 3: [-2, -2], 4: [-2, -2], 5: [-1.5, 0.5], 6: [0.5, 2.5],
  7: [2, 3], 8: [2.5, 4], 9: [-0.5, 1.5], 10: [-1, -1.5], 11: [-2, -2.5], 12: [-1.5, -2],
}

// 하늘상태(SKY 1 맑음·3 구름많음·4 흐림) + 강수형태(PTY) → WMO 코드 (describeWeather에서 이모지로)
function weatherCode(sky, pty) {
  if (pty === 1 || pty === 5) return 63 // 비, 빗방울
  if (pty === 2 || pty === 6) return 67 // 비/눈
  if (pty === 3 || pty === 7) return 73 // 눈
  if (pty === 4) return 80 // 소나기
  if (sky === 4) return 3
  if (sky === 3) return 2
  return 0
}

// 기상청 격자 좌표 (Lambert Conformal Conic, 기상청 제공 변환식)
export function toGrid(lat, lon) {
  const RE = 6371.00877 / 5.0
  const DEG = Math.PI / 180
  const slat1 = 30 * DEG
  const slat2 = 60 * DEG
  const olon = 126 * DEG
  const olat = 38 * DEG
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (sf ** sn * Math.cos(slat1)) / sn
  const ro = (RE * sf) / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn
  const ra = (RE * sf) / Math.tan(Math.PI * 0.25 + lat * DEG * 0.5) ** sn
  let theta = lon * DEG - olon
  if (theta > Math.PI) theta -= 2 * Math.PI
  if (theta < -Math.PI) theta += 2 * Math.PI
  theta *= sn
  return {
    nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5),
  }
}

// ---- 에어코리아 ----

/** { 'YYYY-MM-DD': { pm10, pm25 } }  오늘은 실측, 내일은 예보 등급의 대표값 */
async function airKorea(lat, lon, today, tomorrow) {
  const station = await nearestStation(lat, lon)
  const [now, forecast] = await Promise.all([
    stationNow(station.name).catch(() => null),
    dustForecast(today).catch(() => null),
  ])
  const region = forecastRegion(station.addr)
  const graded = (date) => {
    const pick = (code) => GRADE_VALUE[code]?.[forecast?.[code]?.[date]?.[region]]
    return { pm10: pick('PM10') ?? null, pm25: pick('PM25') ?? null }
  }
  return {
    [today]: now ?? graded(today),
    [tomorrow]: graded(tomorrow),
  }
}

// 예보 등급 → 그 등급 가운데쯤 농도 (dustGrade가 같은 등급으로 읽도록)
const GRADE_VALUE = {
  PM10: { 좋음: 20, 보통: 50, 나쁨: 100, 매우나쁨: 200 },
  PM25: { 좋음: 10, 보통: 25, 나쁨: 50, 매우나쁨: 100 },
}

async function nearestStation(lat, lon) {
  // 동네가 같으면 측정소도 같으니 오래 기억한다
  const cacheKey = `air-station:${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached
  const { x, y } = toTM(lat, lon)
  const json = await airCall('nearby', { tmX: x.toFixed(1), tmY: y.toFixed(1), ver: '1.1' })
  const first = json.response.body.items[0]
  if (!first) throw new Error('가까운 측정소가 없어요')
  const station = { name: first.stationName, addr: first.addr }
  cacheSet(cacheKey, station, 30 * 24 * 60 * 60 * 1000)
  return station
}

async function stationNow(name) {
  const cacheKey = `air-now:${name}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached
  const json = await airCall('now', {
    stationName: name,
    dataTerm: 'DAILY',
    numOfRows: '3',
    ver: '1.3',
  })
  // 점검 중이면 '-'가 오니 최근 몇 시간 중 값이 있는 것
  const num = (v) => (v != null && v !== '-' && !Number.isNaN(Number(v)) ? Number(v) : null)
  const items = json.response.body.items
  const pm10 = items.map((i) => num(i.pm10Value)).find((v) => v != null) ?? null
  const pm25 = items.map((i) => num(i.pm25Value)).find((v) => v != null) ?? null
  if (pm10 == null && pm25 == null) throw new Error('측정값 없음')
  const result = { pm10, pm25 }
  cacheSet(cacheKey, result, 60 * 60 * 1000) // 한 시간에 한 번 측정
  return result
}

/** { PM10: { 'YYYY-MM-DD': { 서울: '보통', ... } }, PM25: {...} } 최신 발표 기준 */
async function dustForecast(today) {
  const cacheKey = `air-forecast:${today}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached
  const result = {}
  for (const code of ['PM10', 'PM25']) {
    const json = await airCall('forecast', {
      searchDate: today,
      InformCode: code,
      numOfRows: '100',
      ver: '1.1',
    })
    result[code] = {}
    // 최신 발표가 앞에 온다. 날짜마다 처음 나온 것만
    for (const item of json.response.body.items) {
      if (item.informCode !== code || result[code][item.informData]) continue
      result[code][item.informData] = Object.fromEntries(
        item.informGrade.split(',').map((s) => s.split(':').map((t) => t.trim().replace(/\s/g, ''))),
      )
    }
  }
  cacheSet(cacheKey, result, 3 * 60 * 60 * 1000)
  return result
}

// name: 'nearby' 가까운 측정소 · 'now' 실시간 측정 · 'forecast' 예보 (중계 서버 주소 /air/…)
async function airCall(name, params) {
  const query = new URLSearchParams({ returnType: 'json', pageNo: '1', ...params })
  const res = await fetch(`${PROXY}/air/${name}?${query}`)
  if (!res.ok) throw new Error(`에어코리아 ${res.status}`)
  const json = await res.json()
  if (!json.response?.body) throw new Error('에어코리아 응답 오류')
  return json
}

// 측정소 주소 → 예보 권역 이름 (경기·강원은 남북·동서로 나뉜다)
const GYEONGGI_NORTH = ['고양', '파주', '의정부', '양주', '동두천', '포천', '연천', '가평', '남양주', '구리']
const GANGWON_EAST = ['강릉', '동해', '삼척', '속초', '고성', '양양', '태백']

export function forecastRegion(addr = '') {
  const [first = '', second = ''] = addr.split(' ')
  if (first.startsWith('경기')) return GYEONGGI_NORTH.some((c) => second.startsWith(c)) ? '경기북부' : '경기남부'
  if (first.startsWith('강원')) return GANGWON_EAST.some((c) => second.startsWith(c)) ? '영동' : '영서'
  const long = { 충청북: '충북', 충청남: '충남', 전라북: '전북', 전북특: '전북', 전라남: '전남', 경상북: '경북', 경상남: '경남' }
  return long[first.slice(0, 3)] ?? first.slice(0, 2)
}

// 위경도 → TM 중부원점 (에어코리아 근접측정소 조회용, 측정소 찾기엔 수백 m 오차면 충분)
function toTM(lat, lon) {
  const a = 6378137
  const f = 1 / 298.257222101
  const e2 = 2 * f - f * f
  const k0 = 1
  const lat0 = (38 * Math.PI) / 180
  const lon0 = (127 * Math.PI) / 180
  const phi = (lat * Math.PI) / 180
  const lam = (lon * Math.PI) / 180
  const M = (p) =>
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64) * p -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32) * Math.sin(2 * p) +
      ((15 * e2 * e2) / 256) * Math.sin(4 * p))
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2
  const C = (e2 / (1 - e2)) * Math.cos(phi) ** 2
  const A = (lam - lon0) * Math.cos(phi)
  const x = 200000 + k0 * N * (A + ((1 - T + C) * A ** 3) / 6)
  const y = 500000 + k0 * (M(phi) - M(lat0) + N * Math.tan(phi) * (A ** 2 / 2 + ((5 - T + 9 * C) * A ** 4) / 24))
  return { x, y }
}

// ---- Open-Meteo: 자외선 (기상청 단기예보에 없음) ----

async function openMeteoUv(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: 'Asia/Seoul',
    forecast_days: '2',
    hourly: 'uv_index',
  })
  const res = await fetch(`${OPEN_METEO_URL}?${params}`)
  if (!res.ok) throw new Error('자외선')
  const { hourly } = await res.json()
  return Object.fromEntries(hourly.time.map((t, i) => [t, hourly.uv_index[i] ?? 0]))
}

// ---------- 대신 쓰는 Open-Meteo (기상청을 못 불러올 때) ----------

async function fetchOpenMeteo({ lat, lon }) {
  const common = {
    latitude: lat,
    longitude: lon,
    timezone: 'Asia/Seoul',
    forecast_days: '2',
  }
  const forecastParams = new URLSearchParams({
    ...common,
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,uv_index',
    daily: 'temperature_2m_max,temperature_2m_min',
    wind_speed_unit: 'ms',
  })
  const airParams = new URLSearchParams({ ...common, hourly: 'pm10,pm2_5' })

  const [forecast, air] = await Promise.all([
    fetch(`${OPEN_METEO_URL}?${forecastParams}`).then((r) => {
      if (!r.ok) throw new Error('날씨 정보를 불러오지 못했어요.')
      return r.json()
    }),
    // 미세먼지는 실패해도 앱은 동작하게
    fetch(`${OPEN_METEO_AIR_URL}?${airParams}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])

  return normalizeOpenMeteo(forecast, air)
}

function normalizeOpenMeteo(forecast, air) {
  const h = forecast.hourly
  const airByTime = {}
  if (air?.hourly) {
    air.hourly.time.forEach((t, i) => {
      airByTime[t] = { pm10: air.hourly.pm10[i], pm25: air.hourly.pm2_5[i] }
    })
  }

  const days = forecast.daily.time.map((date, i) => ({
    date,
    max: forecast.daily.temperature_2m_max[i],
    min: forecast.daily.temperature_2m_min[i],
    hours: [],
  }))

  h.time.forEach((t, i) => {
    const day = days.find((d) => t.startsWith(d.date))
    if (!day) return
    day.hours.push({
      hour: Number(t.slice(11, 13)),
      temp: h.temperature_2m[i],
      feels: h.apparent_temperature[i],
      rainProb: h.precipitation_probability[i] ?? 0,
      code: h.weather_code[i],
      wind: h.wind_speed_10m[i],
      uv: h.uv_index[i] ?? 0,
      pm10: airByTime[t]?.pm10 ?? null,
      pm25: airByTime[t]?.pm25 ?? null,
    })
  })

  return days
}

// ---------- 공통 ----------

// 한국 시각을 UTC 필드에 담은 Date (기기 시간대와 상관없이 getUTC*로 한국 날짜·시각)
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// 같은 발표·측정을 여러 번 부르지 않게 (공공데이터 일일 트래픽 제한)
function cacheGet(key) {
  try {
    const item = JSON.parse(localStorage.getItem(`weather-cache:${key}`))
    if (item && item.until > Date.now()) return item.value
  } catch {
    // 저장소를 못 쓰면 매번 새로
  }
  return null
}

function cacheSet(key, value, ms) {
  try {
    // 오래된 캐시는 정리 (발표마다 키가 달라 쌓이므로)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith('weather-cache:')) continue
      const old = JSON.parse(localStorage.getItem(k))
      if (!old || old.until <= Date.now()) localStorage.removeItem(k)
    }
    localStorage.setItem(`weather-cache:${key}`, JSON.stringify({ value, until: Date.now() + ms }))
  } catch {
    // 저장 공간이 꽉 차도 앱은 동작
  }
}

// WMO 날씨 코드 → 이모지 + 설명
export function describeWeather(code) {
  if (code === 0) return { emoji: '☀️', text: '맑음' }
  if (code <= 2) return { emoji: '🌤️', text: '구름 조금' }
  if (code === 3) return { emoji: '☁️', text: '흐림' }
  if (code <= 48) return { emoji: '🌫️', text: '안개' }
  if (code <= 57) return { emoji: '🌦️', text: '이슬비' }
  if (code <= 67) return { emoji: '🌧️', text: '비' }
  if (code <= 77) return { emoji: '🌨️', text: '눈' }
  if (code <= 82) return { emoji: '🌧️', text: '소나기' }
  if (code <= 86) return { emoji: '🌨️', text: '눈' }
  return { emoji: '⛈️', text: '뇌우' }
}

// 한국 환경부 기준 미세먼지 등급
export function dustGrade(pm10, pm25) {
  if (pm10 == null && pm25 == null) return null
  const g10 = pm10 == null ? 0 : pm10 <= 30 ? 0 : pm10 <= 80 ? 1 : pm10 <= 150 ? 2 : 3
  const g25 = pm25 == null ? 0 : pm25 <= 15 ? 0 : pm25 <= 35 ? 1 : pm25 <= 75 ? 2 : 3
  const level = Math.max(g10, g25)
  return { level, text: ['좋음', '보통', '나쁨', '매우 나쁨'][level] }
}
