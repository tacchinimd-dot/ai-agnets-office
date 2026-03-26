# AI Agents Office — Project Status

> 최종 업데이트: 2026-03-25

## 프로젝트 개요

AI 에이전트 5명이 사무실에서 일하는 모습을 시뮬레이션하는 2D 캔버스 애플리케이션.
Node.js 백엔드 + Claude API를 연동하여 사용자가 에이전트와 1:1 또는 전체 회의 형태로 실시간 대화가 가능한 시스템. Phase 1(채팅 시스템) 구현 완료, API 키 설정 후 즉시 사용 가능.

## 아키텍처

```
[브라우저]                        [서버]              [외부]
┌──────────────┐                ┌──────────┐      ┌───────────┐
│ 2D 오피스    │  ←WebSocket→   │ Node.js  │ ───▶ │ Claude API│
│ + 채팅 패널  │                │ Express  │      │ (Haiku)   │
└──────────────┘                └──────────┘      └───────────┘
```

## 파일 구조

```
C:\Users\AD0903\ai_office_project\
├── ai_agents_office.html   ← 프론트엔드 (2D 오피스 + 채팅 UI)
├── server/                  ← Node.js 백엔드
│   ├── index.js             ← Express + WebSocket 서버 + tool_use 루프
│   ├── agents.js            ← 에이전트별 system prompt & 대화 관리
│   ├── snowflake.js         ← Snowflake 연결 + 안전한 쿼리 실행
│   ├── tools.js             ← 최재원용 Claude tool_use 도구 정의
│   ├── competitors.js       ← 경쟁사 데이터 로더 (Excel/JSON → 메모리)
│   ├── market-tools.js      ← 이서연용 Claude tool_use 도구 정의
│   ├── trend-tools.js       ← 김하늘용 Claude tool_use 도구 정의 (무신사)
│   ├── bundle-data.js       ← 로컬 데이터 → server/data/ 번들링 스크립트
│   ├── data/                ← 번들 데이터 (Render 배포용)
│   │   ├── competitors.json  ← 경쟁사 5개 브랜드 839개 상품
│   │   ├── musinsa_ranking.json ← 무신사 Top 100 랭킹
│   │   └── tiktok_hashtags.json ← TikTok Top 100 해시태그
│   ├── .env                 ← API 키 + Snowflake 접속 정보 (gitignore)
│   └── package.json
├── PROJECT_STATUS.md
├── CLAUDE.md
└── .gitignore
```

## 에이전트 현황

| ID | 이름 | 역할 | 색상 | 성별 |
|----|------|------|------|------|
| 0 | 한준혁 | CEO / 전략 총괄 | #4A85D8 | 남 |
| 1 | 이서연 | Market Agent / 시장·경쟁 분석가 | #3AB87A | 여 |
| 2 | 김하늘 | Trend Agent / 고객 트렌드 분석가 | #D4A017 | 여 |
| 3 | 박도현 | Product Planning / 상품 기획 MD | #E05040 | 남 |
| 4 | 최재원 | Data Analyst / 데이터 분석가 | #9055D8 | 남 |

### 에이전트별 데이터 접근 현황

| 에이전트 | tool_use | 데이터 소스 | 도구 수 | 상태 |
|---------|----------|-----------|---------|------|
| 한준혁 (CEO) | - | 없음. 회의에서 타 에이전트 발언을 종합하여 의사결정 | 0 | ✅ |
| 이서연 (Market) | ✅ | 경쟁사 크롤링 데이터 (Alo/Wilson/Sergio/RL/Lacoste, 839개 상품) | 3 | ✅ |
| 김하늘 (Trend) | ✅ | 네이버 키워드(Snowflake) + Google Trends(CSV) + 무신사 랭킹(크롤러) + TikTok 해시태그(크롤러) | 11 | ✅ |
| 박도현 (Product) | - | 데이터 미제공 (추후 연결 예정) | 0 | ⏳ 대기 |
| 최재원 (Data) | ✅ | Snowflake `FNF.PRCS.DB_SCS_W` 주차별 판매/입고/재고 데이터 | 2 | ✅ (비밀번호 설정 필요) |

#### 김하늘 4대 데이터 소스 상세

| 소스 | 유형 | 데이터 | 도구 |
|------|------|-------|------|
| 네이버 키워드 | Snowflake (PRCS/MKT) | 10년치 22K 키워드 주차별 검색량 | query_naver_keywords, get_rising_keywords |
| Google Trends | CSV (수동 업로드) | 한국 구글 7일 인기 검색어 ~500개 | query_google_trends, get_google_trends_summary |
| 무신사 랭킹 | 크롤러 + JSON | 일간 Top 100 상품/판매/조회/전환율 | query_musinsa_ranking, get_musinsa_summary, get_category_trend, run_musinsa_crawler |
| TikTok 해시태그 | 크롤러 + JSON | 글로벌 7일 Top 100 해시태그/조회수 | query_tiktok_hashtags, get_tiktok_summary, run_tiktok_crawler |

> 김하늘의 데이터는 김하늘만 직접 조회 가능. 다른 에이전트는 회의 대화를 통해서만 전달받음.

## 사무실 레이아웃

- **CEO Room**: 좌측 상단 (20,60) 270x360 — 책장, 소파, 화분
- **워크스테이션**: 중앙 2x2 그리드 (600/900 x 370/620)
- **Meeting Room 1**: 우측 상단 (1290,60) 285x400
- **Meeting Room 2**: 우측 하단 (1290,460) 285x400
- **기타**: 워터쿨러(1255,490), 화분 4곳, 천장 조명 4개

## 구현 완료

### Phase 0 — 2D 오피스 시뮬레이션
- [x] HTML5 Canvas 2D 렌더링 (1600x900)
- [x] 나무 판자 배경 (Seeded RNG, 오프스크린 캔버스)
- [x] 에이전트 5인 — 정장 차림 사람형 캐릭터 (남3/여2)
- [x] 뒷모습 렌더링 (showBack=true) — 모니터를 향해 앉은 모습
- [x] 렌더링 순서: 모니터(배경) → 책상 → 캐릭터(전면) → 의자(최전면)
- [x] State machine: idle → visit/hosting → meeting → returning
- [x] 의미 있는 이동만 (회의실 방문 시에만 자리 이탈)
- [x] 부재중 표시 (자리 비움 시 빨간 뱃지 + 모니터 꺼짐)
- [x] 마우스 호버 한국어 툴팁 (역할/현재업무/대기업무/핵심질문)
- [x] 에이전트 카드 UI 패널 (하단, 클릭 시 채팅 전환)
- [x] Y-sorting 깊이 처리
- [x] 회의 중 점선 연결선
- [x] 눈 깜빡임 / 걷기 애니메이션
- [x] CEO Room / Meeting Room 인테리어
- [x] /office 슬래시 커맨드

### Phase 1 — 채팅 시스템 (완료)
- [x] Node.js 백엔드 (Express + WebSocket + Claude API 스트리밍)
- [x] 에이전트별 system prompt (역할/성격/말투/전문분야 정의)
- [x] HTML 우측 채팅 패널 UI (탭 전환, Welcome 화면, 자동 스크롤)
- [x] 에이전트 1:1 대화 (캔버스 클릭 or 카드 클릭 → 채팅 전환)
- [x] 전체 회의 모드 (CEO→Market→Trend→Product→Data 순차 응답, 컨텍스트 전달)
- [x] WebSocket 자동 연결 / 재연결 / 연결 상태 표시
- [x] 대화 초기화 (클라이언트 + 서버 컨텍스트 동시 리셋)
- [x] 마크다운 기본 지원 (굵게, 인라인 코드)

### Phase 2 — Snowflake Tool Use (완료)
- [x] snowflake-sdk 연동 (Node.js → Snowflake FNF.PRCS.DB_SCS_W)
- [x] 최재원(Data Analyst) 전용 Claude tool_use 구현
- [x] 도구: query_snowflake (자유 SELECT), get_weekly_summary (주차별 요약)
- [x] 안전장치: SELECT-only, 200행 제한, 30초 타임아웃, SQL injection 방어
- [x] tool_use 루프 (최대 5회 반복, 다단계 분석 가능)
- [x] 최재원 system prompt에 DB 스키마/채널 규칙/분석 가이드 포함
- [x] Snowflake 사전 연결 + 연결 상태 로깅

### Phase 2.5 — 이서연 경쟁사 데이터 연동 (완료)
- [x] 경쟁사 5개 브랜드 데이터 로컬 로드 (Excel/JSON → 메모리, 839개 상품)
- [x] 이서연(Market Agent) 전용 Claude tool_use 구현
- [x] 도구: query_competitors (필터 검색), get_brand_summary (요약 통계), compare_brands (브랜드 비교)
- [x] 데이터 소스: Alo Yoga(254), Wilson(115), Sergio Tacchini(50), Ralph Lauren(229), Lacoste(191)
- [x] 통일 포맷 변환 (가격/카테고리/Vision AI 감성/스타일 속성)
- [x] 이서연 system prompt에 경쟁사 데이터 활용 가이드 포함
- [x] 서버 시작 시 자동 로드 + 로드 상태 로깅

### Phase 2.6 — 김하늘 무신사 트렌드 데이터 연동 (완료)
- [x] 무신사 일간 랭킹 Top 100 데이터 로드
- [x] 김하늘(Trend Agent) 전용 Claude tool_use 구현
- [x] 도구: query_musinsa_ranking (필터 검색), get_musinsa_summary (전체 요약), get_category_trend (카테고리 분석)
- [x] 데이터: 순위/브랜드/가격/할인율/카테고리/누적판매량/조회수/전환율
- [x] 데이터 접근 권한: 김하늘만 직접 조회 가능, 다른 에이전트는 회의 대화로만 전달

### Phase 2.7 — Render 배포 준비 (완료)
- [x] 루트 package.json + render.yaml 생성
- [x] 경쟁사/무신사/TikTok 데이터를 server/data/에 JSON 번들링
- [x] competitors.js 로컬→번들 폴백 로직
- [x] index.html 통일 (ai_agents_office.html = index.html)
- [x] GitHub 레포 생성 + 초기 커밋

### Phase 2.8 — 김하늘 Snowflake + 크롤러 + Google Trends 연동 (완료)
- [x] 네이버 키워드 Snowflake 연동 (PRCS.DB_SRCH_KWD_NAVER_W + MKT 테이블 4개)
- [x] 무신사 크롤러 직접 실행 도구 (주 1회 제한, 히스토리 누적, 날짜 탭 대시보드)
- [x] TikTok 해시태그 크롤러 직접 실행 도구 (주 1회 제한)
- [x] Google Trends CSV 자동 로드 (최신 파일 자동 감지)
- [x] 4대 데이터 소스 교차분석 프레임 (네이버/구글/무신사/TikTok)

## 미구현 / 추후 작업 (Phase 3+)

- [ ] 박도현(Product Planning) 데이터 연결 (추후 데이터 제공 시)
- [ ] Snowflake에 전체 브랜드 데이터 업로드 (권한 확보 후)
- [ ] Snowflake 비밀번호 설정 → 최재원/김하늘 Snowflake 도구 활성화
- [ ] Render.com 배포 + 환경변수 등록
- [ ] 전체 회의 모드에서 이서연/김하늘/최재원 tool_use 지원
- [ ] 에이전트 작업 결과물 패널
- [ ] SKILL / STATUS 뱃지 시스템

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-24 | wander(무의미 산책) 제거, 회의실 이동만 남김 |
| 2026-03-24 | 부재중 표시 추가 (빨간 뱃지 + 모니터 꺼짐) |
| 2026-03-24 | 워크스테이션 방향 반전 — 캐릭터가 모니터 앞에 앉아 뒷모습 보임 |
| 2026-03-24 | PROJECT_STATUS.md / CLAUDE.md / .gitignore 생성 |
| 2026-03-25 | Phase 1 완료 — Node.js 백엔드 + 채팅 패널 UI + WebSocket 스트리밍 |
| 2026-03-26 | Phase 2.8 완료 — 김하늘 4대 소스 연동 (네이버/구글/무신사/TikTok, 도구 11개) |
| 2026-03-26 | Phase 2.7 완료 — Render 배포 준비 (루트 package.json, 데이터 번들링, GitHub) |
| 2026-03-26 | Phase 2.6 완료 — 김하늘 무신사 랭킹 tool_use 연동 (Top 100) |
| 2026-03-26 | Phase 2.5 완료 — 이서연 경쟁사 데이터 tool_use 연동 (839개 상품) |
| 2026-03-26 | Phase 2 완료 — 최재원 Snowflake tool_use 연동 |
| 2026-03-24 | 초기 버전 완성 (단일 HTML 파일) |

## API 비용 추정 (향후 참고)

| 시나리오 | Haiku 4.5 | Sonnet 4.6 |
|---|---|---|
| 회의실 대화만 (8h) | $0.05~0.15/일 | $0.30~0.60/일 |
| 주기적 분석 추가 | $0.20~0.40/일 | $0.80~1.50/일 |
| 실시간 연속 협업 | $1.00~3.00/일 | $5.00~15.00/일 |
