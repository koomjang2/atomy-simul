# 깨지면 안 되는 케이스 명세 (Test Fixtures)

이 문서는 엔진 수정 전·후에 반드시 통과해야 하는 15개 케이스의 기준 명세다.
코드 레벨 테스트(`src/engine/__tests__/`)는 이 문서를 유일한 기준으로 삼는다.

---

## 핵심 원칙

### 몸PV(bodyPv) 규칙
bodyPv는 세 곳에만 관여한다:
1. **SM/SSM 직급달성 검사**: `checkSM(totalLeft, totalRight, totalBodyPv)` — bodyPv를 약한 쪽에 합산하여 각 ≥250만인지 검사
2. **상위 노드 롤업**: `sumSubtreePv()`에서 leftPv+rightPv+bodyPv 전부 합산 → 직접 상위 노드의 좌/우 누적에 반영. 무한단계 상위까지 전파. (C→B→A에서 C의 bodyPv는 B, A 모두에 합산됨)
3. bodyPv는 부족한 쪽만 채울 때 사용. 이미 달성 조건 충족 시 bodyPv=0.

**일별 매칭 점수 계산**: 좌PV와 우PV만 사용. bodyPv는 관여 안 함.
→ SM 최대 매칭 = ⌊min(totalLeft, totalRight) / 30⌋

### 이틀매칭 정의
- 1일에 L30만 입력, 2일에 R30만 입력 → **2일에 매칭 발생, 점수 획득**
- 격일로 쉬는 것이 아니라 L과 R을 서로 다른 날에 나눠 넣는 것

### 점수 롤업 원칙
SM1.score + SM2.score ≠ DM.score.
DM 점수는 매일 롤업 L/R PV 누적을 점수 테이블로 새롭게 계산한다.
- 1일 DM 좌누적 = (좌 서브트리 모든 노드의 leftPv+rightPv+bodyPv)_당일 합산
- 1일 DM 우누적 = (우 서브트리 모든 노드의 leftPv+rightPv+bodyPv)_당일 합산
- DM 총점 = Σ(일별 점수)

### SM 매칭 횟수 기준표
| SM 목표 | 최대 매칭 | 최대 점수 | 비고 |
|---------|-----------|-----------|------|
| left=250, right=210, bodyPv=40 | 7회 | 105점 | 기본형 (bodyPv로 rank 충족) |
| left=250, right=250, bodyPv=0  | 8회 | 120점 | 이미 충족, bodyPv 불필요 |
| left=250, right=240, bodyPv=10 | 8회 | 120점 | bodyPv=10으로 effRight=250 |

---

## Layer 1: simulate.js — 누적-리셋 엔진

### F01 — 하루 매칭

**입력:**
- 1일: leftPv=30, rightPv=30, bodyPv=0, isSunday=false
- 2일: leftPv=0, rightPv=0, bodyPv=0, isSunday=false

**기대 출력:**
- 1일: score=15, cumLeft=300,000, cumRight=300,000
- 2일: score=0, cumLeft=0, cumRight=0  ← 전날 점수 → 다음날 리셋

---

### F02 — 이틀 매칭 ★

**입력:**
- 1일: leftPv=30, rightPv=0, isSunday=false
- 2일: leftPv=0, rightPv=30, isSunday=false

**기대 출력:**
- 1일: score=0, cumLeft=300,000, cumRight=0  ← 매칭 안 됨, 누적 유지
- 2일: score=15, cumLeft=300,000, cumRight=300,000 → 다음날 리셋

---

### F03 — 일요일 skip

**입력:**
- 1일(일요일): leftPv=30, rightPv=30, isSunday=true
- 2일: leftPv=30, rightPv=30, isSunday=false

**기대 출력:**
- 1일: score=0, PV 누적 없음 (일요일은 연산 제외)
- 2일: score=15 (1일 PV가 누적에 포함되지 않았으므로 2일 단독으로 매칭)

---

### F04 — 몸PV는 매칭 점수에 무관 ★

**입력:**
- 1일: leftPv=20, rightPv=40, bodyPv=10, isSunday=false

**기대 출력:**
- 1일: score=0  
  ← cumL=200,000, cumR=400,000. bodyPv는 점수 계산에 관여 안 함.
  ← L=20만 < 30만 임계값 → 미매칭

**주의:** bodyPv를 cumL에 더하면 effL=30만 → score=15가 나오는 것은 틀린 동작.

---

### F05 — 점수 없는 날 누적 유지

**입력:**
- 1일: leftPv=30, rightPv=0
- 2일: leftPv=30, rightPv=0

**기대 출력:**
- 1일: score=0, cumLeft=300,000, cumRight=0
- 2일: score=0, cumLeft=600,000, cumRight=0  ← 리셋 없이 누적

---

## Layer 2: pvRules.js — 점수 테이블

### F06 — 경계값 점수

| cumLeft | cumRight | 기대 점수 |
|---------|----------|-----------|
| 299,999 | 299,999  | 0         |
| 300,000 | 300,000  | 15        |
| 699,999 | 699,999  | 15        |
| 700,000 | 700,000  | 30        |
| 1,499,999 | 1,499,999 | 30     |
| 1,500,000 | 1,500,000 | 60     |
| 2,400,000 | 2,400,000 | 90     |

---

### F07 — 비대칭 매칭

**입력:** cumLeft=300,000, cumRight=700,000

**기대 출력:** score=15  
← min(L,R)=30만이므로 30만 tier(15점). 우가 70만이어도 좌가 기준.

---

## Layer 3: fitness.js — SM 후보 생성

### F08 — SM 배치 총합

**설정:** targetLeft=250, targetRight=210, bodyPvPool=40, 영업일 13일

**기대:**
- 모든 후보 스케줄에서: Σ(days[i].leftPv) = 250
- 모든 후보 스케줄에서: Σ(days[i].rightPv) = 210
- bodyPv 합계는 40 (Phase C·D에서 배분)

---

### F09 — 이틀매칭 허용

**검증:** `generateSmCandidates` 반환 후보 중 적어도 1개에서
어떤 날짜가 leftPv>0이고 rightPv=0인 패턴이 존재.  
(같은 날 L+R 동시 배치 강제하지 않음)

---

### F10 — 영업일 배치

**검증:** 모든 후보 스케줄에서, isSunday=true인 날의 leftPv=rightPv=bodyPv=0

---

## Layer 4: optimizer.js — SM 자체 점수

### F11 — 단독 SM 105점

**트리:** SM 1명 (부모 없음)
**설정:** targetLeft=250, targetRight=210, bodyPvPool=40

**기대:**
- `runOptimization` 후 SM 자체 시뮬레이션 총점 = 105점 (7회 × 15점)
- ⌊min(250,210)/30⌋ = 7회가 최대 매칭

---

### F11b — 단독 SM 120점

**트리:** SM 1명 (부모 없음)
**설정:** targetLeft=250, targetRight=250, bodyPvPool=0

**기대:**
- `runOptimization` 후 SM 자체 시뮬레이션 총점 = 120점 (8회 × 15점)
- ⌊min(250,250)/30⌋ = 8회가 최대 매칭

---

### F12 — DM 최소 달성 트리 (롤업 검증)

**트리:**
```
DM
├── 좌: SM1 (직속)
│   └── 좌: SM2 (SM1의 하위)
└── 우: SM3 (직속)
    └── 우: SM4 (SM3의 하위)
```
**설정:** 각 SM targetLeft=250, targetRight=250, bodyPv=0

**기대:**
1. 각 SM 자체 점수 = 120점 (8회 × 15점)
2. DM 일별 점수 = getScore(DM 좌누적_당일, DM 우누적_당일) — SM 점수 합산(480점)이 아님
3. DM 좌누적_day1 = SM1(leftPv+rightPv+bodyPv)_day1 + SM2(leftPv+rightPv+bodyPv)_day1

---

## Layer 5: SRM 중첩 트리 (회귀 테스트)

SRM 최소 달성 구조:
```
SRM
├── 좌: DM1
│   ├── 좌: DM2
│   │   ├── 좌: SM1 → SM2 (SM1의 하위)   ← DM2 소유
│   │   └── 우: SM3 → SM4 (SM3의 하위)   ← DM2 소유
│   └── 우: SM5 → SM6 (SM5의 하위)        ← DM1 소유
└── 우: DM3
    ├── 좌: DM4
    │   ├── 좌: SM7 → SM8                 ← DM4 소유
    │   └── 우: SM9 → SM10                ← DM4 소유
    └── 우: SM11 → SM12                   ← DM3 소유
```
DM4명 + SM12명 = 합계 16명

### F13 — 중첩 DM 8회 회귀 ★

**트리:** 위 SRM 좌측 절반 (SRM → DM1 → DM2 → SM1~4, DM1우 SM5~6)
**설정:** 각 SM targetLeft=250, targetRight=250, bodyPv=0

**기대:**
- DM2 소유 SM1, SM2, SM3, SM4 각각 120점 (8회)
- DM1 소유 SM5, SM6 각각 120점 (8회)
- **optimizer가 7회로 깎으면 실패** (한계1 회귀)

---

### F14 — SRM 완전 트리 독립성

**트리:** 위 전체 SRM 구조 (DM4명, SM12명)
**설정:** 각 SM targetLeft=250, targetRight=250, bodyPv=0

**기대:**
- 각 DM 소유 SM들이 독립적으로 120점 달성
- DM1 일별 좌누적 = (DM2 소유 SM1~4의 좌+우)_당일 합산 + (DM1 직속 SM5~6의 좌+우)_당일
- SRM 일별 좌누적 = DM1 좌누적 + DM2 좌누적 전체 합산

---

## Layer 6: bodyPv 분배

### F15 — bodyPv 전량 배분

**설정:** SM 1명, bodyPvPool=40

**기대:**
- `runOptimization` 후 Σ(days[i].bodyPv) = 40 (전량 배분됨)
