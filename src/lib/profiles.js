// 누구 옷을 볼지: '우리 아이'(유치원 등원) / '나'(엄마·아빠)
//
// 날씨·화면은 같이 쓰고, 옷 목록과 추천 문구·말투만 프로필마다 다르다.
// - 아이: outfit.js, clothes.js, outing.js (등원·하원)
// - 나:   adult/ (성인용 앱 '오늘 뭐 입지?'에서 옮겨 옴. 나가는·들어오는 시간)
// 동네는 두 프로필이 함께 쓴다. 설정·피드백은 따로 저장.

import * as kidPlan from './outfit.js'
import * as kidClothes from './clothes.js'
import * as kidOuting from './outing.js'
import * as adultPlan from './adult/outfit.js'
import * as adultClothes from './adult/clothes.js'
import * as adultOuting from './adult/outing.js'
import { BOTTOM_COLORS, ADULT_BOTTOM_COLORS } from './colors.js'
import { FEEDBACK_KEYS } from './feedback.js'

const { timeToHour } = kidPlan

export const PROFILES = {
  kid: {
    tab: '🧒 우리 아이',
    title: '오늘 뭐 입혀?',
    // 예전 설정(아이 시간·톤)은 settings 맨 바깥에 있어서 그대로 둔다 (App.jsx)
    defaults: { dropoff: '08:30', pickup: '16:00', sensitivity: 'normal', gender: 'any', tone: 'unknown' },
    leaveKey: 'dropoff',
    backKey: 'pickup',
    timeLabels: { dropoff: '등원 시간', pickup: '하원 시간' },
    settingsTitle: '우리 아이',
    sensitivityLabel: '우리 아이는',
    SENSITIVITY: kidPlan.SENSITIVITY,
    CATEGORIES: kidClothes.CATEGORIES,
    GENDERS: kidClothes.GENDERS,
    genderLabel: '우리 아이 옷',
    innerwearLabels: ['내복', '내복 (추위 타면)'],
    itemsTitle: '챙겨주세요',
    feedbackKey: FEEDBACK_KEYS.kid,
    whens: { commute: '등·하원 때', day: '원에서 낮에' },
    commuteLabel: '등·하원 때',
    feedbackHint: (beforeBack) =>
      `${beforeBack ? '하원 후에 알려주시면' : '알려주시면'} 우리 아이에게 맞게 다음 추천을 조정할게요.`,
    toneLabel: '우리 아이 톤',
    wearer: '아이가',
    bottoms: BOTTOM_COLORS,
    bottomFilter: null, // 아이는 조합표의 하의 색을 전부
    shopPrefix: (s) => kidClothes.GENDERS[s.gender]?.shop ?? '아동 ',
    buildPlan: kidPlan.buildPlan,
    // '지금': 평일 하원 전엔 등원 기준, 하원 후·주말엔 지금 나가는 기준
    nowOpts: (now, s) => ({ ...s, ...kidOuting.nowOuting(now, s) }),
    // '내일': 설정 시간 그대로 (주말이면 외출 말투)
    tomorrowOpts: (now, s) => ({ ...s, ...kidOuting.tomorrowOuting(now, s) }),
    // 저녁 늦게(밤 9시) 들어온다면? 외출할 때만
    lateOpts: (opts) => {
      const late = opts.mode === 'outing' ? kidOuting.lateBack(opts.pickup) : null
      return late == null ? null : { ...opts, pickup: late }
    },
    notes: (plan, late) => [...plan.worries, late, kidPlan.outdoorNote(plan)].filter(Boolean),
    lateNote: kidPlan.lateNote,
  },

  me: {
    tab: '🙋 나',
    title: '오늘 뭐 입지?',
    defaults: { leave: '08:00', back: '19:00', sensitivity: 'normal', gender: 'any', tone: 'unknown' },
    leaveKey: 'leave',
    backKey: 'back',
    timeLabels: { leave: '집에서 나가는 시간', back: '집에 들어오는 시간' },
    settingsTitle: '나',
    sensitivityLabel: '나는',
    SENSITIVITY: adultPlan.SENSITIVITY,
    CATEGORIES: adultClothes.CATEGORIES,
    GENDERS: adultClothes.GENDERS,
    genderLabel: '추천할 옷',
    innerwearLabels: ['발열 내의', '발열 내의 (추위 타면)'],
    itemsTitle: '챙기세요',
    feedbackKey: FEEDBACK_KEYS.me,
    whens: { commute: '오갈 때', day: '낮에' },
    commuteLabel: '오갈 때',
    feedbackHint: (beforeBack) =>
      `${beforeBack ? '집에 들어와서 알려주시면' : '알려주시면'} 내 몸에 맞게 다음 추천을 조정할게요.`,
    toneLabel: '내 퍼스널 컬러',
    wearer: '',
    bottoms: ADULT_BOTTOM_COLORS,
    bottomFilter: ADULT_BOTTOM_COLORS,
    shopPrefix: (s) => ({ f: '여성 ', m: '남성 ' })[s.gender] ?? '',
    buildPlan: adultPlan.buildPlan,
    // '지금': 지금 나가서 평소처럼 들어온다
    nowOpts: (now, s) => {
      const leave = adultOuting.outingLeave(now, s)
      return { ...s, leave, back: adultOuting.outingBack(leave, s) }
    },
    tomorrowOpts: (now, s) => ({ ...s, leave: timeToHour(s.leave), back: timeToHour(s.back) }),
    // 밤늦게(밤 11시) 들어온다면?
    lateOpts: (opts) => {
      const late = adultOuting.lateBack(opts.back)
      return late == null ? null : { ...opts, back: late }
    },
    notes: (plan, late) => [...plan.tips, late].filter(Boolean),
    lateNote: adultPlan.lateNote,
  },
}

export { timeToHour }
