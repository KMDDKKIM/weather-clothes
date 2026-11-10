import { useEffect, useMemo, useState } from 'react'
import { fetchWeather, describeWeather } from './lib/weather.js'
import { PROFILES, timeToHour } from './lib/profiles.js'
import ColorPage from './ColorPage.jsx'
import FeedbackCard from './FeedbackCard.jsx'
import PlaceSearch from './PlaceSearch.jsx'
import InstallBanner from './InstallBanner.jsx'
import { placeNameAt } from './lib/geocode.js'
import { loadFeedback, saveFeedback, learnedAdjust, describeAdjust } from './lib/feedback.js'
import { hourOf, joinDays } from './lib/outing.js'

// 아이 설정은 예전처럼 맨 바깥에 (이미 쓰던 사람 설정이 그대로 이어지게), '나' 설정은 me 안에
const DEFAULT_SETTINGS = {
  ...PROFILES.kid.defaults,
  lat: 37.5665,
  lon: 126.978,
  placeName: '서울',
  profile: 'kid', // 'kid' | 'me'
  me: PROFILES.me.defaults,
}

const STORAGE_KEY = 'weather-clothes-settings'

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return { ...DEFAULT_SETTINGS, ...saved, me: { ...DEFAULT_SETTINGS.me, ...saved?.me } }
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

// 지금 보는 프로필(아이 / 나)과 그 프로필의 설정
function profileOf(settings) {
  const key = settings.profile in PROFILES ? settings.profile : 'kid'
  return { key, profile: PROFILES[key], ps: key === 'kid' ? settings : settings.me }
}

// 하원(집에 들어오는) 시간이 지났는지
function isAfterBack(back, now = new Date()) {
  return hourOf(now) >= timeToHour(back)
}

// 하원(집에 들어오는) 시간이 지났으면 내일 옷을 준비할 시간
function defaultDayIndex(settings) {
  const { profile, ps } = profileOf(settings)
  return isAfterBack(ps[profile.backKey]) ? 1 : 0
}

// '2026-11-03' → '11/3 (화)'
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = '일월화수목금토'[new Date(y, m - 1, d).getDay()]
  return `${m}/${d} (${weekday})`
}

// 스토어 앱에서는 앱 안에 열리면 돌아갈 버튼이 없으니 인터넷 주소로 (휴대폰 브라우저에서 열림)
const PRIVACY_URL =
  import.meta.env.MODE === 'app'
    ? 'https://kmddkkim.github.io/weather-clothes/privacy.html'
    : `${import.meta.env.BASE_URL}privacy.html`

// 앱을 30분 넘게 안 보다가 다시 열면 지금 시각 기준으로 처음부터 (날씨도 새로)
const STALE_MS = 30 * 60 * 1000

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [dayIndex, setDayIndex] = useState(() => defaultDayIndex(loadSettings()))
  const [now, setNow] = useState(() => new Date())
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState('weather') // 'weather' | 'colors'
  const [days, setDays] = useState(null)
  const [error, setError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [locating, setLocating] = useState(false)
  // 피드백은 프로필마다 따로 (아이가 추웠다고 내 옷까지 두꺼워지면 안 되니까)
  const [feedbacks, setFeedbacks] = useState(() => ({
    kid: loadFeedback(PROFILES.kid.feedbackKey),
    me: loadFeedback(PROFILES.me.feedbackKey),
  }))

  const { key: profileKey, profile, ps } = profileOf(settings)
  const feedback = feedbacks[profileKey]
  const backSetting = ps[profile.backKey]

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    for (const key of Object.keys(PROFILES)) saveFeedback(feedbacks[key], PROFILES[key].feedbackKey)
  }, [feedbacks])

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchWeather({ lat: settings.lat, lon: settings.lon })
      .then((d) => !cancelled && setDays(d))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [settings.lat, settings.lon, refreshKey])

  // 지금 시각은 1분마다, 그리고 앱으로 돌아올 때 새로 잰다
  useEffect(() => {
    let hiddenAt = null
    const tick = () => setNow(new Date())
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      tick()
      if (hiddenAt && Date.now() - hiddenAt > STALE_MS) {
        setDayIndex(isAfterBack(backSetting) ? 1 : 0)
        setRefreshKey((k) => k + 1)
      }
      hiddenAt = null
    }
    const timer = setInterval(tick, 60 * 1000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [backSetting])

  // '지금'과 '내일'의 나갈·들어올 시간 (프로필마다 규칙이 다르다: profiles.js)
  const opts = useMemo(
    () => (dayIndex === 0 ? profile.nowOpts(now, ps) : profile.tomorrowOpts(now, ps)),
    [profile, ps, dayIndex, now],
  )
  const leaveAt = opts[profile.leaveKey]

  const day = days?.[dayIndex]
  // '지금' 탭은 자정을 넘는 외출도 있으니 내일 날씨까지 이어 본다
  const planDay = useMemo(() => (day && dayIndex === 0 ? joinDays(days[0], days[1]) : day), [days, day, dayIndex])
  // 그날보다 이전 피드백만 반영 (오늘 남긴 피드백은 내일 추천부터)
  const adjust = useMemo(() => {
    if (!day) return { peak: 0, cold: 0 }
    return learnedAdjust(Object.fromEntries(Object.entries(feedback).filter(([date]) => date < day.date)))
  }, [day, feedback])
  const plan = useMemo(
    () => (planDay ? profile.buildPlan(planDay, opts, adjust) : null),
    // opts는 1분마다 새로 만들어지니, 실제 시간이 바뀔 때만 다시 계산
    [planDay, profile, ps, adjust, opts.mode, leaveAt, opts[profile.backKey]],
  )
  // 저녁(밤)늦게 들어오면 옷이 달라지는지 ('지금' 탭만)
  const late = useMemo(() => {
    const lateOpts = plan && dayIndex === 0 ? profile.lateOpts(opts) : null
    return lateOpts ? profile.lateNote(plan, profile.buildPlan(planDay, lateOpts, adjust)) : null
  }, [plan]) // plan이 바뀔 때만 다시 (나머지 값은 plan을 만든 값과 같다)
  const notes = plan ? profile.notes(plan, late) : []
  // 지금 막 나가는 거면 시간 대신 '지금'
  const leavingNow = dayIndex === 0 && leaveAt > timeToHour(ps[profile.leaveKey])
  // 저녁 외출처럼 나갈 때·들어올 때가 가장 따뜻하면 같은 카드가 두 번 나오니 뺀다
  const moments = (plan?.moments ?? []).filter((m, _, [leave, , back]) => {
    return m.key !== 'peak' || (m.time !== leave.time && m.time !== back.time)
  })

  const today = days?.[0]
  const todayPlan = useMemo(() => (today ? profile.buildPlan(today, ps) : null), [today, profile, ps])
  const afterBack = isAfterBack(backSetting, now)
  const adjustText = describeAdjust(learnedAdjust(feedback), profile.commuteLabel)

  const setFeedback = (next) => setFeedbacks((all) => ({ ...all, [profileKey]: next(all[profileKey]) }))

  const setTodayFeedback = (entry) => {
    setFeedback((log) => {
      const next = { ...log }
      if (entry) {
        // 그날 날씨도 함께 기록 (나중에 분석용)
        const [, peak, backMoment] = todayPlan?.moments ?? []
        next[today.date] = { ...entry, peakFeels: peak?.feels, coldFeels: backMoment?.feels }
      } else {
        delete next[today.date]
      }
      return next
    })
  }

  const feedbackCard = today && (
    <FeedbackCard
      entry={feedback[today.date]}
      onChange={setTodayFeedback}
      hint={profile.feedbackHint(!afterBack)}
      whens={profile.whens}
    />
  )

  // 카테고리별로 보여줄 옷. 내복(발열 내의)은 입을 수도 있는 날에만 보여준다
  const wardrobe = plan
    ? Object.keys(profile.CATEGORIES)
        .map((category) => {
          const options = plan.pieces[category]
          if (category !== 'innerwear') return { category, label: profile.CATEGORIES[category].label, options }
          const innerwear = options.filter((o) => o.id === 'innerwear')
          if (!innerwear.length) return null
          const [sure, maybe] = profile.innerwearLabels
          return { category, label: plan.outfit.innerwear ? sure : maybe, options: innerwear }
        })
        .filter(Boolean)
    : []

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }))
  // 지금 프로필의 설정만 바꾼다 (아이는 맨 바깥, 나는 me 안)
  const updateProfile = (patch) =>
    setSettings((s) => (profileKey === 'kid' ? { ...s, ...patch } : { ...s, me: { ...s.me, ...patch } }))
  // 시간 입력을 지우는 중이거나 들어올 시간이 나갈 시간보다 빠르면 반영하지 않음
  const updateTime = (key, value) => {
    if (!value) return
    const next = { ...ps, [key]: value }
    if (timeToHour(next[profile.backKey]) <= timeToHour(next[profile.leaveKey])) return
    updateProfile({ [key]: value })
  }

  const switchProfile = (key) => {
    if (key === profileKey) return
    const next = { ...settings, profile: key }
    setSettings(next)
    setDayIndex(defaultDayIndex(next))
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('이 브라우저는 위치 기능을 지원하지 않아요.')
    setLocating(true)
    const found = async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords
      update({ lat, lon, placeName: '현재 위치' })
      setLocating(false)
      // 동네 이름을 찾으면 '현재 위치' 대신 표시
      const name = await placeNameAt(lat, lon)
      if (name) update({ placeName: name })
    }
    const failed = (err) => {
      setError(
        err.code === err.PERMISSION_DENIED
          ? '위치 권한이 꺼져 있어요. 휴대폰 설정에서 허용하거나, 동네 이름으로 검색해주세요.'
          : '위치를 찾지 못했어요. 잠시 후 다시 누르거나, 동네 이름으로 검색해주세요.',
      )
      setLocating(false)
    }
    // 날씨엔 대략적인 위치(와이파이·기지국)로 충분해서 먼저 그걸로 빨리 찾고,
    // 못 찾으면(실내 등) GPS로 한 번 더. 10분 안에 잡은 위치는 그대로 쓴다
    navigator.geolocation.getCurrentPosition(
      found,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return failed(err)
        navigator.geolocation.getCurrentPosition(found, failed, { enableHighAccuracy: true, timeout: 15 * 1000 })
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 8 * 1000 },
    )
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>{profile.title}</h1>
          <button className="place" onClick={() => setShowSettings(true)}>
            📍 {settings.placeName} <span className="place-change">변경</span>
          </button>
        </div>
        <button className="icon-btn" onClick={() => setShowSettings((v) => !v)} aria-label="설정">
          ⚙️
        </button>
      </header>

      {/* 누구 옷을 볼지 */}
      <div className="profiles" role="tablist" aria-label="누구 옷">
        {Object.entries(PROFILES).map(([key, p]) => (
          <button
            key={key}
            role="tab"
            aria-selected={profileKey === key}
            className={`profile ${profileKey === key ? 'on' : ''}`}
            onClick={() => switchProfile(key)}
          >
            {p.tab}
          </button>
        ))}
      </div>

      {/* 스토어 앱(--mode app)은 이미 설치된 앱이라 설치 안내가 필요 없다 */}
      {import.meta.env.MODE !== 'app' && <InstallBanner />}

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
          <p className="settings-for">{profile.tab} 설정</p>
          {[profile.leaveKey, profile.backKey].map((key) => (
            <label key={key}>
              {profile.timeLabels[key]}
              <input type="time" value={ps[key]} onChange={(e) => updateTime(key, e.target.value)} />
            </label>
          ))}
          {profile.GENDERS && (
            <div className="field">
              <span>{profile.genderLabel}</span>
              <div className="chips">
                {Object.entries(profile.GENDERS).map(([key, { label }]) => (
                  <button
                    key={key}
                    className={`chip ${ps.gender === key ? 'on' : ''}`}
                    onClick={() => updateProfile({ gender: key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <span>{profile.sensitivityLabel}</span>
            <div className="chips">
              {Object.entries(profile.SENSITIVITY).map(([key, { label }]) => (
                <button
                  key={key}
                  className={`chip ${ps.sensitivity === key ? 'on' : ''}`}
                  onClick={() => updateProfile({ sensitivity: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {adjustText && (
            <div className="adjust">
              <span>💬 피드백 반영: {adjustText}</span>
              <button className="link-btn" onClick={() => setFeedback(() => ({}))}>
                초기화
              </button>
            </div>
          )}
          <button className="done-btn" onClick={() => setShowSettings(false)}>
            완료
          </button>
        </section>
      )}

      <div className="tabs">
        {['지금', '내일'].map((label, i) => (
          <button
            key={label}
            className={`tab ${page === 'weather' && dayIndex === i ? 'on' : ''}`}
            onClick={() => {
              setDayIndex(i)
              setPage('weather')
            }}
          >
            {label}
            {days?.[i] && <span className="tab-date">{shortDate(days[i].date)}</span>}
          </button>
        ))}
        <button className={`tab ${page === 'colors' ? 'on' : ''}`} onClick={() => setPage('colors')}>
          🎨 색 조합
        </button>
      </div>

      {page === 'colors' && (
        <ColorPage
          key={profileKey}
          plan={plan}
          dayLabel={dayIndex === 0 ? '지금' : '내일'}
          profile={profile}
          tone={ps.tone}
          onTone={(tone) => updateProfile({ tone })}
          shopPrefix={profile.shopPrefix(ps)}
        />
      )}

      {page === 'weather' && error && <p className="error">{error}</p>}
      {page === 'weather' && !plan && !error && <p className="loading">날씨를 살펴보는 중…</p>}

      {page === 'weather' && plan && (
        <>
          {/* 하원(집에 들어온) 후 내일 탭을 볼 때 오늘 피드백을 먼저 묻는다 */}
          {dayIndex === 1 && afterBack && today && !feedback[today.date] && feedbackCard}

          <section className="card hero">
            <p className="headline">{plan.headline}</p>
            <div className="wardrobe">
              {wardrobe.map(({ category, label, options }) => {
                // 가장 잘 맞는 옷은 그림과 함께 크게, 나머지는 대안으로 작게
                const [best, ...others] = options
                return (
                  <div key={category} className="wardrobe-row">
                    <span className="wardrobe-emoji">{best.emoji}</span>
                    <div className="wardrobe-main">
                      <span className="wardrobe-label">{label}</span>
                      <strong className="wardrobe-pick">{best.name}</strong>
                      {others.length > 0 && (
                        <span className="wardrobe-alt">또는 {others.map((o) => o.name).join(', ')}도 괜찮아요</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="moments" style={{ gridTemplateColumns: `repeat(${moments.length}, 1fr)` }}>
            {moments.map((m, i) => (
              <div key={m.key} className={`moment ${m.key}`}>
                <span className="m-label">{m.label}</span>
                <span className="m-time">{leavingNow && i === 0 ? '지금' : m.timeText}</span>
                <span className="m-emoji">{m.weather.emoji}</span>
                <span className="m-temp">{m.temp}°</span>
                <span className="m-feels">체감 {m.feels}°</span>
                {/* 초속 5m부터는 춥게 느낄 만큼 세다 (바람막이 추천 기준과 같음) */}
                <span className={`m-wind ${m.wind >= 5 ? 'strong' : ''}`}>
                  💨 {m.wind}m/s{m.wind >= 5 && ' 강함'}
                </span>
              </div>
            ))}
          </section>

          {/* 아이: 엄마의 걱정(덥지 않을까? 춥지 않을까?)에 한 줄씩 / 나: 평소와 다른 날에만 한 줄 팁 */}
          {notes.length > 0 && (
            <section className="card tips">
              {notes.map((t) => (
                <p key={t.text} className="tip">
                  <span className="tip-emoji">{t.emoji}</span>
                  <span>{t.text}</span>
                </p>
              ))}
            </section>
          )}

          {plan.items.length > 0 && (
            <section className="card">
              <h2>{profile.itemsTitle}</h2>
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
            <h2>{plan.stayLabel}</h2>
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
        날씨 데이터: <a href="https://open-meteo.com/">Open-Meteo.com</a> ·{' '}
        <a href={PRIVACY_URL}>개인정보처리방침</a>
      </footer>
    </div>
  )
}

// 옆으로 밀지 않고 한 화면에. 12시간이 넘으면 2시간 간격 (마지막 시간은 항상 포함)
function Timeline({ hours: all }) {
  const hours = all.length > 12 ? all.filter((_, i) => i % 2 === 0 || i === all.length - 1) : all
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
            <span className="t-hour">{h.hour % 24}시</span>
            {h.rainProb >= 30 && <span className="t-rain">{h.rainProb}%</span>}
          </div>
        )
      })}
    </div>
  )
}
