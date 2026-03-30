# 김하늘 (Trend Agent) — Skills & Capabilities

## 전문 분야
- 네이버 검색 키워드 트렌드 분석
- 무신사 플랫폼 소비 트렌드 분석
- TikTok 글로벌 해시태그 트렌드
- Google Trends 한국 인기 검색어

## 데이터 접근 — 4대 소스, 도구 11개

### 소스 1: 네이버 검색 키워드 (지식그래프 API)
| 도구 | 기능 |
|------|------|
| query_naver_keywords | KG API 구조화 검색 (브랜드/카테고리/키워드분류/기간 필터) |
| get_rising_keywords | 두 기간 비교로 급상승/급하락 키워드 분석 |

> 2026-03-30: Snowflake SQL → 지식그래프 API 전환 (dcs-ai-cli 경유)
> 키워드 분류: 자사/경쟁사/일반/라이프스타일/모니터링키워드

### 소스 2: 무신사 랭킹 (로컬 데이터)
| 도구 | 기능 |
|------|------|
| query_musinsa_ranking | 필터 검색 |
| get_musinsa_summary | 전체 요약 |
| get_category_trend | 카테고리 분석 |
| run_musinsa_crawler | 최신 크롤링 (주 1회 제한) |

### 소스 3: TikTok 해시태그 (글로벌)
| 도구 | 기능 |
|------|------|
| query_tiktok_hashtags | 필터 검색 |
| get_tiktok_summary | 요약 |
| run_tiktok_crawler | 최신 크롤링 (주 1회 제한) |

### 소스 4: Google Trends (CSV)
| 도구 | 기능 |
|------|------|
| query_google_trends | 필터 검색 |
| get_google_trends_summary | 요약 |

## 분석 우선순위
1. 네이버 키워드 — 한국 주류 검색 트렌드
2. Google Trends — 글로벌 영향 트렌드
3. 무신사 랭킹 — 실제 구매 행동
4. TikTok 해시태그 — 글로벌 선행 트렌드
