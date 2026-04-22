# 애터미 직급표 시뮬레이터

애터미 네트워크 마케팅 직급 달성 최적화 웹앱.

## 빠른 시작

```bash
npm create vite@latest . -- --template react
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm run dev
```

## 문서 구조

```
atomy-simulator/
├── CLAUDE.md          ← Claude Code 자동 로드 (프로젝트 개요 + 개발 규칙)
├── docs/
│   ├── pv_rules.md    ← 바이너리 규칙 + 후원수당 테이블
│   ├── rank_logic.md  ← 직급 달성 조건 (SSM ~ IM)
│   ├── algorithm.md   ← 몸PV 최적화 4단계 알고리즘 (핵심)
│   └── ui_spec.md     ← 화면 구성 및 UX 명세
└── src/
    ├── components/
    │   ├── OrgTree/       ← 조직 트리 패널
    │   ├── ScheduleTable/ ← 직급표 테이블
    │   └── SummaryPanel/  ← 수당 계산 요약
    ├── engine/
    │   ├── calculator.js  ← 점수/수당 계산 로직
    │   ├── optimizer.js   ← 4단계 최적화 알고리즘
    │   └── rollup.js      ← 상향식 PV 집계
    └── App.jsx
```

## Claude Code에서 시작하기

```bash
cd atomy-simulator
claude  # Claude Code 실행 → CLAUDE.md 자동 로드
```

Claude Code에게 첫 지시:
> "CLAUDE.md와 docs/ 폴더를 읽고, 핵심 계산 엔진부터 만들어줘.
>  calculator.js (점수 계산) → optimizer.js (4단계 알고리즘) 순으로 진행해."
