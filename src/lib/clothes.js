// 옷 아이템 카탈로그
//
// range: 이 옷이 적당한 체감온도 범위 [최저, 최고]
//   - 상의·하의: 원에서 하루 종일 입으니 "낮 최고 체감온도"로 판단
//   - 겉옷·내복: 오갈 때 필요하니 "등·하원 중 추운 시간 체감온도"로 판단
// ideal: 가장 잘 맞는 온도. 여러 옷이 범위에 들면 ideal에 가까운 순으로 추천
// everyday: 평소 많이 입히는 옷. 범위에 들면 이 온도(°C)만큼 더 잘 맞는 것으로 보고 앞에 둔다
// gender: 'f' 여아 옷, 'm' 남아 옷, 없으면 공용 (설정 "우리 아이 옷")
// dress: 원피스. 하의가 따로 필요 없어서 1순위로는 두지 않고 "또는 ~도 괜찮아요"에만 보여준다
//
// 원 안은 냉난방이 되므로 상의·하의는 기모 이상으로 두꺼워지지 않게 하고,
// 추위는 겉옷과 내복으로 해결한다.
//
// 겉옷·내복 범위는 처음 기준보다 1° 낮췄다 (2026-10-14).
// 체감온도가 기온보다 낮아서(아침 평균 봄 1.8°·가을 0.7°·겨울 4.1°) 어른 기온별 옷차림표보다
// 이틀에 한 번꼴로 한 단계 두껍게 나왔음. 작년 서울 365일 시뮬레이션에서
// 1° 낮춤 = 표와 같음 59% / 한 단계 따뜻 35% / 얇음 6% → "어른보다 살짝 따뜻하게"에 맞음.
// (2° 낮추면 가을엔 어른보다 얇아져서 제외)

export const CATEGORIES = {
  top: { label: '상의', basis: 'peak' },
  bottom: { label: '하의', basis: 'peak' },
  outer: { label: '겉옷', basis: 'cold' },
  innerwear: { label: '내복', basis: 'cold' },
}

// 설정 '우리 아이 옷'. 상관없음이면 공용 옷을 앞에, 여아 옷은 '또는 ~도 괜찮아요'로
export const GENDERS = {
  any: { label: '상관없음', shop: '아동 ' },
  f: { label: '여아', shop: '여아 ' },
  m: { label: '남아', shop: '남아 ' },
}

export const CLOTHES = [
  // 상의
  { id: 'sleeveless', category: 'top', name: '민소매', emoji: '🎽', range: [28, 45], ideal: 32 },
  { id: 'tshirt', category: 'top', name: '반팔 티', emoji: '👕', range: [23, 45], ideal: 27 },
  { id: 'thin-long', category: 'top', name: '얇은 긴팔 티', emoji: '👕', range: [19, 25], ideal: 22 },
  { id: 'long', category: 'top', name: '긴팔 티', emoji: '👕', range: [16, 22], ideal: 19 },
  { id: 'thin-sweat', category: 'top', name: '얇은 맨투맨', emoji: '👕', range: [14, 20], ideal: 17 },
  { id: 'sweat', category: 'top', name: '맨투맨', emoji: '👕', range: [11, 18], ideal: 14 },
  { id: 'hoodie', category: 'top', name: '후드티', emoji: '👕', range: [11, 18], ideal: 14.5 },
  { id: 'knit', category: 'top', name: '니트', emoji: '🧶', range: [8, 15], ideal: 11 },
  { id: 'fleece-long', category: 'top', name: '기모 긴팔 티', emoji: '🧶', range: [6, 14], ideal: 10 },
  { id: 'fleece-sweat', category: 'top', name: '기모 맨투맨', emoji: '🧶', range: [-30, 11], ideal: 5 },
  { id: 'fleece-hoodie', category: 'top', name: '기모 후드티', emoji: '🧶', range: [-30, 11], ideal: 5.5 },
  { id: 'fleece-turtle', category: 'top', name: '기모 터틀넥', emoji: '🧶', range: [-30, 6], ideal: 0 },
  { id: 'summer-dress', category: 'top', name: '반팔 원피스', emoji: '👗', range: [23, 45], ideal: 27, gender: 'f', dress: true },
  { id: 'long-dress', category: 'top', name: '긴팔 원피스', emoji: '👗', range: [16, 24], ideal: 20, gender: 'f', dress: true },
  { id: 'fleece-dress', category: 'top', name: '기모 원피스', emoji: '👗', range: [-30, 12], ideal: 6, gender: 'f', dress: true },

  // 하의
  { id: 'shorts', category: 'bottom', name: '반바지', emoji: '🩳', range: [25, 45], ideal: 29 },
  { id: 'capri', category: 'bottom', name: '7부 바지', emoji: '👖', range: [21, 28], ideal: 24 },
  { id: 'thin-pants', category: 'bottom', name: '얇은 긴바지', emoji: '👖', range: [18, 25], ideal: 21 },
  { id: 'leggings', category: 'bottom', name: '레깅스', emoji: '👖', range: [14, 22], ideal: 18 },
  { id: 'cotton-pants', category: 'bottom', name: '면바지', emoji: '👖', range: [13, 21], ideal: 17, everyday: 3 },
  { id: 'jogger', category: 'bottom', name: '트레이닝 바지', emoji: '👖', range: [12, 20], ideal: 16 },
  { id: 'jeans', category: 'bottom', name: '청바지', emoji: '👖', range: [12, 20], ideal: 15.5, everyday: 3 },
  { id: 'fleece-jeans', category: 'bottom', name: '기모 청바지', emoji: '👖', range: [-5, 11], ideal: 6, everyday: 2 },
  { id: 'fleece-leggings', category: 'bottom', name: '기모 레깅스', emoji: '👖', range: [-30, 12], ideal: 7 },
  { id: 'fleece-pants', category: 'bottom', name: '기모 바지', emoji: '👖', range: [-30, 10], ideal: 3 },
  { id: 'skirt', category: 'bottom', name: '치마', emoji: '👗', range: [23, 45], ideal: 27, gender: 'f' },
  { id: 'skirt-leggings', category: 'bottom', name: '레깅스에 치마', emoji: '👗', range: [12, 22], ideal: 17, gender: 'f' },

  // 겉옷 (none = 겉옷 없음)
  { id: 'no-outer', category: 'outer', name: '겉옷 없이', emoji: '🙅', range: [20, 45], ideal: 25 },
  { id: 'cardigan', category: 'outer', name: '얇은 가디건', emoji: '🧥', range: [16, 22], ideal: 19 },
  { id: 'windbreaker', category: 'outer', name: '바람막이', emoji: '🧥', range: [13, 20], ideal: 16.5, windproof: true },
  { id: 'zipup', category: 'outer', name: '후드 집업', emoji: '🧥', range: [12, 19], ideal: 15.5 },
  { id: 'thick-cardigan', category: 'outer', name: '두꺼운 가디건', emoji: '🧥', range: [11, 17], ideal: 14 },
  { id: 'fleece-jacket', category: 'outer', name: '후리스', emoji: '🧥', range: [8, 15], ideal: 11.5 },
  { id: 'jumper', category: 'outer', name: '간절기 점퍼', emoji: '🧥', range: [7, 14], ideal: 10.5, windproof: true },
  { id: 'light-padding', category: 'outer', name: '경량 패딩', emoji: '🧥', range: [3, 10], ideal: 6.5 },
  { id: 'padding', category: 'outer', name: '패딩 점퍼', emoji: '🧥', range: [-4, 5], ideal: 1, windproof: true },
  { id: 'long-padding', category: 'outer', name: '롱패딩', emoji: '🧥', range: [-30, 0], ideal: -7, windproof: true },

  // 내복
  { id: 'no-innerwear', category: 'innerwear', name: '내복 없이', emoji: '🙅', range: [2, 45], ideal: 14 },
  { id: 'innerwear', category: 'innerwear', name: '내복 상하의', emoji: '🩲', range: [-30, 5], ideal: -6 },
]

/**
 * 해당 카테고리에서 온도 t에 맞는 옷들을 잘 맞는 순으로 돌려준다.
 * 범위에 드는 옷이 없으면 가장 가까운 옷 하나를 돌려준다.
 * @param gender 'any' | 'f' | 'm'  고른 성별 옷 + 공용 옷만 (any면 전부)
 */
export function optionsFor(category, t, { windy = false, gender = 'any' } = {}) {
  const items = CLOTHES.filter((c) => c.category === category && (gender === 'any' || !c.gender || c.gender === gender))
  const fit = items.filter((c) => t >= c.range[0] && t <= c.range[1])
  // 바람이 강하면 바람을 막아주는 겉옷을, 평소 많이 입는 옷은 늘 앞으로, 원피스는 뒤로.
  // '상관없음'에서는 공용 옷을 먼저, 성별 옷은 "또는 ~도 괜찮아요"로
  const score = (c) =>
    Math.abs(t - c.ideal) -
    (windy && c.windproof ? 3 : 0) -
    (c.everyday ?? 0) +
    (c.dress ? 100 : 0) +
    (gender === 'any' && c.gender ? 5 : 0)
  if (fit.length) return fit.sort((a, b) => score(a) - score(b))

  const distance = (c) => Math.min(Math.abs(t - c.range[0]), Math.abs(t - c.range[1]))
  return [items.sort((a, b) => distance(a) - distance(b))[0]]
}
