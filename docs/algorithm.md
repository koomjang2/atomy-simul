# 몸PV 최적화 알고리즘 (핵심 엔진)

## 개요

**목표:** 하위 SM(들)의 몸PV 40만을 날짜별로 최적 분배하여
- 하위 SM: 최소 비용으로 직급 달성
- 상위 DM/SRM: 일일 후원수당 점수 최대화 (15점 → 30점)

**핵심 개념:**
- SM 기본 세팅: 좌 250만 / 우 210만 / 몸PV 40만
  → 몸PV가 자동으로 우에 합산: 210 + 40 = 250만 → SM 달성
- 이 몸PV 40만을 언제 어떻게 넣느냐에 따라 상위 DM 수당이 달라짐

---

## 4단계 알고리즘

### 1단계: 캘린더 및 타겟 배열 초기화

```
INPUT:
  - period: "1~15" 또는 "16~말일"
  - year, month
  - sm_list: 하위 SM 배열 (각각 몸PV 풀, 좌 타겟, 우 타겟)

PROCESS:
  1. 해당 기간의 날짜 배열 생성
  2. 일요일 날짜 찾아서 해당 일자 PV 입력값 0으로 잠금
  3. 실제 영업일 = 전체 일수 - 일요일 수 (보통 13일)
  4. 각 SM의 타겟 배열 세팅:
     - 좌 타겟: 250만 (SM) / 150만 (SSM)
     - 우 타겟: 250만 (SM) / 150만 (SSM)
     - 몸PV 풀: 0만 (기본값, 달성 보조 수단으로만 사용)
```

### 2단계: 하위 직급자 기본 배열 생성 (Base Array)

```
PROCESS:
  1. 우 타겟(소실적)을 30만 단위로 나눔
     예: 210만 ÷ 30만 = 7회 매칭 필요
  2. 영업일 13일 중 7일을 균등 분배 (Even-Spacing)
     → 연속 배치 금지, 2~3일 간격으로 띄워서 배치
     예: [1일, 3일, 5일, 8일, 10일, 12일, 14일]에 30만씩 배치
  3. 좌 타겟은 우와 거울(Mirror) 구조로 배치하되
     상위 DM 매칭을 고려한 날짜에 배치
  
CONSTRAINT:
  - 이틀 매칭 허용: 1일 좌 30만 + 2일 우 30만 → 2일에 점수 발생
  - 하루 매칭도 허용: 같은 날 좌 30만 + 우 30만 → 당일 점수 발생
  - 일요일은 배치 금지

MATCHING STRATEGY:
  - DM 한쪽 하위 직급자 1명: 하루 매칭(same-day) 기본 적용
  - DM 한쪽 하위 직급자 2명 이상: 이틀 매칭 적용
    → 각 SM의 우PV를 좌PV 날짜 기준 다음 영업일에 배치
    → 여러 SM이 있을 때 PV가 스태거링되어 DM 점수 발생 횟수 극대화
    → bodyPv 있는 SM의 경우 이틀 매칭 효과가 특히 높음
```

### 3단계: 상위 DM/SRM 스캐닝 및 몸PV 최적 투입 (핵심 퍼즐)

```
PROCESS:
  // 롤업 연산
  for each day in calendar:
    dm.left_pv[day] = sum(sm.left_pv[day] for sm in dm.left_group)
    dm.right_pv[day] = sum(sm.right_pv[day] for sm in dm.right_group)
  
  // 수당 구간 스캔
  for each day in calendar:
    current_score = get_score(dm.left_pv[day], dm.right_pv[day])
    next_tier = get_next_tier(current_score)
    // 다음 구간 달성에 필요한 좌/우 부족분 계산
    left_gap = next_tier.threshold - dm.left_pv[day]
    right_gap = next_tier.threshold - dm.right_pv[day]
    
    // 몸PV 할당 - SSM/SM 전용 (DM 이상은 몸PV 없음)
    // DM의 좌/우 PV 부족분을 채우는 재료는
    // 오직 하위 SSM/SM의 몸PV 풀에서만 가져옴
    if left_gap > 0 AND left_gap <= sm.body_pv_pool:
        sm.schedule[day]['body_pv'] += left_gap
        sm.body_pv_pool -= left_gap
    if right_gap > 0 AND right_gap <= sm.body_pv_pool:
        sm.schedule[day]['body_pv'] += right_gap
        sm.body_pv_pool -= right_gap
  
  // 상위로 전파: 하위 SM의 몸PV 배치 결과가
  // 롤업되어 DM → SRM → STM 수당에 반영됨
  // (DM/SRM/STM 본인의 몸PV는 존재하지 않음)
```

**수당 구간 테이블 (점수 계산 기준):**
```javascript
const SCORE_TIERS = [
  { threshold: 300_000,   score: 15  },  // 30만/30만
  { threshold: 700_000,   score: 30  },  // 70만/70만
  { threshold: 1_500_000, score: 60  },  // 150만/150만
  { threshold: 2_400_000, score: 90  },  // 240만/240만
  { threshold: 6_000_000, score: 150 },  // 600만/600만
  { threshold: 20_000_000,score: 250 },  // 2000만/2000만
  { threshold: 50_000_000,score: 300 },  // 5000만/5000만
];

function getScore(leftPv, rightPv, bodyPv) {
  const minPv = Math.min(leftPv, rightPv);
  // 몸PV는 더 적은 쪽에 합산
  const effectivePv = minPv; // bodyPv는 직급 달성 판단 시 합산
  for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
    if (leftPv >= SCORE_TIERS[i].threshold && rightPv >= SCORE_TIERS[i].threshold) {
      return SCORE_TIERS[i].score;
    }
  }
  return 0;
}
```

### 4단계: 잔여 PV 처리 및 최종 확정

```
PROCESS:
  1. 상위 DM/SRM 매칭 완료 후 잔여 몸PV 처리
     → 플래시아웃 위험 없는 마지막 날(15일 또는 말일)에 일괄 배치
  
  2. 검증(Validation):
     for each sm in sm_list:
       total_left = sum(sm.schedule[day]['left'] for day in calendar)
       total_right = sum(sm.schedule[day]['right'] for day in calendar)
       total_body = sum(sm.schedule[day]['body_pv'] for day in calendar)
       effective_right = total_right + total_body  // 우가 소실적이므로
       assert total_left >= target_left
       assert effective_right >= target_right
  
  3. 최종 테이블 출력:
     - 행: 날짜
     - 열: 요일, 좌PV, 우PV, 몸PV, 점수, 일일수당
     - 합계 행: 총 좌/우/몸PV, 총 점수, 총 수당
```

---

## 조직 구조 및 롤업 계산 (상향식 Bottom-Up)

```
DM
├── 좌 라인
│   ├── L-SM1 (직속 좌)
│   │   ├── L-SM1의 좌 (A, B, ...)
│   │   └── L-SM1의 우 (H, I, ...)
│   └── L-SM2 (L-SM1 하위)
│       ├── L-SM2의 좌 (C, D, ...)
│       └── L-SM2의 우 (...)
└── 우 라인
    ├── R-DM1 (직속 우의 DM)
    │   ├── RL-SM1
    │   └── RR-SM1
    └── ...

// 롤업 원칙:
// DM의 좌매출 G = A+B+C+D+E+F (좌 라인 모든 PV의 합)
// DM의 우매출 R = L+Q (우 라인 모든 PV의 합)
```

**주의:** 나와 동일한 직급 또는 더 높은 직급이 내 하위에 있을 수 있음
→ 해당 경우 그 직급자 하위의 PV는 그 직급자 기준으로 분리 계산

---

## 몸PV 쪼개기 실전 예시

**상황:** SM 한 명의 몸PV 40만, 상위 DM의 특정 날짜 좌/우 각 60만

```
DM 현황 (22일):
  좌: 60만 PV, 우: 70만 PV → 현재 15점 (30만/30만 구간)
  → 70만/70만 달성 시 30점 가능
  → 필요: 좌 +10만

DM의 좌에 있는 SM몸PV 배분:
  22일에 몸PV 10만 투입 (좌 10만)
  → DM 22일: 좌 70만, 우 70만 → 30점 달성
  → SM 몸PV 잔여: 40만 - 10만 = 30만 남음

직급표 기록:
  SM | 22일 | 좌: 0 | 우: 0 | 몸PV: 10만
```

**직급표 PDF 예시 (실제 케이스):**
```
날짜 | 요일 | 좌    | 우    | 몸PV
20   | 월   | 30만  |       | 10만
21   | 화   |       | 30만  | 10만
22   | 수   | 40만  |       | 20만
23   | 목   |       | 30만  |
...
합계 |      | 250만 | 210만 | 40만
```
→ 몸PV 40만이 우(소실적 210만)에 합산 = 250만 → SM 달성
→ 20일(10만), 21일(10만), 22일(20만)로 쪼개서 상위 DM 수당 최적화

---

## 구현 시 핵심 데이터 구조

```typescript
interface DayEntry {
  date: number;         // 날짜 (1~15 또는 16~31)
  dayOfWeek: string;    // 요일
  isSunday: boolean;    // 일요일 여부 (true면 입력 잠금)
  leftPv: number;       // 좌 PV (만 단위, 예: 30 = 30만)
  rightPv: number;      // 우 PV
  bodyPv: number;       // 몸PV (당일 배치분)
  score: number;        // 해당일 획득 점수 (자동 계산)
  dailyCommission: number; // 일일 후원수당 (자동 계산)
}

interface MemberSchedule {
  memberId: string;
  memberName: string;
  rank: 'SSM' | 'SM' | 'DM' | 'SRM' | 'STM';
  targetLeft: number;
  targetRight: number;
  // 몸PV는 SSM/SM 전용. DM 이상은 0으로 고정, UI에서 입력란 비표시
  bodyPvPool: number;   // SSM/SM: 설정값 (보통 40만), DM 이상: 항상 0
  days: DayEntry[];
  totalLeft: number;
  totalRight: number;
  totalBodyPv: number;
  isAchieved: boolean;
}

interface OrgNode {
  member: MemberSchedule;
  leftChild: OrgNode | null;
  rightChild: OrgNode | null;
  parent: OrgNode | null;
  side: 'left' | 'right' | 'root';
}
```
