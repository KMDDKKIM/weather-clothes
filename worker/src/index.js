// 공공데이터포털 중계 서버 (Cloudflare Workers)
//
// 왜: 인증키를 앱·웹사이트 안에 넣으면 누구나 볼 수 있다. 키는 이 서버만 갖고(비밀값 DATA_GO_KR_KEY),
//     앱은 이 서버에 키 없이 묻는다.
// 덤: 같은 요청(같은 동네·같은 발표)은 Cloudflare에 저장해 두고 나눠 쓴다 → 일일 트래픽 제한에 여유
//
// 앱이 부르는 주소 → 공공데이터포털 주소 (이 목록에 없는 건 거절)
const ROUTES = {
  '/kma/forecast': { path: '/1360000/VilageFcstInfoService_2.0/getVilageFcst', ttl: 6 * 3600 }, // 같은 발표는 안 바뀜
  '/air/nearby': { path: '/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList', ttl: 7 * 86400 }, // 측정소 위치
  '/air/now': { path: '/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty', ttl: 10 * 60 }, // 1시간마다 측정
  '/air/forecast': { path: '/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth', ttl: 30 * 60 }, // 하루 4번 발표
}

// 이 앱에서 오는 요청만 받는다 (웹사이트, 안드로이드 앱, 개발용 미리보기)
const ORIGINS = new Set([
  'https://kmddkkim.github.io',
  'https://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:4174',
])

const UPSTREAM = 'https://apis.data.go.kr'

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin')
    const allowed = origin && ORIGINS.has(origin)
    const cors = allowed
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', Vary: 'Origin' }
      : {}

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors })
    if (request.method !== 'GET') return text('GET만 돼요', 405, cors)
    if (!allowed) return text('허용되지 않은 곳에서 온 요청이에요', 403, cors)

    const url = new URL(request.url)
    const route = ROUTES[url.pathname]
    if (!route) return text('없는 주소예요', 404, cors)

    // 저장해 둔 응답 (키 없는 주소 기준, Origin과 상관없이 같은 내용)
    const params = new URLSearchParams(url.search)
    params.delete('serviceKey')
    params.sort()
    const cacheKey = new Request(`https://cache.local${url.pathname}?${params}`)
    const cache = caches.default
    const hit = await cache.match(cacheKey)
    if (hit) return withHeaders(hit, { ...cors, 'X-Cache': 'HIT' })

    params.set('serviceKey', env.DATA_GO_KR_KEY)
    const upstream = await fetch(`${UPSTREAM}${route.path}?${params}`, { cf: { cacheTtl: 0 } })
    const body = await upstream.text()

    // 정상 응답만 저장 (키 오류·트래픽 초과는 XML이나 오류 코드로 온다)
    if (upstream.ok && isOk(body)) {
      const stored = new Response(body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${route.ttl}` },
      })
      ctx.waitUntil(cache.put(cacheKey, stored.clone()))
      return withHeaders(stored, { ...cors, 'X-Cache': 'MISS' })
    }
    return new Response(body, {
      status: upstream.ok ? 502 : upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain', ...cors },
    })
  },
}

function isOk(body) {
  try {
    const json = JSON.parse(body)
    const code = json.response?.header?.resultCode
    return (code == null || code === '00') && json.response?.body != null
  } catch {
    return false
  }
}

function withHeaders(response, headers) {
  const res = new Response(response.body, response)
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  return res
}

function text(message, status, headers) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } })
}
