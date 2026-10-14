import { forwardRef, useEffect, useRef, useState } from 'react'
import { TOP_COLORS, BOTTOM_COLORS, MATCH_TYPES, TONES, matchesFor, suitsTone } from './lib/colors.js'
import { shopLinks } from './lib/shop.js'

// 조합 종류마다 최대 몇 개까지 보여줄지
const MAX_PER_GROUP = 6

const SIDES = {
  top: { label: '상의', other: 'bottom' },
  bottom: { label: '하의', other: 'top' },
}

/**
 * @param plan    선택된 날의 날씨 plan. 쇼핑 검색어에 오늘 맞는 옷 종류를 넣는 데 쓴다.
 * @param tone    아이 톤 ('unknown' | 'warm' | 'cool')
 * @param onTone  톤 변경
 */
export default function ColorPage({ plan, dayLabel, tone, onTone }) {
  const [side, setSide] = useState('top')
  const [selectedId, setSelectedId] = useState(null)
  const [pickId, setPickId] = useState(null) // 결과 중 크게 볼 조합 (반대쪽 색 id)
  const resultRef = useRef(null)
  const detailRef = useRef(null)

  // 색을 고르면 결과가 보이도록 스크롤
  useEffect(() => {
    if (selectedId) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedId, side])

  const palette = side === 'top' ? TOP_COLORS : BOTTOM_COLORS
  const selected = palette.find((c) => c.id === selectedId)
  const matches = selected ? matchesFor(side, selected.id, tone) : []
  // 상의 색에만 톤 표시
  const sparkle = (category, id) => category === 'top' && suitsTone(tone, id)
  const other = SIDES[side].other
  // 아무것도 안 눌렀으면 맨 앞(베스트 1순위) 조합을 크게
  const picked = matches.find((m) => m.color.id === pickId) ?? matches[0]

  const choosePick = (id) => {
    setPickId(id)
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const itemNames = (category) => plan?.pieces[category].map((o) => o.name) ?? [SIDES[category].label]

  const switchSide = (next) => {
    setSide(next)
    setSelectedId(null)
    setPickId(null)
  }

  const chooseColor = (id) => {
    setSelectedId(id)
    setPickId(null)
  }

  // 오늘의 추천 조합을 누르면 그 상의 색으로 바로 찾기
  const pickToday = (topId) => {
    setSide('top')
    chooseColor(topId)
  }

  return (
    <div className="color-page">
      {plan && (
        <section className="card">
          <h2>{dayLabel} 날씨 추천 조합</h2>
          <div className="color-pairs">
            {plan.colors.pairs.map(({ top, bottom }) => (
              <button key={top.id + bottom.id} className="color-pair" onClick={() => pickToday(top.id)}>
                <span className="swatch" style={{ background: top.hex }} />
                <span className="swatch" style={{ background: bottom.hex }} />
                <span className="color-name">
                  {top.name}+{bottom.name}
                </span>
              </button>
            ))}
          </div>
          <p className="color-reason">🎨 {plan.colors.reason}</p>
        </section>
      )}

      <section className="card">
        <div className="tone-row">
          <span className="tone-label">우리 아이 톤</span>
          <div className="chips">
            {Object.entries(TONES).map(([key, { label }]) => (
              <button key={key} className={`chip ${tone === key ? 'on' : ''}`} onClick={() => onTone(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {tone !== 'unknown' && <p className="hint">✨ 표시는 {TONES[tone].label}에 잘 어울리는 상의 색이에요.</p>}
      </section>

      <section className="card">
        <div className="segment">
          {Object.entries(SIDES).map(([key, { label }]) => (
            <button key={key} className={side === key ? 'on' : ''} onClick={() => switchSide(key)}>
              {label} 색으로 찾기
            </button>
          ))}
        </div>
        <p className="hint">아이가 입을 {SIDES[side].label} 색을 골라주세요.</p>
        <div className="palette">
          {palette.map((c) => (
            <button
              key={c.id}
              className={`palette-item ${selectedId === c.id ? 'on' : ''}`}
              onClick={() => chooseColor(c.id)}
            >
              <span className="swatch big-swatch" style={{ background: c.hex }} />
              <span>
                {sparkle(side, c.id) && '✨'}
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="card" ref={resultRef}>
          <h2>
            {selected.name} {SIDES[side].label}에 어울리는 {SIDES[other].label}
          </h2>
          {picked && (
            <ComboDetail
              ref={detailRef}
              top={side === 'top' ? selected : picked.color}
              bottom={side === 'top' ? picked.color : selected}
              type={picked.type}
              topItems={itemNames('top')}
              bottomItems={itemNames('bottom')}
            />
          )}

          {Object.entries(MATCH_TYPES).map(([type, { label, reason }]) => {
            const group = matches.filter((m) => m.type === type).slice(0, MAX_PER_GROUP)
            if (!group.length) return null
            return (
              <div key={type} className="match-group">
                <p className="group-head">
                  <span className={`badge ${type}`}>{label}</span>
                  <span className="match-reason">{reason}</span>
                </p>
                <div className="match-grid">
                  {group.map(({ color }) => {
                    const top = side === 'top' ? selected : color
                    const bottom = side === 'top' ? color : selected
                    return (
                      <button
                        key={color.id}
                        className={`match-card ${type} ${picked?.color.id === color.id ? 'on' : ''}`}
                        onClick={() => choosePick(color.id)}
                      >
                        <OutfitPreview top={top.hex} bottom={bottom.hex} />
                        <strong>
                          {sparkle(other, color.id) && '✨'}
                          {color.name}
                        </strong>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

// 고른 조합을 크게 보여주고, 그 색 옷이 없을 때 쇼핑으로 연결
const ComboDetail = forwardRef(function ComboDetail({ top, bottom, type, topItems, bottomItems }, ref) {
  const { label, reason } = MATCH_TYPES[type]
  return (
    <div ref={ref} className={`combo-detail ${type}`}>
      <OutfitPreview top={top.hex} bottom={bottom.hex} className="preview-big" />
      <div className="combo-info">
        <span className={`badge ${type}`}>{label}</span>
        <strong className="combo-name">
          {top.name} 상의 + {bottom.name} 하의
        </strong>
        <p className="match-reason">{reason}</p>
        {type !== 'avoid' && (
          <div className="combo-shop">
            <span className="shop-title">🛍️ 이 색 옷이 없다면?</span>
            <ShopLink link={shopLinks(top.name, topItems)[0]} />
            <ShopLink link={shopLinks(bottom.name, bottomItems)[0]} />
          </div>
        )}
      </div>
    </div>
  )
})

// 쇼핑 연결 (광고 상품이면 "광고" 표시)
function ShopLink({ link }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" className="shop-link">
      {link.sponsored && <span className="ad">광고</span>}
      {link.label} 찾아보기
    </a>
  )
}

// 상의·하의 색을 입힌 옷 그림
function OutfitPreview({ top, bottom, className = 'preview' }) {
  return (
    <svg className={className} viewBox="0 0 40 58" aria-hidden="true">
      <path
        d="M13 2 L4 6 L0 14 L6 17 L8 15 L8 27 L32 27 L32 15 L34 17 L40 14 L36 6 L27 2 Q20 7 13 2 Z"
        fill={top}
        stroke="rgba(0,0,0,0.18)"
        strokeLinejoin="round"
      />
      <path
        d="M9 29 L31 29 L33 56 L23 56 L20 38 L17 56 L7 56 Z"
        fill={bottom}
        stroke="rgba(0,0,0,0.18)"
        strokeLinejoin="round"
      />
    </svg>
  )
}
