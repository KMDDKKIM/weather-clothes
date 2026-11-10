import { RATINGS, WHENS } from './lib/feedback.js'

/**
 * 오늘 옷차림 피드백 카드
 * @param entry     오늘 남긴 피드백 (없으면 undefined)
 * @param onChange  (entry | null) => void   null이면 오늘 피드백 삭제
 * @param hint      버튼 아래 안내 문구 (프로필마다 다르다)
 * @param whens     "언제 추웠나요?" 선택지 (아이: 등·하원 때 / 나: 오갈 때)
 */
export default function FeedbackCard({ entry, onChange, hint, whens = WHENS }) {
  const rate = (rating) => onChange({ rating, when: null })
  const setWhen = (when) => onChange({ ...entry, when })

  if (!entry) {
    return (
      <section className="card feedback">
        <h2>오늘 옷차림 어땠어요?</h2>
        <div className="rating-buttons">
          {Object.entries(RATINGS).map(([key, { emoji, label }]) => (
            <button key={key} className="rating" onClick={() => rate(key)}>
              <span className="rating-emoji">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">{hint}</p>
      </section>
    )
  }

  const { emoji, label } = RATINGS[entry.rating]
  const askWhen = entry.rating !== 'good'

  return (
    <section className="card feedback">
      <p className="feedback-done">
        <span className="rating-emoji">{emoji}</span>
        <span>
          오늘은 <strong>{label}</strong>
        </span>
        <button className="link-btn" onClick={() => onChange(null)}>
          다시 고르기
        </button>
      </p>

      {askWhen && (
        <div className="when">
          <span className="when-label">언제 {entry.rating === 'cold' ? '추웠나요' : '더웠나요'}?</span>
          <div className="chips">
            {Object.entries(whens).map(([key, text]) => (
              <button
                key={key}
                className={`chip ${entry.when === key ? 'on' : ''}`}
                onClick={() => setWhen(entry.when === key ? null : key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="hint thanks">
        {entry.rating === 'good' ? '좋아요! 지금 기준을 유지할게요.' : '고마워요! 다음 추천부터 반영할게요.'}
      </p>
    </section>
  )
}
