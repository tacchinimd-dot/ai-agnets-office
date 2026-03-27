# AI Agents Office — Project Status

> 최종 업데이트: 2026-03-26

## 프로젝트 개요

AI 에이전트 5명이 사무실에서 일하는 모습을 시뮬레이션하는 2D 캔버스 애플리케이션.
Node.js 백엔드 + Claude API(Haiku 4.5)를 연동하여 사용자가 에이전트와 1:1 또는 전체 회의 형태로 실시간 대화가 가능한 시스템.
**5명 전원이 각자의 데이터 소스를 보유** — Snowflake, 크롤러, 로컬 파일을 Claude tool_use로 연결하여 데이터 기반 의사결정이 가능.
GitHub 연동 완료, Render.com 배포 준비 완료.

## 아키텍처

```
[브라우저]                        [서버]                    [외부]
┌──────────────┐                ┌──────────────┐      ┌───────────────┐
│ 2D 오피스    │  ←WebSocket→   │ Node.js      │ ───▶ │ Claude API    │
│ + 채팅 패널  │                │ Express      │      │ (Haiku 4.5)   │
└──────────────┘                │              │      └───────────────┘
                                │  tool_use ↕  │      ┌───────────────┐
                                │  이서연: 경쟁사│ ───▶ │ Snowflake     │
                                │  김하늘: 트렌드│      │ (FNF.PRCS/MKT)│
                                │  박도현: 상품  │      └───────────────┘
                                │  최재원: 판매  │      ┌───────────────┐
                                │              │ ───▶ │ Python 크롤러  │
                                └──────────────┘      │ (무신사/TikTok)│
                                                      └───────────────┘
```

## 파일 구조

```
C:\Users\AD0903\ai_office_project\
├── ai_agents_office.html        ← 프론트엔드 (2D 오피스 + 채팅 UI)
├── index.html                   ← ai_agents_office.html 복사 (Render용)
├── package.json                 ← 루트 (Render 빌드/시작 커맨드)
├── render.yaml                  ← Render.com 배포 설정
│
├── server/                      ← Node.js 백엔드
│   ├── index.js                 ← Express + WebSocket + tool_use 루프 (5명 전원)
│   ├── agents.js                ← 에이전트별 system prompt & 대화 관리
│   ├── snowflake.js             ← Snowflake 연결 + 안전한 쿼리 실행
│   ├── tools.js                 ← 최재원용 도구 (판매 실적 분석)
│   ├── product-tools.js         ← 박도현용 도구 (상품 기획/원가/카테고리)
│   ├── market-tools.js          ← 이서연용 도구 (경쟁사 비교)
│   ├── trend-tools.js           ← 김하늘용 도구 (무신사/TikTok/네이버/구글)
│   ├── competitors.js           ← 경쟁사 데이터 로더 (Excel/JSON → 메모리)
│   ├── bundle-data.js           ← 로컬 데이터 → server/data/ 번들링 스크립트
│   ├── data/                    ← 번들 데이터 (Render 배포용)
│   │   ├── competitors.json     ← 경쟁사 5개 브랜드 839개 상품
│   │   ├── musinsa_ranking.json ← 무신사 Top 100 랭킹
│   │   └── tiktok_hashtags.json ← TikTok Top 100 해시태그
│   ├── .env                     ← API 키 + Snowflake 접속 정보 (gitignore)
│   └── package.json
│
├── Consumer Trend Agent/        ← 김하늘 전용 데이터 폴더
│   ├── musinsa_rank/            ← 무신사 랭킹 크롤러 + 히스토리 대시보드
│   ├── tiktok_hashtag_crawler/  ← TikTok 해시태그 크롤러 + 결과
│   └── google_trend_keyword/    ← Google Trends CSV (수동 업로드)
│
├── PROJECT_STATUS.md
├── CLAUDE.md
└── .gitignore
```

**GitHub:** https://github.com/tacchinimd-dot/ai-agnets-office (public)

## 에이전트 현황

| ID | 이름 | 역할 | 색상 | 성별 |
|----|------|------|------|------|
| 0 | 한준혁 | CEO / 전략 총괄 | #4A85D8 | 남 |
| 1 | 이서연 | Market Agent / 시장·경쟁 분석가 | #3AB87A | 여 |
| 2 | 김하늘 | Trend Agent / 고객 트렌드 분석가 | #D4A017 | 여 |
| 3 | 박도현 | Product Planning / 상품 기획 MD | #E05040 | 남 |
| 4 | 최재원 | Data Analyst / 데이터 분석가 | #9055D8 | 남 |

### 에이전트별 데이터 접근 현황 (전원 연결 완료)

| 에이전트 | tool_use | 데이터 소스 | 도구 수 | 핵심 질문 |
|---------|----------|-----------|---------|----------|
| 한준혁 (CEO) | - | 없음. 회의에서 타 에이전트 발언을 종합하여 의사결정 | 0 | "전략 방향은?" |
| 이서연 (Market) | ✅ | 경쟁사 크롤링 5개 브랜드 839개 상품 | 3 | "경쟁사는 뭘 하는가?" |
| 김하늘 (Trend) | ✅ | 네이버 키워드 + Google Trends + 무신사 + TikTok | 11 | "사람들은 뭘 원하는가?" |
| 박도현 (Product) | ✅ | 상품 마스터 + 카테고리 판매 + 원가 + 상품 랭킹 (Snowflake) | 3 | "뭘 만들어야 하는가?" |
| 최재원 (Data) | ✅ | 채널별 판매 실적 DB_SCS_W (Snowflake) | 2 | "전략이 맞는가?" |

#### 이서연 (Market Agent) — 경쟁사 분석 도구 3개

| 도구 | 기능 |
|------|------|
| query_competitors | 5개 브랜드 상품 필터 검색 (가격/카테고리/소재/Vision AI) |
| get_brand_summary | 브랜드별 요약 통계 |
| compare_brands | 브랜드 간 지표 비교 (가격/카테고리/감성/소재) |

> 데이터: Alo Yoga(254), Wilson(115), Sergio Tacchini(50), Ralph Lauren(229), Lacoste(191)

#### 김하늘 (Trend Agent) — 4대 데이터 소스, 도구 11개

| 소스 | 유형 | 데이터 | 도구 |
|------|------|-------|------|
| 네이버 키워드 | Snowflake (PRCS/MKT) | 10년치 22K 키워드 주차별 검색량 | query_naver_keywords, get_rising_keywords |
| Google Trends | CSV (수동 업로드) | 한국 구글 7일 인기 검색어 ~500개 | query_google_trends, get_google_trends_summary |
| 무신사 랭킹 | 크롤러 + JSON | 일간 Top 100 상품/판매/조회/전환율 | query_musinsa_ranking, get_musinsa_summary, get_category_trend, run_musinsa_crawler |
| TikTok 해시태그 | 크롤러 + JSON | 글로벌 7일 Top 100 해시태그/조회수 | query_tiktok_hashtags, get_tiktok_summary, run_tiktok_crawler |

> 김하늘의 데이터는 김하늘만 직접 조회 가능. 다른 에이전트는 회의 대화를 통해서만 전달받음.
> 무신사/TikTok 크롤러는 주 1회 직접 실행 가능.

#### 박도현 (Product Planning) — 상품 기획 도구 3개

| 도구 | 기능 |
|------|------|
| query_product_db | 7개 Snowflake 테이블 자유 쿼리 (상품/원가/랭킹/재고/가격) |
| get_category_performance | 카테고리별 주차 판매+재고 성과 |
| get_top_selling_styles | 자사 상품 판매 랭킹 TOP N |

> 주요 테이블: DB_PRDT(상품 마스터), CTGR_SALES_W(카테고리 판매), DB_COST_MST(원가), DM_FNF_PRDT_RNK_W(상품 랭킹)

#### 최재원 (Data Analyst) — 판매 실적 도구 2개

| 도구 | 기능 |
|------|------|
| query_snowflake | DB_SCS_W 자유 쿼리 (채널별 판매/입고/재고) |
| get_weekly_summary | 최근 N주 채널별 판매 요약 |

> 박도현과 최재원의 차이: 같은 Snowflake이지만 다른 테이블, 다른 관점
> - 최재원: "CNS 채널 매출 15% 하락" (실적 검증)
> - 박도현: "레깅스 SKU 늘리고 마크업 3.2배 유지" (상품 기획)

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

### Phase 2.9 — 박도현 상품 기획 데이터 연동 (완료)
- [x] 박도현(Product Planning) 전용 Claude tool_use 구현
- [x] 도구: query_product_db (7개 테이블 자유 쿼리), get_category_performance (카테고리 판매+재고), get_top_selling_styles (판매 랭킹)
- [x] Snowflake 테이블: DB_PRDT(상품 마스터), CTGR_SALES_W(카테고리 판매), DB_COST_MST(원가), DM_FNF_PRDT_RNK_W(상품 랭킹), DB_SCS_STOCK(재고), DW_PRDT_PRICE(가격), DB_PRDT_SIMILAR_ML(유사상품)
- [x] 최재원과 역할 분리: 최재원=실적 검증(DB_SCS_W), 박도현=상품 기획(DB_PRDT+CTGR_SALES_W+DB_COST_MST)
- [x] 기획 분석 가이드 포함 (재고회전율, 마크업, 소재/핏 패턴 분석)

### Phase 3.0 — 전체 회의 모드 tool_use 지원 (완료)
- [x] 회의 모드에서 에이전트별 도구(tool_use) 활성화 (이서연/김하늘/박도현/최재원)
- [x] 회의 중 tool_use 루프 지원 (최대 3회, 속도와 깊이 균형)
- [x] 데이터 조회 중 실시간 알림 ("📊 데이터 조회 중...")
- [x] 회의 컨텍스트에 "필요 시 도구 사용" 안내 포함
- [x] getToolsForAgent() 헬퍼로 handleChat/handleMeeting 도구 매핑 통합

### Phase 3.1 — 에이전트 작업 결과물 패널 (완료)
- [x] 채팅 패널에 "💬 채팅 | 📊 결과물" 모드 토글 추가
- [x] 서버: tool 실행 시 tool_activity WebSocket 메시지 전송
- [x] 서버: TOOL_LABELS 한국어 매핑 (19개 도구), buildResultPreview 요약 생성
- [x] 프론트엔드: 결과물 카드 UI (에이전트 색상, 도구명, 입력 요약, 결과 프리뷰, 시간, 데이터 크기)
- [x] 에이전트별 필터 기능 (전체 / 에이전트별 필터 버튼)
- [x] 결과 건수 뱃지 (📊 결과물 버튼에 실시간 카운트)
- [x] 성공/오류 시각적 구분 (초록/빨강 좌측 보더)
- [x] index.html 동기화

### Phase 4.0 — 에이전트 간 자동 협업 (완료)
- [x] 🤝 협업 탭 추가 (채팅 탭 목록)
- [x] 에이전트 선택 UI: 순서대로 클릭하여 협업 체인 구성
- [x] 플로우 시각화: 이서연 → 박도현 → 최재원 형태
- [x] 서버 handleCollaboration: 순차 처리 + 컨텍스트 전달 + tool_use 지원
- [x] 캔버스: 협업 에이전트들이 Meeting Room 2로 이동
- [x] 회의록 자동 기록 + STATUS 자동 업데이트
- [x] 에이전트별 STATUS.md/SKILLS.md/logs/ 폴더 구조 생성

### Phase 3.4 — 회의록 + 결재 대기 시스템 (완료)
- [x] 결과물 탭 → 회의록 탭(📋)으로 변경
- [x] 회의록 자동 기록: 사용자 지시, 에이전트 응답, 회의 발언, 데이터 조회
- [x] 회의록 필터: 타입별(지시/1:1/회의/데이터) + 에이전트별
- [x] 결재 대기 탭(🔔) 추가
- [x] CEO 결재 요청: [결재요청] 구조화된 형식으로 의사결정 요청
- [x] 사용자 승인/반려 + 코멘트 → CEO에게 피드백 전달
- [x] 결재 상태 시각화: 대기(노랑), 승인(초록), 반려(빨강)
- [x] 결재 대기 건수 뱃지

### Phase 3.3 — 캔버스-채팅 이벤트 연동 (완료)
- [x] 랜덤 회의 제거, 채팅 이벤트로만 캔버스 이동
- [x] 전체 회의 → 5명 회의실 이동, 회의 종료 → 자리 복귀
- [x] 1:1 대화 → 모니터 glow + 말풍선 효과
- [x] 자리 비움 뱃지: 회의 중(보라) / 부재중(빨강) 구분

### Phase 3.2 — SKILL / STATUS 뱃지 시스템 (완료)
- [x] AGENT_SKILLS 설정: 에이전트별 데이터 소스 뱃지 (이서연 1개, 김하늘 4개, 박도현 2개, 최재원 1개)
- [x] agentLiveStatus 실시간 상태 추적 (idle/responding/querying/meeting/walking)
- [x] 캔버스: STATUS pill (이름 위, 색상별 상태 표시, querying/responding 시 펄스 애니메이션)
- [x] 캔버스: SKILL dots (이름 옆, 데이터 소스별 색상 점)
- [x] 에이전트 카드: SKILL 태그 (색상 배경 + 아이콘 + 라벨)
- [x] 에이전트 카드: STATUS dot (상태 색상 표시 + 펄스 애니메이션)
- [x] 툴팁: 데이터 소스 섹션 추가 + 라이브 상태 색상 반영
- [x] WS 이벤트 연동: stream_start→responding, tool_activity→querying, stream_end→idle, meeting→meeting
- [x] 캔버스 state machine 연동: visit/hosting→walking, meeting→meeting, returning→walking, idle→idle

**→ Phase 2 완료: 5명 전원 데이터 연결 (CEO 제외, 의도적)**

## 미구현 / 추후 작업 (Phase 3+)

- [ ] Snowflake 비밀번호 설정 → 최재원/김하늘/박도현 Snowflake 도구 활성화 (관리자에게 로컬 비밀번호 또는 서비스 계정 요청 필요)
- [x] Render.com 배포 완료 → https://ai-agnets-office.onrender.com/
- [ ] Snowflake에 전체 브랜드 데이터 업로드 (권한 확보 후)
- [x] 전체 회의 모드에서 에이전트 tool_use 지원
- [x] 에이전트 작업 결과물 패널
- [x] SKILL / STATUS 뱃지 시스템

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-24 | wander(무의미 산책) 제거, 회의실 이동만 남김 |
| 2026-03-24 | 부재중 표시 추가 (빨간 뱃지 + 모니터 꺼짐) |
| 2026-03-24 | 워크스테이션 방향 반전 — 캐릭터가 모니터 앞에 앉아 뒷모습 보임 |
| 2026-03-24 | PROJECT_STATUS.md / CLAUDE.md / .gitignore 생성 |
| 2026-03-25 | Phase 1 완료 — Node.js 백엔드 + 채팅 패널 UI + WebSocket 스트리밍 |
| 2026-03-26 | **Phase 2 전체 완료** — 5명 전원 데이터 연결, 총 도구 19개 |
| 2026-03-26 | Phase 2.9 완료 — 박도현 상품 기획 tool_use 연동 (7개 Snowflake 테이블) |
| 2026-03-26 | Phase 2.8 완료 — 김하늘 4대 소스 연동 (네이버/구글/무신사/TikTok, 도구 11개) |
| 2026-03-26 | Phase 2.7 완료 — Render 배포 준비 (루트 package.json, 데이터 번들링, GitHub) |
| 2026-03-26 | Phase 2.6 완료 — 김하늘 무신사 랭킹 tool_use 연동 (Top 100) |
| 2026-03-26 | Phase 2.5 완료 — 이서연 경쟁사 데이터 tool_use 연동 (839개 상품) |
| 2026-03-26 | Phase 2 완료 — 최재원 Snowflake tool_use 연동 |
| 2026-03-27 | Render.com Web Service 배포 완료 (https://ai-agnets-office.onrender.com/) |
| 2026-03-27 | **Phase 4.0 완료** — 에이전트 간 자동 협업 (선택적 체인, Meeting Room 2, 연쇄 분석) |
| 2026-03-27 | **Phase 3.4 완료** — 회의록 + 결재 대기 시스템 (자동 기록, CEO 결재 요청/승인/반려) |
| 2026-03-27 | **Phase 3.3 완료** — 캔버스-채팅 이벤트 연동 (랜덤 회의 제거, 채팅 트리거) |
| 2026-03-27 | **Phase 3.2 완료** — SKILL/STATUS 뱃지 시스템 (캔버스+카드+툴팁, 실시간 상태 추적) |
| 2026-03-27 | **Phase 3.1 완료** — 에이전트 작업 결과물 패널 (도구 활동 카드, 필터, 뱃지) |
| 2026-03-27 | **Phase 3.0 완료** — 전체 회의 모드 tool_use 지원 (4명 에이전트 도구 활성화) |
| 2026-03-27 | Snowflake 연동 시도 — SSO 전용 계정으로 확인, 관리자에게 로컬 비밀번호 요청 필요 |
| 2026-03-24 | 초기 버전 완성 (단일 HTML 파일) |

## API 비용 추정 (향후 참고)

| 시나리오 | Haiku 4.5 | Sonnet 4.6 |
|---|---|---|
| 회의실 대화만 (8h) | $0.05~0.15/일 | $0.30~0.60/일 |
| 주기적 분석 추가 | $0.20~0.40/일 | $0.80~1.50/일 |
| 실시간 연속 협업 | $1.00~3.00/일 | $5.00~15.00/일 |
