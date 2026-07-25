// 보고서 텍스트 파서 (의존성 없는 순수 함수 — 브라우저/Node 양쪽 사용)
//
// 매주 쌓이는 자유형식 "db전환율" 보고서 텍스트를 받아
// 공급(leads) / 티켓팅(ticketing) / 요약(summary) / 일본상담(japan) / 리콜(recall) 로 분해한다.
//
// 형식이 제각각이라 파서는 "최선 추정"이며, 화면의 편집 가능 검토표에서 사람이 고치는 것을 전제로 한다.

// ── 채널 표준화 (기본값) ──────────────────────────────────────
// 공급 줄의 유입 채널 토큰 → 표준 채널명. 관리 페이지에서 수정 가능.
export const DEFAULT_CHANNEL_MAP = {
  플: '플친',
  지: '지오',
  지오: '지오',
  바비: '바비톡',
  강언: '강남언니',
  '강.언': '강남언니',
  성예사: '성예사',
  데: '데콜',
  온: '온라인상담',
  온상: '온라인상담',
  탑홈: '홈페이지',
}

// 채널 드롭다운 표시 순서 (필터·셀 편집 공통). 목록에 없는 값은 뒤에 가나다순.
export const CHANNEL_ORDER = [
  '플친', '강남언니', '바비톡', '성예사', '나모', '지오',
  '자체', '데콜', '온라인상담', '워크인', '인콜', '홈페이지',
]

// ── 실장명 별칭 (같은 사람 다른 표기 통합) ──────────────────────
const MANAGER_ALIASES = {
  지윤: '정지윤',
}

// ── 상태 → 결과 분류 키워드 (기본값) ──────────────────────────
// 우선순위 순서로 검사한다 (위에서 먼저 매칭되면 확정). 관리 페이지에서 수정 가능.
export const DEFAULT_RESULT_RULES = [
  { category: '불량', keywords: ['불량', '결번', '없는번호', '없는 번호', '없는전화', '없는 전화'] },
  { category: '취소', keywords: ['취소', '수술x', '수술 안', '신청한 적', '문의한 적', '잘못'] },
  { category: '중복', keywords: ['중복', '기존디비', '이전 디비', '이전디비', '토스'] },
  { category: '내상·예약', keywords: ['내상', '내원', '상후', '상담', 'op', '예약', '내일', '확정', '조율', '내상유도', '내상 유도', '컨펌'] },
  { category: '부재', keywords: ['부재', '안받', '안 받', '안읽', '안 읽', '안 읽으심', '읽으심', '읽지', '잠수', '문부', '연락 없', '답 없', '답없', '끊', '거절', '읽고 답'] },
  { category: '진행중', keywords: ['카톡', '문자', '진행', '확인중', '확인 중', '연락', '문의', '이벤트', '금액', '비용', '고민', '생각'] },
]

// 공급 줄에서 "이름 끝 / 상태 시작"을 알려주는 상태어 (이름이 여러 어절일 때 분리용)
const STATUS_START_MARKERS = [
  '부재', '취소', '중복', '카톡', '문자', '내상', '내원', 'op', 'OP', '상담', '상후',
  '비용', '진행', '확인', '조율', '잠수', '리콜', '날짜', '이벤트', '금액', '문의',
  '안읽', '안 읽', '안', '안받', '안 받', '기존', '이전', '정보', '당일', '당장', '전화',
  '읽', '위치', '카드', '토스', '수술', '무료', '고민', '생각', '초등', '미성년',
  // 실제 데이터에서 확인된 상담내용 시작 어휘
  '잘못', '퇴근', '일중', '거주', '답장', '예약금', '유도', '남편', '허락', '저렴',
  '알아본', '알아보', '결번', '불량', '없는', '연결', '통화', '바쁘', '나중',
]

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()

function normalizeManager(name) {
  let n = norm(name).replace(/실장|보고서|리콜/g, '').trim()
  return MANAGER_ALIASES[n] || n
}

// 정규화된 고객명 (중복 탐지용): 공백/특수문자 제거, 소문자화
export function normalizeName(name) {
  return norm(name)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '')
}

// "26/6/22", "6/21~22", "26/06/21-26/06/22", "6/22", "6월 27일" → { raw, date: 'MM-DD' 추정 }
function parseDate(text) {
  const raw = norm(text)
  const found = [] // {m, d}

  // 1) yy/mm/dd 3분할 (26/06/23, 26/6/22) → 뒤 두 개가 월/일
  for (const m of raw.matchAll(/\b\d{2}\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/g)) {
    found.push({ m: +m[1], d: +m[2], end: m.index + m[0].length })
  }
  // 2) 3분할이 차지한 구간을 지운 나머지에서 m/d 2분할
  let rest = raw.replace(/\b\d{2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}\b/g, '   ')
  for (const m of rest.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)) {
    found.push({ m: +m[1], d: +m[2], end: m.index + m[0].length })
  }
  // 3) "6월 27일" 형식
  const kMonth = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (kMonth) found.push({ m: +kMonth[1], d: +kMonth[2], end: 0 })

  const valid = found.filter((p) => p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31)
  if (valid.length === 0) return { raw, date: '' }
  // 범위(6/21~22, 6/21-6/22)면 마지막(끝) 날짜를 보고일자로
  const last = valid.sort((a, b) => a.end - b.end)[valid.length - 1]
  const mm = String(last.m).padStart(2, '0')
  const dd = String(last.d).padStart(2, '0')
  return { raw, date: `${mm}-${dd}` }
}

// 헤더 줄에서 실장 이름(한글 2~4자) 추출. 날짜/요일/보고서 등 잡토큰 제거 후 첫 한글 이름.
const NAME_STOPWORDS = new Set(['월요일','화요일','수요일','목요일','금요일','토요일','일요일','보고서','리콜','실장','공급','티켓팅','내원','동상'])
function extractManagerName(text) {
  const cleaned = norm(text)
    .replace(/\d{2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/g, ' ')
    .replace(/\d{1,2}\s*\/\s*\d{1,2}(\s*[~\-]\s*(\d{2}\/)?\d{1,2}(\/\d{1,2})?)?/g, ' ')
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, ' ')
  for (const tok of cleaned.split(/[\s]+/)) {
    const name = tok.replace(/실장|보고서|리콜/g, '')
    const m = name.match(/[가-힣]{2,4}/)
    if (m && !NAME_STOPWORDS.has(m[0])) return MANAGER_ALIASES[m[0]] || m[0]
  }
  return ''
}

// ── 헤더(보고서 블록 시작줄) 판별 ──────────────────────────────
// 반환: { manager, dateInfo, type } | null
// 알려진 실장 이름 (헤더 판별 보조 — "실장" 단어 없이 "보고서 박지송" 형태 대응)
const KNOWN_MANAGERS = ['박지송','김민희','정지윤','지윤','송수현','전지현','이성희','이아람','장경은','양희진']
function detectHeader(line, nextLine, prevLine) {
  const l = norm(line)
  if (!l) return null

  const dateHere = parseDate(l).date
  const hasManagerWord = /실장/.test(l)
  const hasKnown = KNOWN_MANAGERS.some((m) => l.includes(m))
  const isReport = /보고서/.test(l)
  const isWeekday = /(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/.test(l)

  // 헤더 후보 판별. "실장"이 있으면 날짜/보고서와 함께, 없으면(박지송 등) 반드시
  // "보고서" 또는 "요일"이 있어야 함 → 티켓팅 줄 속 "(지윤)" 같은 오탐 방지
  const looksHeader =
    (hasManagerWord && (dateHere || isReport || isWeekday)) ||
    (hasKnown && (isReport || isWeekday))
  if (!looksHeader) return null

  // 날짜: 현재 줄 → 다음 줄 → 이전 줄 순으로 탐색 (송수현: 날짜가 윗줄에 있음)
  let dateInfo = parseDate(l)
  if (!dateInfo.date && nextLine && !/실장|보고서/.test(norm(nextLine))) dateInfo = parseDate(nextLine)
  if (!dateInfo.date && prevLine) dateInfo = parseDate(prevLine)

  const manager = extractManagerName(l) || extractManagerName(nextLine || '')

  // 일본 상담: "6월 27일 ... 장경은실장", "송수현실장 토요일/일요일", "6월 동상 일요일 박지송"
  if (/장경은/.test(l) || /(토요일|일요일)/.test(l)) {
    return { manager: manager || '장경은', dateInfo, type: 'japan' }
  }
  // 리콜 보고서
  if (/리콜/.test(l)) {
    return { manager, dateInfo, type: 'recall' }
  }
  // 그 외 = 공급 보고서
  if (manager) return { manager, dateInfo, type: 'supply' }
  return null
}

// 섹션 구분 (공급 블록 내부)
function detectSection(line) {
  const l = norm(line)
  if (/^(총\s*)?공급/.test(l)) return { section: 'supply', count: firstInt(l) }
  if (/^티켓팅|^티\b|^티\d|^티 /.test(l)) return { section: 'ticketing', count: firstInt(l) }
  if (/^내원/.test(l)) return { section: 'visit', count: firstInt(l) }
  // 공급 보고서 안의 "리콜" 소제목 → 이후 줄은 리콜 명단(상담 내용과 분리)
  if (/^리콜/.test(l)) return { section: 'recall' }
  if (/^내일\s*내원|^내일내원/.test(l)) return { section: 'skip' }
  if (/^내일\s*상담|^내일상담|^내일\s*내상/.test(l)) return { section: 'skip' }
  if (/^전자차트/.test(l)) return { section: 'chart', chart: parenContent(l) }
  return null
}

function firstInt(s) {
  const m = s.match(/(\d+)/)
  return m ? +m[1] : null
}
function parenContent(s) {
  const m = s.match(/[(（]\s*([^)）]*)\s*[)）]/)
  return m ? m[1].trim() : ''
}

// 한국 이름 한 덩어리로 보이는 토큰 (한글 2~4자)
function looksLikeNameToken(t) {
  return /^[가-힣]{2,4}[.,·]?$/.test(t)
}
// 토큰 묶음 전체가 이름 표기로 보이는지 (예: "서 녕" — 한 글자씩 띄어 쓴 이름)
// 단, 상태어가 하나라도 섞여 있으면 이름이 아니다("solee lee 부재" → 이름+상태).
function allTokensNameLike(tokens) {
  if (tokens.some((t) => STATUS_START_MARKERS.some((mk) => t.includes(mk)))) return false
  if (tokens.some((t) => t.includes('/'))) return false // "복/", "팔/톡막" 같은 부위 표기 = 상담 내용
  return tokens.length <= 3 && tokens.every((t) => t.length <= 2 || !/[가-힣]{3,}/.test(t))
}

// 이름 토큰들에서 상태 시작 지점 찾기 → {name, status}
function splitNameStatus(tokens) {
  if (tokens.length <= 1) return { name: norm(tokens.join(' ')), status: '' }
  // "서 녕"처럼 짧은 토막들로만 이루어진 표기는 통째로 이름
  if (allTokensNameLike(tokens)) return { name: norm(tokens.join(' ')), status: '' }
  // 첫 토큰이 한글 2~4자 이름꼴이면 그것만 이름, 나머지는 전부 상담 내용
  // (상태어 목록에 없는 문장이 이름에 붙는 문제를 근본적으로 막음)
  if (looksLikeNameToken(tokens[0])) {
    return { name: tokens[0].replace(/[.,·]$/, ''), status: norm(tokens.slice(1).join(' ')) }
  }
  // 그 외(외국어·특수표기 이름 등)는 기존처럼 상태어 위치로 분리
  let splitIdx = tokens.length
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (STATUS_START_MARKERS.some((mk) => t.includes(mk))) { splitIdx = i; break }
    if (/\//.test(t) && i > 0) { splitIdx = i; break } // 부위/슬래시 표기도 이름 끝 신호
  }
  if (splitIdx === 0) splitIdx = 1 // 최소 한 토큰은 이름
  return { name: norm(tokens.slice(0, splitIdx).join(' ')), status: norm(tokens.slice(splitIdx).join(' ')) }
}

// 공급 리드 줄 파싱. 채널이 맨 앞("플 오보은 취소") 또는 이름 뒤("김주희 지 취소") 둘 다 지원.
function parseLeadLine(line, channelMap) {
  const tokens = norm(line).split(' ').filter(Boolean)
  if (tokens.length === 0) return null
  const channelTokens = Object.keys(channelMap)

  // 앞쪽(최대 4번째)에 등장하는 채널 토큰 위치 찾기
  const chIdx = tokens.findIndex((t, i) => i <= 4 && channelTokens.includes(t))

  if (chIdx === 0) {
    const { name, status } = splitNameStatus(tokens.slice(1))
    return { channel: channelMap[tokens[0]], name, status }
  }
  if (chIdx > 0) {
    // 이름 뒤 채널: 채널 앞 = 이름, 채널 뒤 = 상태
    return {
      channel: channelMap[tokens[chIdx]],
      name: norm(tokens.slice(0, chIdx).join(' ')),
      status: norm(tokens.slice(chIdx + 1).join(' ')),
    }
  }
  // 채널 없음
  const { name, status } = splitNameStatus(tokens)
  return { channel: '', name, status }
}

// 저장된 고객명 안에 섞인 채널 토큰 분리 (관리페이지 "기존 데이터 재적용"용)
// "김주희 지" → {name:'김주희', channel:'지오', extra:''}
// "이유빈 플 99만원" → {name:'이유빈', channel:'플친', extra:'99만원'}
export function splitChannelFromName(name, channelMap = DEFAULT_CHANNEL_MAP) {
  const tokens = norm(name).split(' ').filter(Boolean)
  const channelTokens = Object.keys(channelMap)
  const idx = tokens.findIndex((t) => channelTokens.includes(t))
  if (idx <= 0) return { name: norm(name), channel: '', extra: '' }
  return {
    name: norm(tokens.slice(0, idx).join(' ')),
    channel: channelMap[tokens[idx]],
    extra: norm(tokens.slice(idx + 1).join(' ')),
  }
}

export function classifyResult(status, rules = DEFAULT_RESULT_RULES) {
  const s = (status || '').toLowerCase()
  for (const rule of rules) {
    if ((rule.keywords || []).some((k) => k && s.includes(k.toLowerCase()))) {
      return rule.category
    }
  }
  return '기타'
}

function isDuplicateStatus(status) {
  return /중복|기존디비|이전\s*디비|토스/.test(status || '')
}

// 저장된 공급 1건을 현재 규칙으로 재해석 (관리페이지 "기존 데이터 재적용"용).
// 고객명+상태를 원래 줄로 합쳐 다시 파싱 → 채널이 이름 뒤/앞 어디 있든 정리.
// 새로 못 찾은 채널은 기존 채널을 유지한다.
export function reparseLead(customerName, statusRaw, existingChannel, config = {}) {
  const channelMap = config.channelMap || DEFAULT_CHANNEL_MAP
  const rules = config.resultRules || DEFAULT_RESULT_RULES
  const line = norm((customerName || '') + ' ' + (statusRaw || ''))
  const lead = parseLeadLine(line, channelMap) || { channel: '', name: norm(customerName), status: norm(statusRaw) }
  return {
    channel: lead.channel || existingChannel || '',
    customer_name: lead.name,
    status_raw: lead.status,
    result_category: classifyResult(lead.status, rules),
    is_duplicate: isDuplicateStatus(lead.status),
  }
}

// op 날짜 추출: 키/몸무게(예 154/55)를 제외하고, 유효한 월/일만 인정.
// op·상후·내상 키워드 뒤의 날짜를 우선한다. 없으면 "N월".
function extractOpDate(raw, hw) {
  // 키/몸무게 구간을 공백으로 지워서 '154/55'의 뒷자리(54/55)를 날짜로 오인하지 않게 함
  let s = raw
  if (hw) s = raw.slice(0, hw.index) + ' '.repeat(hw[0].length) + raw.slice(hw.index + hw[0].length)
  const cands = []
  const re = /(\d{1,2})\s*[./]\s*(\d{1,2})/g
  let m
  while ((m = re.exec(s))) {
    const mo = +m[1], d = +m[2]
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue // 유효한 날짜만
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 4)
    const priority = /op|OP|상후|내상/.test(after) ? 0 : 1
    cands.push({ text: `${mo}/${d}`, priority, index: m.index })
  }
  if (cands.length) {
    cands.sort((a, b) => a.priority - b.priority || a.index - b.index)
    return cands[0].text
  }
  const mo = s.match(/(\d{1,2})\s*월/)
  return mo ? `${+mo[1]}월` : ''
}

// 티켓팅 줄 느슨하게 파싱 (원문은 항상 보존). 티켓처럼 안 보이면 null 반환(프로즈 배제)
function parseTicketLine(line) {
  const raw = norm(line)
  let hw = raw.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  // 숫자 바로 뒤에 붙은 op·상후 (예 "12/25op")는 키가 아니라 op 날짜 → 키로 오인 방지.
  // 단 "158/55 팔상후"처럼 공백·부위가 끼면 키가 맞으므로 제외(^ 로 바로 뒤만 검사).
  if (hw) {
    const after = raw.slice(hw.index + hw[0].length, hw.index + hw[0].length + 4)
    if (/^(op|OP|상후|내상)/.test(after)) hw = null
  }
  const surgeon = raw.match(/dr\.?\s*([가-힣A-Za-z]+)|닥터\s*([가-힣]+)|\b(민|록|강|오|박|변)\b/)
  const pay = raw.match(/(계|카|완납)\s*\.?\s*(\d+(?:\.\d+)?)?/)
  const areaMatch = raw.match(/(팔부겨|복러|부겨|뒷볼록|앞복부|허벅지|팔뚝|고관절|엉스|무샤|얼흡|가슴|이식|러브|무릎|힙|팔|복|허|엉|샤|겨|얼)[^\s]*/)

  const opDate = extractOpDate(raw, hw)
  const hasOpDay = /^\d{1,2}\/\d{1,2}$/.test(opDate) // 구체적 op날짜(예 7/1). "7월"/"미정"은 제외
  const hasPay = !!(pay && pay[2]) // 결제(계/카/완납 + 금액)

  // 실제 티켓 판정: 구체적 op날짜 '또는' 결제가 있어야 함.
  // 둘 다 없으면(날짜 미정 + 결제 없음) 티켓팅에서 제외한다.
  const tokenCount = raw.split(' ').length
  if ((!hasOpDay && !hasPay) || tokenCount > 16) return null

  // 이름: 첫 토큰이 채널 토큰(플/지 등)이면 건너뛰고 다음 토큰을 이름으로
  const toks = raw.split(' ')
  const name = (Object.prototype.hasOwnProperty.call(DEFAULT_CHANNEL_MAP, toks[0]) ? toks[1] : toks[0]) || ''
  const area = areaMatch ? areaMatch[0] : ''
  return {
    customer_name: name,
    area,
    surgeon: surgeon ? (surgeon[1] || surgeon[2] || surgeon[3] || '') : '',
    height: hw ? +hw[1] : null,
    weight: hw ? +hw[2] : null,
    op_date: opDate,
    pay_type: pay ? pay[1] : '',
    amount: pay && pay[2] ? pay[2] : '',
    raw,
  }
}

// 저장된 티켓팅 원문(raw)을 다시 파싱 (기존 데이터 op날짜 교정용)
export function reparseTicket(raw) {
  return parseTicketLine(raw)
}

// 일본 상담 파싱: ① 번호 블록 형식(장경은/박지송), ② ID+이름 자유형식(송수현) 폴백
function parseJapanBlocks(text, header) {
  const lines = text.split('\n')
  const hasNumbered = lines.some((l) => /^\s*\d+[).]?\s*$/.test(l))
  if (!hasNumbered) return parseJapanFreeform(text, header)

  const results = []
  let cur = null
  const push = () => {
    if (cur && (cur.patient || cur.content)) results.push(cur)
    cur = null
  }
  const blank = () => ({
    report_date: header.dateInfo.date,
    manager: header.manager,
    patient: '',
    surgeon: '',
    surgery_date: '',
    deposit: '',
    cost_parts: '',
    content: '',
  })
  for (const line of lines) {
    const l = norm(line)
    if (/^\d+[).]?$/.test(l)) {
      // 새 블록 시작 번호
      push()
      cur = blank()
      continue
    }
    if (!cur) continue
    if (/환자\s*(번호)?\+?이름|환자이름|환자\s*번호/.test(l)) {
      cur.patient = l.replace(/^\d+[).]?\s*/, '').replace(/.*이름\s*[:：]?/, '').trim()
    } else if (/집도의/.test(l)) {
      cur.surgeon = l.replace(/.*집도의\s*[:：]?/, '').trim()
    } else if (/수술\s*날짜|날짜.*시간/.test(l)) {
      cur.surgery_date = l.replace(/.*집도의|.*날짜[^:：]*[:：]?/, '').trim()
    } else if (/예약금/.test(l)) {
      cur.deposit = l.replace(/.*예약금\s*[:：]?/, '').trim()
    } else if (/수술\s*부위|부위.*비용/.test(l)) {
      cur.cost_parts = l.replace(/.*비용\s*[:：]?/, '').trim()
    } else if (l && !/^내용\s*[:：]?$/.test(l)) {
      cur.content += (cur.content ? ' ' : '') + l.replace(/^내용\s*[:：]?/, '').trim()
    }
  }
  push()
  return results
}

// 자유형식 일본 상담(송수현 등): 빈 줄로 구분된 그룹, 첫 줄=환자 ID/이름
function parseJapanFreeform(text, header) {
  const results = []
  const groups = text.split(/\n\s*\n/) // 빈 줄 기준 그룹
  for (const g of groups) {
    const gLines = g.split('\n').map(norm).filter(Boolean)
    if (gLines.length === 0) continue
    // 요일/머리말 줄만 있는 그룹은 건너뜀
    if (gLines.length === 1 && /(토요일|일요일|실장)/.test(gLines[0])) continue
    const first = gLines[0]
    // 첫 줄이 ID(숫자) 또는 이름처럼 보일 때만 환자로 간주
    if (!/[가-힣ぁ-んァ-ン]/.test(g)) continue
    const dateM = g.match(/(\d{1,2}\s*\/\s*\d{1,2})|(\d{1,2}\s*월\s*\d{1,2}\s*일)|(\d{1,2}\/\d{1,2})/)
    const surgeonM = g.match(/dr\.?\s*([가-힣A-Za-z]+)|닥터\s*([가-힣]+)|\b(민|록|강|오|박|변)\b/)
    const depositM = g.match(/(페이팔|페|현금|현)\s*\d*만?엔?|\d+\s*만엔/)
    results.push({
      report_date: header.dateInfo.date,
      manager: header.manager,
      patient: first,
      surgeon: surgeonM ? (surgeonM[1] || surgeonM[2] || surgeonM[3] || '') : '',
      surgery_date: dateM ? dateM[0].replace(/\s/g, '') : '',
      deposit: depositM ? depositM[0] : '',
      cost_parts: '',
      content: gLines.slice(1).join(' '),
    })
  }
  return results
}

// ── 메인 ───────────────────────────────────────────────────────
// config: { channelMap, resultRules } — 관리 페이지 설정. 없으면 기본값 사용.
export function parseReport(text, config = {}) {
  const channelMap = config.channelMap || DEFAULT_CHANNEL_MAP
  const resultRules = config.resultRules || DEFAULT_RESULT_RULES
  // 카카오톡 내보내기 접두어 제거: "[발신자] [오후 6:59] 실제내용" → "실제내용"
  // (발신자 이름을 실장으로 오인하는 문제 방지). 시간표기(H:MM)가 있는 두 번째 대괄호로 식별.
  const KAKAO_PREFIX = /^\[[^\]]*\]\s*\[[^\]]*\d{1,2}:\d{2}[^\]]*\]\s*/
  const lines = (text || '').split('\n').map((l) => l.replace(KAKAO_PREFIX, ''))
  const supply = []
  const ticketing = []
  const summary = []
  const japan = []
  const recall = []
  const warnings = []

  // 1) 블록 분할
  const blocks = []
  let cur = null
  for (let i = 0; i < lines.length; i++) {
    const header = detectHeader(lines[i], lines[i + 1], lines[i - 1])
    if (header) {
      if (cur) blocks.push(cur)
      cur = { header, lines: [] }
    } else if (cur) {
      cur.lines.push(lines[i])
    }
  }
  if (cur) blocks.push(cur)

  if (blocks.length === 0) warnings.push('보고서 머리글(실장명)을 찾지 못했습니다.')

  // 2) 블록별 파싱
  for (const b of blocks) {
    const { header } = b
    const date = header.dateInfo.date
    const mgr = header.manager

    if (header.type === 'japan') {
      japan.push(...parseJapanBlocks(b.lines.join('\n'), header))
      continue
    }

    if (header.type === 'recall') {
      for (const line of b.lines) {
        const name = norm(line)
        if (!name) continue
        if (/^공급|^티켓팅|^내원|^전자차트|보고서/.test(name)) continue
        if (/^\d{1,2}\s*\/\s*\d{1,2}/.test(name) || /^\d{2}\/\d/.test(name)) continue // 잔여 날짜줄
        recall.push({ report_date: date, manager: mgr, customer_name: name })
      }
      continue
    }

    // supply 블록: 섹션 순회
    let section = null
    const sum = { report_date: date, manager: mgr, supply_count: null, ticket_count: null, visit_count: null, chart_status: '' }
    for (const line of b.lines) {
      const l = norm(line)
      if (!l) continue
      const sec = detectSection(line)
      if (sec) {
        if (sec.section === 'supply') { section = 'supply'; sum.supply_count = sec.count }
        else if (sec.section === 'ticketing') { section = 'ticketing'; sum.ticket_count = sec.count }
        else if (sec.section === 'recall') { section = 'recall' }
        else if (sec.section === 'visit') { section = null; if (sec.count != null) sum.visit_count = sec.count }
        else if (sec.section === 'chart') { section = null; sum.chart_status = sec.chart }
        else section = null
        continue
      }
      if (/^입니다|^전자차트/.test(l)) continue

      if (section === 'supply') {
        const lead = parseLeadLine(line, channelMap)
        if (lead && lead.name) {
          supply.push({
            report_date: date,
            manager: mgr,
            channel: lead.channel,
            customer_name: lead.name,
            status_raw: lead.status,
            result_category: classifyResult(lead.status, resultRules),
            is_duplicate: isDuplicateStatus(lead.status),
            note: '',
          })
        }
      } else if (section === 'ticketing') {
        const t = parseTicketLine(line)
        if (t && t.customer_name) ticketing.push({ report_date: date, manager: mgr, ...t })
      } else if (section === 'recall') {
        // 리콜 명단은 공급(상담)에 섞지 않고 리콜로 분리
        recall.push({ report_date: date, manager: mgr, customer_name: l })
      }
    }
    summary.push(sum)
  }

  // 3) 중복 탐지 (정규화 이름이 여러 행에 등장)
  markDuplicates(supply)

  return { supply, ticketing, summary, japan, recall, warnings }
}

// 공급 배열에서 같은 이름이 2회 이상 등장하면 is_duplicate=true
export function markDuplicates(supply) {
  const byName = {}
  for (const row of supply) {
    const key = normalizeName(row.customer_name)
    if (!key) continue
    ;(byName[key] = byName[key] || []).push(row)
  }
  for (const key in byName) {
    if (byName[key].length > 1) {
      for (const row of byName[key]) row.is_duplicate = true
    }
  }
  return supply
}

// 저장된 공급 데이터에서 중복 그룹만 뽑기 (중복 탭용)
export function findDuplicateGroups(supplyRows) {
  const byName = {}
  for (const row of supplyRows) {
    const key = normalizeName(row.customer_name)
    if (!key) continue
    ;(byName[key] = byName[key] || []).push(row)
  }
  return Object.entries(byName)
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, name: rows[0].customer_name, rows }))
    .sort((a, b) => b.rows.length - a.rows.length)
}
