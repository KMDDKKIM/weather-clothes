import { useEffect, useMemo, useState } from 'react'
import { fetchWeather, describeWeather } from './lib/weather.js'
import { buildPlan, timeToHour, SENSITIVITY } from './lib/outfit.js'
import { CATEGORIES } from './lib/clothes.js'
import ColorPage from './ColorPage.jsx'
import FeedbackCard from './FeedbackCard.jsx'
import PlaceSearch from './PlaceSearch.jsx'
import { placeNameAt } from './lib/geocode.js'
import { loadFeedback, saveFeedback, learnedAdjust, describeAdjust } from './lib/feedback.js'

const DEFAULT_SETTINGS = {
  dropoff: '08:30',
  pickup: '16:00',
  sensitivity: 'normal',
  tone: 'unknown',
  lat: 37.5665,
  lon: 126.978,
  placeName: '서울',
}

const STORAGE_KEY = 'weather-clothes-settings'

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 저장 실패해도 앱은 동작
  }
}

function isAfterPickup(pickup) {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60 >= timeToHour(pickup)
}

// 하원 시간이 지났으면 내일 옷을 준비할 시간
function defaultDayIndex(pickup) {
  return isAfterPickup(pickup) ? 1 : 0
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [dayIndex, setDayIndex] = useState(() => defaultDayIndex(loadSettings().pickup))
  const [page, setPage] = useState('weather') // 'weather' | 'colors'
  const [days, setDays] = useState(null)
  const [error, setError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [locating, setLocating] = useState(false)
  const [feedback, setFeedback] = useState(loadFeedback)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveFeedback(feedback)
  }, [feedback])

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchWeather({ lat: settings.lat, lon: settings.lon })
      .then((d) => !cancelled && setDays(d))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [settings.lat, settings.lon])

  const day = days?.[dayIndex]
  // 그날보다 이전 피드백만 반영 (오늘 남긴 피드백은 내일 추천부터)
  const adjust = useMemo(() => {
    if (!day) return { peak: 0, cold: 0 }
    return learnedAdjust(Object.fromEntries(Object.entries(feedback).filter(([date]) => date < day.date)))
  }, [day, feedback])
  const plan = useMemo(() => (day ? buildPlan(day, settings, adjust) : null), [day, settings, adjust])

  const today = days?.[0]
  const todayPlan = useMemo(() => (today ? buildPlan(today, settings) : null), [today, settings])
  const afterPickup = isAfterPickup(settings.pickup)
  const adjustText = describeAdjust(learnedAdjust(feedback))

  const setTodayFeedback = (entry) => {
    setFeedback((log) => {
      const next = { ...log }
      if (entry) {
        // 그날 날씨도 함께 기록 (나중에 분석용)
        const [, peak, pickupMoment] = todayPlan?.moments ?? []
        next[today.date] = { ...entry, peakFeels: peak?.feels, coldFeels: pickupMoment?.feels }
      } else {
        delete next[today.date]
      }
      return next
    })
  }

  const feedbackCard = today && (
    <FeedbackCard entry={feedback[today.date]} onChange={setTodayFeedback} beforePickup={!afterPickup} />
  )

  // 카테고리별로 보여줄 옷. 내복은 입을 수도 있는 날에만 보여준다
  const wardrobe = plan
    ? Object.keys(CATEGORIES)
        .map((category) => {
          const options = plan.pieces[category]
          if (category !== 'innerwear') return { category, label: CATEGORIES[category].label, options }
          const innerwear = options.filter((o) => o.id === 'innerwear')
          if (!innerwear.length) return null
          return { category, label: plan.outfit.innerwear ? '내복' : '내복 (추위 타면)', options: innerwear }
        })
        .filter(Boolean)
    : []

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }))
  // 시간 입력을 지우는 중이거나 하원이 등원보다 빠르면 반영하지 않음
  const updateTime = (key, value) => {
    if (!value) return
    const next = { ...settings, [key]: value }
    if (timeToHour(next.pickup) <= timeToHour(next.dropoff)) return
    update({ [key]: value })
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('이 브라우저는 위치 기능을 지원하지 않아요.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords
        update({ lat, lon, placeName: '현재 위치' })
        setLocating(false)
        // 동네 이름을 찾으면 '현재 위치' 대신 표시
        const name = await placeNameAt(lat, lon)
        if (name) update({ placeName: name })
      },
      () => {
        setError('위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해주세요.')
        setLocating(false)
      },
    )
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>오늘 뭐 입혀?</h1>
          <button className="place" onClick={() => setShowSettings(true)}>
            📍 {settings.placeName} <span className="place-change">변경</span>
          </button>
        </div>
        <button className="icon-btn" onClick={() => setShowSettings((v) => !v)} aria-label="설정">
          ⚙️
        </button>
      </header>

      {showSettings && (
        <section className="card settings">
          <div className="field">
            <span>
              동네 <span className="current-place">지금: {settings.placeName}</span>
            </span>
            <PlaceSearch
              onSelect={({ name, lat, lon }) => update({ lat, lon, placeName: name })}
            />
            <button className="loc-btn" onClick={useMyLocation} disabled={locating}>
              {locating ? '위치 찾는 중…' : '📍 현재 위치로 설정'}
            </button>
          </div>
          <label>
            등원 시간
            <input type="time" value={settings.dropoff} onChange={(e) => updateTime('dropoff', e.target.value)} />
          </label>
          <label>
            하원 시간
            <input type="time" value={settings.pickup} onChange={(e) => updateTime('pickup', e.target.value)} />
          </label>
          <div className="field">
            <span>우리 아이는</span>
            <div className="chips">
              {Object.entries(SENSITIVITY).map(([key, { label }]) => (
                <button
                  key={key}
                  className={`chip ${settings.sensitivity === key ? 'on' : ''}`}
                  onClick={() => update({ sensitivity: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {adjustText && (
            <div className="adjust">
              <span>💬 피드백 반영: {adjustText}</span>
              <button className="link-btn" onClick={() => setFeedback({})}>
                초기화
              </button>
            </div>
          )}
        </section>
      )}

      <div className="tabs">
        {['오늘', '내일'].map((label, i) => (
          <button
            key={label}
            className={`tab ${page === 'weather' && dayIndex === i ? 'on' : ''}`}
            onClick={() => {
              setDayIndex(i)
              setPage('weather')
            }}
          >
            {label}
          </button>
        ))}
        <button className={`tab ${page === 'colors' ? 'on' : ''}`} onClick={() => setPage('colors')}>
          🎨 색 조합
        </button>
      </div>

      {page === 'colors' && (
        <ColorPage
          plan={plan}
          dayLabel={dayIndex === 0 ? '오늘' : '내일'}
          tone={settings.tone}
          onTone={(tone) => update({ tone })}
        />
      )}

      {page === 'weather' && error && <p className="error">{error}</p>}
      {page === 'weather' && !plan && !error && <p className="loading">날씨를 살펴보는 중…</p>}

      {page === 'weather' && plan && (
        <>
          {/* 하원 후 내일 탭을 보는 엄마에게 오늘 피드백을 먼저 묻는다 */}
          {dayIndex === 1 && afterPickup && today && !feedback[today.date] && feedbackCard}

          <section className="card hero">
            <p className="headline">{plan.headline}</p>
            <div className="wardrobe">
              {wardrobe.map(({ category, label, options }) => (
                <div key={category} className="wardrobe-row">
                  <span className="wardrobe-label">
                    <span className="wardrobe-emoji">{options[0].emoji}</span>
                    {label}
                  </span>
                  <div className="tags">
                    {options.map((o) => (
                      <span key={o.id} className="tag">
                        {o.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="moments">
            {plan.moments.map((m) => (
              <div key={m.key} className={`moment ${m.key}`}>
                <span className="m-label">{m.label}</span>
                <span className="m-time">{m.timeText}</span>
                <span className="m-emoji">{m.weather.emoji}</span>
                <span className="m-temp">{m.temp}°</span>
                <span className="m-feels">체감 {m.feels}°</span>
              </div>
            ))}
          </section>

          <section className="worries">
            {plan.worries.map((w) => (
              <div key={w.q} className="card worry">
                <p className="q">
                  {w.emoji} {w.q}
                </p>
                <p className="a">{w.a}</p>
              </div>
            ))}
          </section>

          {plan.items.length > 0 && (
            <section className="card">
              <h2>챙겨주세요</h2>
              <ul className="items">
                {plan.items.map((it) => (
                  <li key={it.label}>
                    <span className="item-emoji">{it.emoji}</span>
                    <div>
                      <strong>{it.label}</strong>
                      <span className="reason">{it.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>원에 있는 동안</h2>
            <Timeline hours={plan.stayHours} />
            <p className="daily">
              하루 최저 {Math.round(day.min)}° · 최고 {Math.round(day.max)}°
              {plan.dust && ` · 미세먼지 ${plan.dust.text}`}
            </p>
          </section>

          {dayIndex === 0 && feedbackCard}
        </>
      )}

      <footer>
        날씨 데이터: <a href="https://open-meteo.com/">Open-Meteo.com</a>
      </footer>
    </div>
  )
}

function Timeline({ hours }) {
  const temps = hours.map((h) => h.temp)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  return (
    <div className="timeline">
      {hours.map((h) => {
        const ratio = hi === lo ? 0.5 : (h.temp - lo) / (hi - lo)
        return (
          <div key={h.hour} className="t-col">
            <span className="t-temp">{Math.round(h.temp)}°</span>
            <div className="t-bar-wrap">
              <div className="t-bar" style={{ height: `${20 + ratio * 80}%` }} />
            </div>
            <span className="t-emoji">{describeWeather(h.code).emoji}</span>
            <span className="t-hour">{h.hour}시</span>
            {h.rainProb >= 30 && <span className="t-rain">{h.rainProb}%</span>}
          </div>
        )
      })}
    </div>
  )
}
