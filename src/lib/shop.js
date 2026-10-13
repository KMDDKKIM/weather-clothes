// 쇼핑 연결
//
// 지금은 제휴처가 없으므로 쇼핑 검색 결과로 연결한다.
// 제휴·광고가 생기면 여기서 sponsored: true 상품을 앞에 넣어 돌려주면 된다.
// (UI는 sponsored 상품에 "광고" 표시를 붙인다. 표시광고법상 광고 표기 필수)

const SEARCH_URL = 'https://search.shopping.naver.com/search/all?query='

/**
 * @param colorName  '머스타드'
 * @param itemNames  오늘 날씨에 맞는 옷 이름들 ['맨투맨', '후드티']
 * @returns [{ label, url, sponsored }]
 */
export function shopLinks(colorName, itemNames) {
  return itemNames.slice(0, 2).map((item) => ({
    label: `${colorName} ${item}`,
    url: SEARCH_URL + encodeURIComponent(`아동 ${colorName} ${item}`),
    sponsored: false,
  }))
}
